import React from 'react';
import { Clock, CheckCircle2, XCircle, AlertCircle, Ban, ArrowUpRight } from 'lucide-react';
import { ConditionalOrder, ConditionalOrderStatus, MarketPriceData } from '../server/types';
import { formatDollar, formatCents } from '../utils/formatters';

interface ConditionalOrdersTableProps {
  orders: ConditionalOrder[];
  prices: MarketPriceData | null;
  onCancelOrder: (id: string) => Promise<void>;
}

export const ConditionalOrdersTable: React.FC<ConditionalOrdersTableProps> = ({
  orders,
  prices,
  onCancelOrder,
}) => {
  const getStatusBadge = (status: ConditionalOrderStatus) => {
    switch (status) {
      case 'WAITING_FOR_TRIGGER':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
            <Clock className="w-3 h-3 animate-pulse" />
            WAITING_FOR_TRIGGER
          </span>
        );
      case 'TRIGGERED':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse">
            TRIGGERED
          </span>
        );
      case 'SUBMITTING':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse">
            SUBMITTING
          </span>
        );
      case 'OPEN':
        return (
          <span className="inline-flex items-center gap-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
            OPEN (ON CLOB)
          </span>
        );
      case 'FILLED':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
            <CheckCircle2 className="w-3 h-3" />
            FILLED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded text-[10px]">
            <Ban className="w-3 h-3" />
            CANCELLED
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-950/60 text-rose-400 border border-rose-500/40 px-2 py-0.5 rounded text-[10px]">
            <XCircle className="w-3 h-3" />
            EXPIRED
          </span>
        );
      case 'FAILED':
      case 'REJECTED':
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded text-[10px]">
            <AlertCircle className="w-3 h-3" />
            {status}
          </span>
        );
    }
  };

  return (
    <div id="conditional-orders-section" className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3 font-mono">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-zinc-100 tracking-tight">CONDITIONAL ORDERS</h3>
          <span className="text-xs text-zinc-400">({orders.length})</span>
        </div>
        <span className="text-[11px] text-zinc-400 font-sans">
          Local instructions awaiting trigger condition
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-400 tracking-wider">
              <th className="py-2 px-2">ID</th>
              <th className="py-2 px-2">Market</th>
              <th className="py-2 px-2">Outcome</th>
              <th className="py-2 px-2">Side</th>
              <th className="py-2 px-2">Current</th>
              <th className="py-2 px-2">Trigger Price</th>
              <th className="py-2 px-2">Order Price</th>
              <th className="py-2 px-2">Source</th>
              <th className="py-2 px-2">Amount</th>
              <th className="py-2 px-2">Status</th>
              <th className="py-2 px-2">Created</th>
              <th className="py-2 px-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-8 text-center text-zinc-400 text-xs">
                  No conditional orders. Create an order above to begin monitoring.
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const targetPrices = order.outcome === 'UP' ? prices?.up : prices?.down;
                const current = (() => {
                  if (!targetPrices) return order.initialPriceAtCreation;
                  switch (order.triggerSource) {
                    case 'BEST_BID':
                      return targetPrices.bestBid > 0 ? targetPrices.bestBid : order.initialPriceAtCreation;
                    case 'BEST_ASK':
                      return targetPrices.bestAsk > 0 ? targetPrices.bestAsk : order.initialPriceAtCreation;
                    case 'MID_PRICE':
                      return targetPrices.midPrice > 0 ? targetPrices.midPrice : order.initialPriceAtCreation;
                    case 'LAST_TRADE':
                    default:
                      return targetPrices.lastTrade > 0 ? targetPrices.lastTrade : order.initialPriceAtCreation;
                  }
                })();

                const directionSymbol = order.triggerDirection === 'ABOVE_OR_EQUAL' ? '>=' : '<=';
                const canCancel =
                  order.status === 'WAITING_FOR_TRIGGER' || order.status === 'OPEN';

                return (
                  <tr key={order.id} className="hover:bg-zinc-800/30 transition text-[11px]">
                    <td className="py-2.5 px-2 text-zinc-400 font-mono">
                      {order.id.replace('co_', '').substring(0, 8)}
                    </td>
                    <td className="py-2.5 px-2 text-zinc-300 max-w-[140px] truncate" title={order.marketSlug}>
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
                    <td className="py-2.5 px-2 text-zinc-300 font-medium">
                      {formatDollar(current)} <span className="text-[10px] text-zinc-400">({formatCents(current)})</span>
                    </td>
                    <td className="py-2.5 px-2 text-amber-400 font-bold">
                      {directionSymbol} {formatDollar(order.triggerPrice)} <span className="text-[10px] text-amber-400/80 font-normal">({formatCents(order.triggerPrice)})</span>
                    </td>
                    <td className="py-2.5 px-2 text-zinc-200">
                      {formatDollar(order.orderPrice)} <span className="text-[10px] text-zinc-400">({formatCents(order.orderPrice)})</span>
                    </td>
                    <td className="py-2.5 px-2 text-[10px] text-zinc-400">
                      {order.triggerSource.replace('_', ' ')}
                    </td>
                    <td className="py-2.5 px-2 text-zinc-200 font-medium">${order.size.toFixed(2)}</td>
                    <td className="py-2.5 px-2">{getStatusBadge(order.status)}</td>
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
                          id={`cancel-order-btn-${order.id}`}
                          onClick={() => onCancelOrder(order.id)}
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
