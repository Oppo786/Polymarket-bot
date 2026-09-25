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
} from '../types.js';
import {
  insertConditionalOrder,
  updateConditionalOrderStatus,
  getWaitingConditionalOrders,
  getConditionalOrders,
  persistDb,
} from '../database/db.js';
import { polymarketClient } from '../polymarket/clob-client.js';
import { eventBus } from '../events/event-bus.js';
import { marketDiscovery } from '../market/market-discovery.js';

class TriggerEngine {
  // In-memory mutex locks to prevent race conditions across rapid WebSocket price ticks
  private executingLocks: Set<string> = new Set();
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
}

export const triggerEngine = new TriggerEngine();
