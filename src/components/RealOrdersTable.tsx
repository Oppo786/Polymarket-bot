import React from 'react';
import { ArrowUpRight, CheckCircle2, AlertCircle, Ban } from 'lucide-react';
import { RealOrder } from '../server/types';

interface RealOrdersTableProps {
  orders: RealOrder[];
  onCancelRealOrder: (polymarketOrderId: string) => Promise<void>;
}

export const RealOrdersTable: React.FC<RealOrdersTableProps> = ({
  orders,
  onCancelRealOrder,
}) => {
  return (
    <div id="real-orders-section" className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3 font-mono">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-zinc-100 tracking-tight">REAL POLYMARKET ORDERS</h3>
          <span className="text-xs text-zinc-400">({orders.length})</span>
        </div>
        <span className="text-[11px] text-zinc-400 font-sans">
          Executed on Polymarket CLOB (or simulated in DRY_RUN)
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-400 tracking-wider">
              <th className="py-2 px-2">Market</th>
              <th className="py-2 px-2">Outcome</th>
              <th className="py-2 px-2">Side</th>
              <th className="py-2 px-2">Price</th>
              <th className="py-2 px-2">Size</th>
              <th className="py-2 px-2">Filled</th>
              <th className="py-2 px-2">Avg Fill</th>
              <th className="py-2 px-2">Status</th>
              <th className="py-2 px-2">Polymarket Order ID</th>
              <th className="py-2 px-2">Created</th>
              <th className="py-2 px-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-8 text-center text-zinc-400 text-xs">
                  No real orders submitted yet. When conditional orders trigger, real orders will appear here.
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const canCancel = order.status === 'OPEN' || order.status === 'PENDING';

                return (
                  <tr key={order.id} className="hover:bg-zinc-800/30 transition text-[11px]">
                    <td className="py-2.5 px-2 text-zinc-300 max-w-[120px] truncate" title={order.marketSlug}>
                      {order.marketSlug.replace('btc-updown-5m-', '')}
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`font-bold ${
                          order.outcome === 'UP' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {order.outcome}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`font-semibold ${
                          order.side === 'BUY' ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {order.side}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-zinc-200 font-medium">${order.price.toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-zinc-300">{order.size} shs (${order.amountUsd.toFixed(2)})</td>
                    <td className="py-2.5 px-2 text-emerald-400 font-medium">{order.filledSize} shs</td>
                    <td className="py-2.5 px-2 text-zinc-300">
                      {order.averageFillPrice > 0 ? `$${order.averageFillPrice.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          order.status === 'FILLED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : order.status === 'OPEN'
                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                            : order.status === 'CANCELLED'
                            ? 'bg-zinc-800 text-zinc-400'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {order.status === 'FILLED' && <CheckCircle2 className="w-3 h-3" />}
                        {order.status === 'CANCELLED' && <Ban className="w-3 h-3" />}
                        {order.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-zinc-400 font-mono text-[10px]" title={order.polymarketOrderId}>
                      {order.polymarketOrderId.substring(0, 16)}...
                    </td>
                    <td className="py-2.5 px-2 text-[10px] text-zinc-400">
                      {new Date(order.createdAt).toLocaleTimeString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      {canCancel ? (
                        <button
                          type="button"
                          id={`cancel-real-order-btn-${order.id}`}
                          onClick={() => onCancelRealOrder(order.polymarketOrderId)}
                          className="px-2 py-1 rounded bg-zinc-800 hover:bg-rose-950 hover:text-rose-400 hover:border-rose-500/50 text-zinc-400 border border-zinc-700 text-[10px] cursor-pointer transition"
                        >
                          Cancel
                        </button>
                      ) : (
                        <span className="text-zinc-500 text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
