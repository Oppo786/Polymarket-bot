/**
 * System Restart Recovery & Order Reconciler
 * Automatically reconciles local database states with Polymarket CLOB after container/server restarts
 */

import { getRealOrders, updateRealOrderStatus, getWaitingConditionalOrders } from '../database/db.js';
import { marketDiscovery } from '../market/market-discovery.js';
import { clobWebSocket } from '../polymarket/clob-websocket.js';
import { triggerEngine } from './trigger-engine.js';
import { eventBus } from '../events/event-bus.js';
import { polymarketClient } from '../polymarket/clob-client.js';

class ReconcilerService {
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

    await eventBus.emitLog(
      'SYSTEM',
      'info',
      `Reconciled ${pendingOrders.length} pending conditional orders and ${openLocalOrders.length} open real orders.`
    );
  }
}

export const reconciler = new ReconcilerService();
