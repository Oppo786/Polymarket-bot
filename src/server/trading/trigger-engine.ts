/**
 * Custom Conditional Order Trigger Engine
 * Strictly enforces:
 * CONDITIONAL ORDER -> WAIT -> TRIGGER -> REAL POLYMARKET ORDER
 *
 * Implements:
 * - Intelligent trigger direction logic (ABOVE_OR_EQUAL vs BELOW_OR_EQUAL)
 * - Separate triggerPrice, triggerDirection, triggerSource, and orderPrice
 * - Strict idempotency and atomic trigger locking to prevent duplicate submissions
 * - Market expiration protection: marks waiting orders EXPIRED if 5m window closes
 */

import {
  ConditionalOrder,
  MarketPriceData,
  TriggerDirection,
  TriggerSource,
  OutcomeType,
  OrderSide,
  Btc5mMarket,
  RealOrder,
} from '../types.js';
import {
  insertConditionalOrder,
  updateConditionalOrderStatus,
  getWaitingConditionalOrders,
  getConditionalOrders,
  getRealOrders,
  updateRealOrderStatus,
} from '../database/db.js';
import { polymarketClient } from '../polymarket/clob-client.js';
import { eventBus } from '../events/event-bus.js';
import { marketDiscovery } from '../market/market-discovery.js';

