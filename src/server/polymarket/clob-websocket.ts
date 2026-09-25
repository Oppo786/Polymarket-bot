/**
 * Polymarket CLOB WebSocket & Real-time Market Data Service
 * Connects to official wss://ws-subscriptions-clob.polymarket.com/ws/market,
 * subscribes to UP and DOWN token IDs, tracks Best Bid, Best Ask, Last Trade,
 * Mid Price, Spread, and handles automatic reconnection and REST polling sync.
 */

import WebSocket from 'ws';
import {
  Btc5mMarket,
  MarketPriceData,
  OrderBook,
  PublicTrade,
  OutcomeType,
} from '../types.js';
import { eventBus } from '../events/event-bus.js';
import { btcPriceFeed } from '../market/btc-price-feed.js';

export type PriceUpdateListener = (data: MarketPriceData) => void;

class ClobWebSocketService {
  private ws: WebSocket | null = null;
  private wsUrl: string = process.env.POLYMARKET_WS_HOST || 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
  private clobHost: string = process.env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';
  private currentMarket: Btc5mMarket | null = null;
  private priceListeners: Set<PriceUpdateListener> = new Set();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private restSyncInterval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private shouldRun: boolean = false;

  private latestPriceData: MarketPriceData | null = null;
  private upOrderBook: OrderBook | null = null;
  private downOrderBook: OrderBook | null = null;
  private recentTrades: PublicTrade[] = [];

  public onPriceUpdate(listener: PriceUpdateListener): void {
    this.priceListeners.add(listener);
  }

  public getLatestPriceData(): MarketPriceData | null {
    return this.latestPriceData;
  }

  public getOrderBook(outcome: OutcomeType): OrderBook | null {
    return outcome === 'UP' ? this.upOrderBook : this.downOrderBook;
  }

  public getRecentTrades(): PublicTrade[] {
    return this.recentTrades;
  }

  public isWsConnected(): boolean {
    return this.isConnected;
  }

  public start(): void {
    if (this.shouldRun) return;
    this.shouldRun = true;
    this.connect();
    this.startRestSync();
  }

  public stop(): void {
    this.shouldRun = false;
    this.disconnect();
    if (this.restSyncInterval) {
      clearInterval(this.restSyncInterval);
      this.restSyncInterval = null;
    }
  }

  public updateMarket(market: Btc5mMarket): void {
    const isNew = !this.currentMarket || this.currentMarket.slug !== market.slug;
    this.currentMarket = market;

    if (isNew) {
      // Reset books and seed price baseline
      this.initPriceState(market);
      // Resubscribe if WebSocket is open
      this.sendSubscription();
      // Fetch fresh orderbook and midpoint via REST
      this.fetchMarketRestData();
    }
  }

  private initPriceState(market: Btc5mMarket): void {
    const now = Date.now();
    this.latestPriceData = {
      marketId: market.id,
      timestamp: now,
      btcPrice: btcPriceFeed.getPrice(),
      up: {
        tokenId: market.upTokenId,
        lastTrade: 0.50,
        bestBid: 0.49,
        bestAsk: 0.51,
        midPrice: 0.50,
        bidSize: 250,
        askSize: 250,
        spread: 0.02,
      },
      down: {
        tokenId: market.downTokenId,
        lastTrade: 0.50,
        bestBid: 0.49,
        bestAsk: 0.51,
        midPrice: 0.50,
        bidSize: 250,
        askSize: 250,
        spread: 0.02,
      },
    };

    this.upOrderBook = {
      marketId: market.id,
      outcome: 'UP',
      tokenId: market.upTokenId,
      bids: [
        { price: 0.49, size: 250 },
        { price: 0.48, size: 500 },
        { price: 0.47, size: 1000 },
      ],
      asks: [
        { price: 0.51, size: 250 },
        { price: 0.52, size: 500 },
        { price: 0.53, size: 1000 },
      ],
      timestamp: now,
    };

    this.downOrderBook = {
      marketId: market.id,
      outcome: 'DOWN',
      tokenId: market.downTokenId,
      bids: [
        { price: 0.49, size: 250 },
        { price: 0.48, size: 500 },
        { price: 0.47, size: 1000 },
      ],
      asks: [
        { price: 0.51, size: 250 },
        { price: 0.52, size: 500 },
        { price: 0.53, size: 1000 },
      ],
      timestamp: now,
    };
  }

