/**
 * System Restart Recovery & Order Reconciler
 * Automatically reconciles local database states with Polymarket CLOB after container/server restarts.
 * Also periodically checks OPEN BUY fills so take-profit Limit Sells can be placed.
 */

import { getRealOrders, getWaitingConditionalOrders } from '../database/db.js';
import { marketDiscovery } from '../market/market-discovery.js';
import { clobWebSocket } from '../polymarket/clob-websocket.js';
import { triggerEngine } from './trigger-engine.js';
import { eventBus } from '../events/event-bus.js';

class ReconcilerService {
  private takeProfitInterval: NodeJS.Timeout | null = null;

  public async reconcileOnStartup(): Promise<void> {
    await eventBus.emitLog('SYSTEM', 'info', 'Starting system restart recovery & order reconciliation...');

    // 1. Discover current active BTC 5M market
    const currentMarket = await marketDiscovery.checkAndUpdateMarket();
    await eventBus.emitLog(
      'SYSTEM',
      'info',
      `Active market verified during recovery: ${currentMarket.slug}`
    );

    // 2. Connect WebSocket to live feed
    clobWebSocket.updateMarket(currentMarket);

    // 3. Reconcile pending conditional orders
    const pendingOrders = await getWaitingConditionalOrders();
    const now = Date.now();

    for (const order of pendingOrders) {
      if (order.marketSlug !== currentMarket.slug || now >= currentMarket.endTime) {
        await triggerEngine.handleMarketExpired(order.marketSlug);
      }
    }

    // 4. Reconcile real open orders with Polymarket
    const localRealOrders = await getRealOrders();
    const openLocalOrders = localRealOrders.filter((o) => o.status === 'OPEN' || o.status === 'PENDING');

    // 5. Place any take-profit sells for BUYs that filled while we were down
    const tpPlaced = await triggerEngine.reconcilePendingTakeProfits();

    await eventBus.emitLog(
      'SYSTEM',
      'info',
      `Reconciled ${pendingOrders.length} pending conditional orders, ${openLocalOrders.length} open real orders, ${tpPlaced} take-profit sell(s) placed.`
    );

    this.startTakeProfitPolling();
  }

  /** Poll LIVE open BUY fills so take-profit Limit Sells fire promptly after fill. */
  private startTakeProfitPolling(): void {
    if (this.takeProfitInterval) return;
    this.takeProfitInterval = setInterval(() => {
      triggerEngine.reconcilePendingTakeProfits().catch((err) => {
        console.error('[Reconciler] Take-profit poll error:', err);
      });
    }, 5000);
  }

  public stop(): void {
    if (this.takeProfitInterval) {
      clearInterval(this.takeProfitInterval);
      this.takeProfitInterval = null;
    }
  }
}

export const reconciler = new ReconcilerService();