class TriggerEngine {
  // In-memory mutex locks to prevent race conditions across rapid WebSocket price ticks
  private executingLocks: Set<string> = new Set();
  private takeProfitLocks: Set<string> = new Set();
  private isRunning: boolean = false;

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Load any pending conditional orders from SQLite database
    const pending = await getWaitingConditionalOrders();
    await eventBus.emitLog(
      'TRIGGER',
      'info',
      `Trigger Engine started. Loaded ${pending.length} pending conditional order(s) from persistent database.`
    );
  }

  public stop(): void {
    this.isRunning = false;
  }

  /**
   * Determine intelligent trigger direction:
   * If triggerPrice >= currentPrice -> ABOVE_OR_EQUAL (Wait until price rises to trigger)
   * If triggerPrice < currentPrice -> BELOW_OR_EQUAL (Wait until price drops to trigger)
   */
  public determineTriggerDirection(currentPrice: number, triggerPrice: number): TriggerDirection {
    if (triggerPrice >= currentPrice) {
      return 'ABOVE_OR_EQUAL';
    } else {
      return 'BELOW_OR_EQUAL';
    }
  }

  /**
   * Helper to extract the price based on triggerSource
   */
  public getPriceBySource(
    priceData: MarketPriceData,
    outcome: OutcomeType,
    source: TriggerSource
  ): number {
    const target = outcome === 'UP' ? priceData.up : priceData.down;
    switch (source) {
      case 'BEST_BID':
        return target.bestBid;
      case 'BEST_ASK':
        return target.bestAsk;
      case 'MID_PRICE':
        return target.midPrice;
      case 'LAST_TRADE':
      default:
        return target.lastTrade;
    }
  }

  /**
   * Create a new Conditional Order
   * CRITICAL: Saves locally, DOES NOT submit order to Polymarket!
   */
  public async createConditionalOrder(params: {
    market: Btc5mMarket;
    outcome: OutcomeType;
    side: OrderSide;
    triggerPrice: number;
    orderPrice: number;
    triggerSource?: TriggerSource;
    triggerDirection?: TriggerDirection;
    sizeUsd: number;
    currentPrice: number;
    takeProfitPrice?: number;
  }): Promise<ConditionalOrder> {
    const {
      market,
      outcome,
      side,
      triggerPrice,
      orderPrice,
      triggerSource = 'LAST_TRADE',
      sizeUsd,
      currentPrice,
      takeProfitPrice,
    } = params;

    // Validation
    if (triggerPrice <= 0 || triggerPrice >= 1.0) {
      throw new Error(`Invalid trigger price $${triggerPrice}. Prediction market prices must be between 0.01 and 0.99`);
    }
    if (orderPrice <= 0 || orderPrice >= 1.0) {
      throw new Error(`Invalid order price $${orderPrice}. Prediction market prices must be between 0.01 and 0.99`);
    }
    if (sizeUsd <= 0) {
      throw new Error(`Invalid size $${sizeUsd}. Must be greater than 0.`);
    }
    if (takeProfitPrice !== undefined && takeProfitPrice !== null) {
      if (side !== 'BUY') {
        throw new Error('Take-profit price is only supported on BUY orders.');
      }
      if (takeProfitPrice <= 0 || takeProfitPrice >= 1.0) {
        throw new Error(`Invalid take-profit price $${takeProfitPrice}. Must be between 0.01 and 0.99`);
      }
    }

    // Determine direction if not provided
    const triggerDirection =
      params.triggerDirection || this.determineTriggerDirection(currentPrice, triggerPrice);

    const now = Date.now();
    const id = `co_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const shares = parseFloat((sizeUsd / orderPrice).toFixed(4));
    const tradingMode = polymarketClient.getTradingMode();

    const order: ConditionalOrder = {
      id,
      marketId: market.id,
      marketSlug: market.slug,
      outcome,
      side,
      triggerPrice,
      triggerDirection,
      triggerSource,
      orderPrice,
      size: sizeUsd,
      shares,
      takeProfitPrice: takeProfitPrice || undefined,
      status: 'WAITING_FOR_TRIGGER',
      tradingMode,
      initialPriceAtCreation: currentPrice,
      createdAt: now,
      updatedAt: now,
    };

    // Save to SQLite
    await insertConditionalOrder(order);

    const directionOperator = triggerDirection === 'ABOVE_OR_EQUAL' ? '>=' : '<=';

    await eventBus.emitLog(
      'ORDER',
      'info',
      `Conditional order created [${order.id}]: ${side} ${outcome} $${sizeUsd} (Initial ${outcome} = $${currentPrice.toFixed(2)})`
    );
    await eventBus.emitLog(
      'TRIGGER',
      'info',
      `Waiting for trigger: Price ${directionOperator} $${triggerPrice.toFixed(2)} (Source: ${triggerSource})`
    );
    if (order.takeProfitPrice) {
      await eventBus.emitLog(
        'ORDER',
        'info',
        `Take-profit armed at $${order.takeProfitPrice.toFixed(2)} — Limit Sell will auto-place after BUY fill.`
      );
    }

    eventBus.broadcastSse('conditional_order_created', order);

    return order;
  }

  /**
   * Cancel an order
   */
  public async cancelOrder(orderId: string): Promise<void> {
    const orders = await getConditionalOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (order.status === 'WAITING_FOR_TRIGGER') {
      await updateConditionalOrderStatus(orderId, 'CANCELLED');
      await eventBus.emitLog('ORDER', 'info', `Waiting conditional order ${orderId} cancelled by user.`);
      eventBus.broadcastSse('conditional_order_updated', { id: orderId, status: 'CANCELLED' });
      return;
    }

    // If order already triggered and submitted to Polymarket, cancel real order on Polymarket
    if (order.polymarketOrderId) {
      await polymarketClient.cancelOrder(order.polymarketOrderId);
      await updateConditionalOrderStatus(orderId, 'CANCELLED');
      eventBus.broadcastSse('conditional_order_updated', { id: orderId, status: 'CANCELLED' });
    }
  }

  /**
   * Core Price Tick Evaluator:
   * Called on every live WebSocket price update or manual tick injection.
   * Atomically checks all waiting orders against market prices.
   */
  public async evaluatePriceTick(priceData: MarketPriceData): Promise<void> {
    if (!this.isRunning) return;

    const waitingOrders = await getWaitingConditionalOrders();
    if (waitingOrders.length === 0) return;

    const now = Date.now();
    const currentMarket = marketDiscovery.getCurrentMarket();

    for (const order of waitingOrders) {
      // 1. Market Expiration Protection
      // If the 5-minute market for this order has expired before trigger was met:
      // Mark as EXPIRED. NEVER submit to an expired market!
      if (currentMarket && order.marketSlug !== currentMarket.slug) {
        await this.expireOrder(order, 'Market expired before trigger.');
        continue;
      }

      // Check against current market's end time
      if (currentMarket && now >= currentMarket.endTime) {
        await this.expireOrder(order, 'Market expired before trigger.');
        continue;
      }

      // 2. Lock check for duplicate protection
      if (this.executingLocks.has(order.id)) {
        continue; // Already being processed in an atomic trigger execution
      }

      // 3. Extract the exact price for this order's outcome and trigger source
      const currentPrice = this.getPriceBySource(priceData, order.outcome, order.triggerSource);

      // 4. Evaluate trigger condition
      let conditionMet = false;
      if (order.triggerDirection === 'ABOVE_OR_EQUAL') {
        conditionMet = currentPrice >= order.triggerPrice;
      } else if (order.triggerDirection === 'BELOW_OR_EQUAL') {
        conditionMet = currentPrice <= order.triggerPrice;
      }

      if (conditionMet) {
        // Trigger condition satisfied! Execute atomically
        await this.triggerAndSubmitOrder(order, currentPrice);
      }
    }
  }

  /**
   * Mark an order as expired
   */
  private async expireOrder(order: ConditionalOrder, reason: string): Promise<void> {
    await updateConditionalOrderStatus(order.id, 'EXPIRED', {
      failureReason: reason,
    });
    await eventBus.emitLog(
      'ORDER',
      'warn',
      `Conditional order ${order.id} marked EXPIRED: ${reason}`
    );
    eventBus.broadcastSse('conditional_order_updated', {
      id: order.id,
      status: 'EXPIRED',
      failureReason: reason,
    });
  }

  /**
   * Atomic Trigger and Submission Process:
   * 1. Acquire mutex lock on order ID
   * 2. Double-check order status from DB (idempotency check)
   * 3. Atomically update DB status to TRIGGERED
   * 4. Transition to SUBMITTING
   * 5. Call Polymarket execution client
   * 6. Record Real Order & update Conditional Order to OPEN / FILLED
   * 7. Release lock
   */
  private async triggerAndSubmitOrder(order: ConditionalOrder, triggerMetPrice: number): Promise<void> {
    // Step 1: Acquire lock
    if (this.executingLocks.has(order.id)) {
      return; // Already locked
    }
    this.executingLocks.add(order.id);

    try {
      // Step 2: Double check in DB to prevent duplicate trigger
      const freshOrders = await getConditionalOrders();
      const fresh = freshOrders.find((o) => o.id === order.id);
      if (!fresh || fresh.status !== 'WAITING_FOR_TRIGGER') {
        return; // Already triggered or cancelled by another event
      }

      const now = Date.now();

      // Step 3: Atomic state change -> TRIGGERED
      await updateConditionalOrderStatus(order.id, 'TRIGGERED', {
        triggeredPrice: triggerMetPrice,
        triggeredAt: now,
      });

      await eventBus.emitLog(
        'TRIGGER',
        'success',
        `${order.outcome} = $${triggerMetPrice.toFixed(2)} Trigger condition satisfied for order ${order.id}!`
      );
      eventBus.broadcastSse('conditional_order_updated', {
        id: order.id,
        status: 'TRIGGERED',
        triggeredPrice: triggerMetPrice,
        triggeredAt: now,
      });

      // Step 4: Transition to SUBMITTING
      await updateConditionalOrderStatus(order.id, 'SUBMITTING');
      await eventBus.emitLog(
        'ORDER',
        'info',
        `Submitting real Polymarket order: ${order.side} ${order.outcome} @ $${order.orderPrice.toFixed(2)}`
      );
      eventBus.broadcastSse('conditional_order_updated', {
        id: order.id,
        status: 'SUBMITTING',
      });

      // Find token ID for execution
      const currentMarket = marketDiscovery.getCurrentMarket();
      const tokenId =
        order.outcome === 'UP'
          ? currentMarket?.upTokenId || 'up_token_placeholder'
          : currentMarket?.downTokenId || 'down_token_placeholder';

      // Step 5: Submit order to Polymarket (or simulated engine in DRY_RUN)
      const realOrder = await polymarketClient.submitOrder({
        conditionalOrderId: order.id,
        marketId: order.marketId,
        marketSlug: order.marketSlug,
        outcome: order.outcome,
        tokenId,
        side: order.side,
        price: order.orderPrice,
        amountUsd: order.size,
      });

      // Step 6: Link Real Order with Conditional Order
      const finalStatus = realOrder.status === 'FILLED' ? 'FILLED' : 'OPEN';
      await updateConditionalOrderStatus(order.id, finalStatus, {
        realOrderId: realOrder.id,
        polymarketOrderId: realOrder.polymarketOrderId,
      });

      eventBus.broadcastSse('conditional_order_updated', {
        id: order.id,
        status: finalStatus,
        realOrderId: realOrder.id,
        polymarketOrderId: realOrder.polymarketOrderId,
      });
      eventBus.broadcastSse('real_order_created', realOrder);

      // Step 6b: Take-profit Limit Sell after BUY fill
      if (order.side === 'BUY' && order.takeProfitPrice) {
        const filledOrder: ConditionalOrder = {
          ...order,
          status: finalStatus,
          realOrderId: realOrder.id,
          polymarketOrderId: realOrder.polymarketOrderId,
        };
        if (realOrder.status === 'FILLED' && realOrder.filledSize > 0) {
          await this.placeTakeProfitSell(filledOrder, realOrder);
        }
        // LIVE buys may remain OPEN — reconciler will place TP once filled
      }
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      await updateConditionalOrderStatus(order.id, 'FAILED', {
        failureReason: errorMsg,
      });
      await eventBus.emitLog('ORDER', 'error', `Order submission failed for ${order.id}: ${errorMsg}`);
      eventBus.broadcastSse('conditional_order_updated', {
        id: order.id,
        status: 'FAILED',
        failureReason: errorMsg,
      });
    } finally {
      // Step 7: Release lock
      this.executingLocks.delete(order.id);
    }
  }

  /**
   * Handle market expiration callback from MarketDiscovery
   */
  public async handleMarketExpired(expiredMarketSlug: string): Promise<void> {
    const waiting = await getWaitingConditionalOrders();
    for (const order of waiting) {
      if (order.marketSlug === expiredMarketSlug) {
        await this.expireOrder(order, 'Market expired before trigger.');
      }
    }
  }

  /**
   * After a BUY fills, place a Limit Sell at the take-profit price for the exact filled share amount.
   * Idempotent: skips if take-profit already placed or another placement is in flight.
   */
  public async placeTakeProfitSell(
    conditionalOrder: ConditionalOrder,
    filledBuy: RealOrder
  ): Promise<RealOrder | null> {
    if (!conditionalOrder.takeProfitPrice) return null;
    if (conditionalOrder.side !== 'BUY') return null;
    if (conditionalOrder.takeProfitOrderId) return null;
    if (filledBuy.filledSize <= 0) return null;

    if (this.takeProfitLocks.has(conditionalOrder.id)) return null;
    this.takeProfitLocks.add(conditionalOrder.id);

    try {
      // Re-check DB for idempotency (e.g. restart / concurrent reconciler)
      const freshOrders = await getConditionalOrders();
      const fresh = freshOrders.find((o) => o.id === conditionalOrder.id);
      if (!fresh || fresh.takeProfitOrderId || !fresh.takeProfitPrice) {
        return null;
      }

      const currentMarket = marketDiscovery.getCurrentMarket();
      const tokenId =
        conditionalOrder.outcome === 'UP'
          ? currentMarket?.upTokenId || filledBuy.tokenId
          : currentMarket?.downTokenId || filledBuy.tokenId;

      const filledShares = filledBuy.filledSize;
      const tpPrice = fresh.takeProfitPrice;

      await eventBus.emitLog(
        'ORDER',
        'info',
        `Placing take-profit Limit Sell for ${conditionalOrder.id}: ${filledShares} shares @ $${tpPrice.toFixed(2)}`
      );

      const tpOrder = await polymarketClient.submitOrder({
        conditionalOrderId: conditionalOrder.id,
        marketId: conditionalOrder.marketId,
        marketSlug: conditionalOrder.marketSlug,
        outcome: conditionalOrder.outcome,
        tokenId,
        side: 'SELL',
        price: tpPrice,
        sizeShares: filledShares,
      });

      await updateConditionalOrderStatus(conditionalOrder.id, fresh.status, {
        takeProfitOrderId: tpOrder.id,
      });

      await eventBus.emitLog(
        'ORDER',
        'success',
        `Take-profit Limit Sell placed [${tpOrder.polymarketOrderId}]: SELL ${conditionalOrder.outcome} ${filledShares} shs @ $${tpPrice.toFixed(2)}`
      );

      eventBus.broadcastSse('real_order_created', tpOrder);
      eventBus.broadcastSse('conditional_order_updated', {
        id: conditionalOrder.id,
        takeProfitOrderId: tpOrder.id,
      });

      return tpOrder;
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      await eventBus.emitLog(
        'ORDER',
        'error',
        `Take-profit Limit Sell failed for ${conditionalOrder.id}: ${errorMsg}`
      );
      return null;
    } finally {
      this.takeProfitLocks.delete(conditionalOrder.id);
    }
  }

  /**
   * Check OPEN BUY orders that have a take-profit target but no TP sell yet.
   * Used by the reconciler (startup + periodic) for LIVE fills that land after submission.
   */
  public async reconcilePendingTakeProfits(): Promise<number> {
    const orders = await getConditionalOrders();
    const realOrders = await getRealOrders();
    let placed = 0;

    const pending = orders.filter(
      (o) =>
        o.side === 'BUY' &&
        o.takeProfitPrice &&
        !o.takeProfitOrderId &&
        o.polymarketOrderId &&
        (o.status === 'OPEN' || o.status === 'FILLED' || o.status === 'PARTIALLY_FILLED')
    );

    for (const order of pending) {
      let buyReal = realOrders.find(
        (r) =>
          r.id === order.realOrderId ||
          r.polymarketOrderId === order.polymarketOrderId
      );
      if (!buyReal) continue;

      // LIVE: refresh fill status from Polymarket
      if (buyReal.status !== 'FILLED' && order.polymarketOrderId) {
        const remote = await polymarketClient.fetchRemoteOrderStatus(order.polymarketOrderId);
        if (remote && (remote.status === 'FILLED' || remote.status === 'PARTIALLY_FILLED')) {
          await updateRealOrderStatus(
            order.polymarketOrderId,
            remote.status,
            remote.filledSize,
            remote.averageFillPrice
          );
          buyReal = {
            ...buyReal,
            status: remote.status,
            filledSize: remote.filledSize,
            averageFillPrice: remote.averageFillPrice,
          };
          if (remote.status === 'FILLED') {
            await updateConditionalOrderStatus(order.id, 'FILLED');
            eventBus.broadcastSse('conditional_order_updated', {
              id: order.id,
              status: 'FILLED',
            });
          }
        }
      }

      if (buyReal.filledSize > 0 && (buyReal.status === 'FILLED' || buyReal.status === 'PARTIALLY_FILLED')) {
        // Only auto-place TP on full fill to match "exact filled amount" of the completed buy
        if (buyReal.status === 'FILLED') {
          const result = await this.placeTakeProfitSell(order, buyReal);
          if (result) placed += 1;
        }
      }
    }

    return placed;
  }
}

export const triggerEngine = new TriggerEngine();