  private connect(): void {
    if (!this.shouldRun) return;

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        this.isConnected = true;
        eventBus.emitLog('WS', 'info', `Market WebSocket connected: ${this.wsUrl}`);
        this.sendSubscription();
        this.startHeartbeat();
      });

      this.ws.on('message', (raw: WebSocket.RawData) => {
        try {
          const message = JSON.parse(raw.toString());
          this.handleWsMessage(message);
        } catch (_) {}
      });

      this.ws.on('error', (err) => {
        eventBus.emitLog('WS', 'warn', `WebSocket connection notice: ${err.message || 'Connecting...'}`);
      });

      this.ws.on('close', () => {
        this.isConnected = false;
        this.cleanupHeartbeat();
        if (this.shouldRun) {
          eventBus.emitLog('WS', 'warn', 'Market WebSocket disconnected. Reconnecting in 3s...');
          this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
        }
      });
    } catch (err) {
      if (this.shouldRun) {
        this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
      }
    }
  }

  private disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.cleanupHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
    this.isConnected = false;
  }

  private sendSubscription(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.currentMarket) {
      return;
    }

    const payload = {
      assets_ids: [this.currentMarket.upTokenId, this.currentMarket.downTokenId],
      type: 'market',
      custom_feature_enabled: true,
    };

    try {
      this.ws.send(JSON.stringify(payload));
      eventBus.emitLog(
        'WS',
        'info',
        `Subscribed to market channels (custom_feature_enabled) for UP/DOWN tokens in ${this.currentMarket.slug}`
      );
    } catch (err) {
      console.error('[WS] Failed to send subscription:', err);
    }
  }

  private startHeartbeat(): void {
    this.cleanupHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send('PING');
          this.ws.ping();
        } catch (_) {}
      }
    }, 10000);
  }

  private cleanupHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Handle incoming Polymarket WebSocket message
   */
  private handleWsMessage(msg: any): void {
    if (!msg || !this.currentMarket || !this.latestPriceData) return;

    const eventType = msg.event_type || msg.type;

    if (eventType === 'best_bid_ask') {
      this.processBestBidAsk(msg);
    } else if (eventType === 'book') {
      // Orderbook snapshot / delta
      this.processBookUpdate(msg);
    } else if (eventType === 'last_trade_price' || eventType === 'trade') {
      // Real-time trade execution
      this.processTradeUpdate(msg);
    } else if (eventType === 'price_change') {
      this.processPriceChange(msg);
    }
  }

  private processBestBidAsk(msg: any): void {
    if (!this.currentMarket || !this.latestPriceData) return;
    const assetId = msg.asset_id || msg.token_id;
    const isUp = assetId === this.currentMarket.upTokenId;
    const isDown = assetId === this.currentMarket.downTokenId;
    if (!isUp && !isDown) return;

    const bestBid = parseFloat(msg.best_bid || '0');
    const bestAsk = parseFloat(msg.best_ask || '0');
    const spread = parseFloat(msg.spread || '0');

    if (isUp) {
      if (bestBid > 0) this.latestPriceData.up.bestBid = bestBid;
      if (bestAsk > 0) this.latestPriceData.up.bestAsk = bestAsk;
      if (spread > 0) this.latestPriceData.up.spread = spread;
      this.recalculateMetrics('UP');
    } else {
      if (bestBid > 0) this.latestPriceData.down.bestBid = bestBid;
      if (bestAsk > 0) this.latestPriceData.down.bestAsk = bestAsk;
      if (spread > 0) this.latestPriceData.down.spread = spread;
      this.recalculateMetrics('DOWN');
    }

    this.notifyPriceUpdate();
  }

  private processBookUpdate(msg: any): void {
    if (!this.currentMarket || !this.latestPriceData) return;
    const assetId = msg.asset_id;
    const isUp = assetId === this.currentMarket.upTokenId;
    const isDown = assetId === this.currentMarket.downTokenId;
    if (!isUp && !isDown) return;

    const targetOutcome: OutcomeType = isUp ? 'UP' : 'DOWN';
    const bids: OrderBook['bids'] = (msg.bids || []).map((b: any) => ({
      price: parseFloat(b.price),
      size: parseFloat(b.size),
    }));
    const asks: OrderBook['asks'] = (msg.asks || []).map((a: any) => ({
      price: parseFloat(a.price),
      size: parseFloat(a.size),
    }));

    const book: OrderBook = {
      marketId: this.currentMarket.id,
      outcome: targetOutcome,
      tokenId: assetId,
      bids: bids.sort((a, b) => b.price - a.price),
      asks: asks.sort((a, b) => a.price - b.price),
      timestamp: Date.now(),
    };

    if (isUp) {
      this.upOrderBook = book;
      if (bids.length > 0) {
        this.latestPriceData.up.bestBid = bids[0].price;
        this.latestPriceData.up.bidSize = bids[0].size;
      }
      if (asks.length > 0) {
        this.latestPriceData.up.bestAsk = asks[0].price;
        this.latestPriceData.up.askSize = asks[0].size;
      }
      this.recalculateMetrics('UP');
    } else {
      this.downOrderBook = book;
      if (bids.length > 0) {
        this.latestPriceData.down.bestBid = bids[0].price;
        this.latestPriceData.down.bidSize = bids[0].size;
      }
      if (asks.length > 0) {
        this.latestPriceData.down.bestAsk = asks[0].price;
        this.latestPriceData.down.askSize = asks[0].size;
      }
      this.recalculateMetrics('DOWN');
    }

    this.notifyPriceUpdate();
  }

  private processTradeUpdate(msg: any): void {
    if (!this.currentMarket || !this.latestPriceData) return;
    const assetId = msg.asset_id;
    const price = parseFloat(msg.price);
    const size = parseFloat(msg.size || '1');
    const isUp = assetId === this.currentMarket.upTokenId;
    const isDown = assetId === this.currentMarket.downTokenId;
    if (!isUp && !isDown) return;

    const outcome: OutcomeType = isUp ? 'UP' : 'DOWN';
    const side = msg.side === 'SELL' ? 'SELL' : 'BUY';

    if (isUp) {
      this.latestPriceData.up.lastTrade = price;
      this.recalculateMetrics('UP');
    } else {
      this.latestPriceData.down.lastTrade = price;
      this.recalculateMetrics('DOWN');
    }

    const trade: PublicTrade = {
      id: `tr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      marketId: this.currentMarket.id,
      outcome,
      price,
      size,
      side,
      timestamp: Date.now(),
    };

    this.recentTrades.unshift(trade);
    if (this.recentTrades.length > 50) {
      this.recentTrades.pop();
    }

    eventBus.broadcastSse('trade', trade);
    this.notifyPriceUpdate();
  }

  private processPriceChange(msg: any): void {
    if (!this.currentMarket || !this.latestPriceData) return;
    const assetId = msg.asset_id;
    const isUp = assetId === this.currentMarket.upTokenId;
    const isDown = assetId === this.currentMarket.downTokenId;
    if (!isUp && !isDown) return;

    if (msg.price) {
      const p = parseFloat(msg.price);
      if (isUp) {
        this.latestPriceData.up.lastTrade = p;
        this.recalculateMetrics('UP');
      } else {
        this.latestPriceData.down.lastTrade = p;
        this.recalculateMetrics('DOWN');
      }
      this.notifyPriceUpdate();
    }
  }

  private recalculateMetrics(outcome: OutcomeType): void {
    if (!this.latestPriceData) return;
    const target = outcome === 'UP' ? this.latestPriceData.up : this.latestPriceData.down;

    if (target.bestBid > 0 && target.bestAsk > 0) {
      target.midPrice = parseFloat(((target.bestBid + target.bestAsk) / 2).toFixed(4));
      target.spread = parseFloat((target.bestAsk - target.bestBid).toFixed(4));
    } else {
      target.midPrice = target.lastTrade;
      target.spread = 0.01;
    }
  }

  public notifyPriceUpdate(): void {
    if (!this.latestPriceData) return;
    this.latestPriceData.timestamp = Date.now();
    this.latestPriceData.btcPrice = btcPriceFeed.getPrice();

    for (const listener of this.priceListeners) {
      try {
        listener(this.latestPriceData);
      } catch (err) {
        console.error('[ClobWS] Error in price listener:', err);
      }
    }

    eventBus.broadcastSse('price_tick', this.latestPriceData);
    eventBus.broadcastSse('price_update', this.latestPriceData);
  }

  /**
   * Manual price injection / simulation (used for testing scenarios like 0.50 -> 0.70 -> 0.90)
   */
  public injectPrice(outcome: OutcomeType, price: number): void {
    if (!this.latestPriceData) return;
    const target = outcome === 'UP' ? this.latestPriceData.up : this.latestPriceData.down;
    const opposite = outcome === 'UP' ? this.latestPriceData.down : this.latestPriceData.up;

    target.lastTrade = price;
    target.bestBid = parseFloat((price - 0.01).toFixed(2));
    target.bestAsk = parseFloat((price + 0.01).toFixed(2));
    target.midPrice = price;
    target.spread = 0.02;

    // Opposite outcome roughly mirrors in prediction markets
    const oppPrice = parseFloat(Math.max(0.01, Math.min(0.99, 1 - price)).toFixed(2));
    opposite.lastTrade = oppPrice;
    opposite.bestBid = parseFloat((oppPrice - 0.01).toFixed(2));
    opposite.bestAsk = parseFloat((oppPrice + 0.01).toFixed(2));
    opposite.midPrice = oppPrice;
    opposite.spread = 0.02;

    // Record synthetic trade
    const trade: PublicTrade = {
      id: `sim_${Date.now()}`,
      marketId: this.currentMarket?.id || 'sim',
      outcome,
      price,
      size: 10,
      side: 'BUY',
      timestamp: Date.now(),
    };
    this.recentTrades.unshift(trade);
    if (this.recentTrades.length > 50) this.recentTrades.pop();

    this.notifyPriceUpdate();
    eventBus.broadcastSse('trade', trade);
  }

  /**
   * Periodic REST fallback polling to sync order book and prices from Polymarket CLOB
   */
  private startRestSync(): void {
    this.restSyncInterval = setInterval(() => {
      this.fetchMarketRestData().catch(() => {});
    }, 1500);
  }

  private async fetchMarketRestData(): Promise<void> {
    if (!this.currentMarket || !this.latestPriceData) return;

    try {
      // Try fetching CLOB book for UP token
      if (this.currentMarket.upTokenId && !this.currentMarket.upTokenId.startsWith('137')) {
        const bookUrl = `${this.clobHost}/book?token_id=${this.currentMarket.upTokenId}`;
        const res = await fetch(bookUrl, { signal: AbortSignal.timeout(2500) });
        if (res.ok) {
          const book = (await res.json()) as any;
          if (book && (book.bids || book.asks)) {
            this.processBookUpdate({
              asset_id: this.currentMarket.upTokenId,
              bids: book.bids || [],
              asks: book.asks || [],
            });
          }
        }
      }
    } catch (_) {}

    try {
      // Try fetching CLOB book for DOWN token
      if (this.currentMarket.downTokenId && !this.currentMarket.downTokenId.startsWith('137')) {
        const bookUrl = `${this.clobHost}/book?token_id=${this.currentMarket.downTokenId}`;
        const res = await fetch(bookUrl, { signal: AbortSignal.timeout(2500) });
        if (res.ok) {
          const book = (await res.json()) as any;
          if (book && (book.bids || book.asks)) {
            this.processBookUpdate({
              asset_id: this.currentMarket.downTokenId,
              bids: book.bids || [],
              asks: book.asks || [],
            });
          }
        }
      }
    } catch (_) {}
  }
}

export const clobWebSocket = new ClobWebSocketService();
