/**
 * Live BTC/USD Spot Price Feed
 * Queries live price via public WebSocket / REST with automatic fallback
 */

import WebSocket from 'ws';
import { eventBus } from '../events/event-bus.js';

class BtcPriceFeed {
  private currentBtcPrice: number = 65000.0;
  private ws: WebSocket | null = null;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.connectWs();
    this.startPollingFallback();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  public getPrice(): number {
    return this.currentBtcPrice;
  }

  public setPrice(price: number): void {
    if (price > 0 && Number.isFinite(price)) {
      this.currentBtcPrice = price;
      eventBus.broadcastSse('btc_price', { price: this.currentBtcPrice, timestamp: Date.now() });
    }
  }

  private connectWs(): void {
    if (!this.isRunning) return;

    try {
      // Connect to Binance public trade stream for BTCUSDT
      this.ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');

      this.ws.on('open', () => {
        // Connected
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed && parsed.c) {
            const price = parseFloat(parsed.c);
            if (!isNaN(price) && price > 0) {
              this.setPrice(price);
            }
          }
        } catch (_) {}
      });

      this.ws.on('error', () => {
        // Handled in close
      });

      this.ws.on('close', () => {
        if (this.isRunning) {
          setTimeout(() => this.connectWs(), 5000);
        }
      });
    } catch (err) {
      if (this.isRunning) {
        setTimeout(() => this.connectWs(), 5000);
      }
    }
  }

  private startPollingFallback(): void {
    const fetchBtcPrice = async () => {
      try {
        const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const json = (await res.json()) as { price?: string };
          if (json?.price) {
            const p = parseFloat(json.price);
            if (!isNaN(p) && p > 0) {
              this.setPrice(p);
            }
          }
        }
      } catch (_) {
        // Secondary fallback to Coinbase
        try {
          const resCb = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', {
            signal: AbortSignal.timeout(3000),
          });
          if (resCb.ok) {
            const jsonCb = (await resCb.json()) as { data?: { amount?: string } };
            if (jsonCb?.data?.amount) {
              const p = parseFloat(jsonCb.data.amount);
              if (!isNaN(p) && p > 0) {
                this.setPrice(p);
              }
            }
          }
        } catch (_) {}
      }
    };

    fetchBtcPrice();
    this.pollInterval = setInterval(fetchBtcPrice, 10000);
  }
}

export const btcPriceFeed = new BtcPriceFeed();
