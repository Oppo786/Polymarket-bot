import React, { useState } from 'react';
import { BookOpen, History, ArrowDown, ArrowUp } from 'lucide-react';
import { OrderBook, PublicTrade, OutcomeType } from '../server/types';
import { formatDollar, formatCents } from '../utils/formatters';

interface OrderBookAndTradesProps {
  upBook: OrderBook | null;
  downBook: OrderBook | null;
  recentTrades: PublicTrade[];
  selectedOutcome: OutcomeType;
  onSelectOutcome: (outcome: OutcomeType) => void;
}

export const OrderBookAndTrades: React.FC<OrderBookAndTradesProps> = ({
  upBook,
  downBook,
  recentTrades,
  selectedOutcome,
  onSelectOutcome,
}) => {
  const [activeTab, setActiveTab] = useState<'BOOK' | 'TRADES'>('BOOK');

  const book = selectedOutcome === 'UP' ? upBook : downBook;
  const bids = book?.bids || [];
  const asks = book?.asks || [];

  const maxBidSize = Math.max(...bids.map((b) => b.size), 1);
  const maxAskSize = Math.max(...asks.map((a) => a.size), 1);

  return (
    <div id="orderbook-trades-card" className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3 font-mono text-xs">
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="tab-book-btn"
            onClick={() => setActiveTab('BOOK')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded cursor-pointer transition ${
              activeTab === 'BOOK'
                ? 'bg-zinc-800 text-zinc-100 font-bold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>ORDER BOOK</span>
          </button>
          <button
            type="button"
            id="tab-trades-btn"
            onClick={() => setActiveTab('TRADES')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded cursor-pointer transition ${
              activeTab === 'TRADES'
                ? 'bg-zinc-800 text-zinc-100 font-bold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>RECENT TRADES</span>
          </button>
        </div>

        {/* Outcome Selector */}
        <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded border border-zinc-800">
          <button
            type="button"
            id="book-outcome-up"
            onClick={() => onSelectOutcome('UP')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
              selectedOutcome === 'UP'
                ? 'bg-emerald-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            UP
          </button>
          <button
            type="button"
            id="book-outcome-down"
            onClick={() => onSelectOutcome('DOWN')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
              selectedOutcome === 'DOWN'
                ? 'bg-rose-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            DOWN
          </button>
        </div>
      </div>

      {activeTab === 'BOOK' ? (
        <div className="space-y-3">
          {/* ASKS (Sell Orders) */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase text-zinc-400 font-semibold flex justify-between px-1">
              <span>Asks (Price)</span>
              <span>Size</span>
            </div>
            {asks.slice(0, 4).reverse().map((ask, i) => (
              <div key={i} className="relative flex justify-between items-center px-1.5 py-0.5 rounded bg-zinc-950/60 overflow-hidden">
                <div
                  className="absolute right-0 top-0 bottom-0 bg-rose-950/40 border-l border-rose-500/20 pointer-events-none"
                  style={{ width: `${Math.min(100, (ask.size / maxAskSize) * 100)}%` }}
                />
                <span className="text-rose-400 font-bold relative z-10">{formatDollar(ask.price)} ({formatCents(ask.price)})</span>
                <span className="text-zinc-400 text-[11px] relative z-10">{ask.size.toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* SPREAD DIVIDER */}
          <div className="flex items-center justify-between px-2 py-1 bg-zinc-950 border-y border-zinc-800/80 text-[11px]">
            <span className="text-zinc-400">Spread:</span>
            <span className="text-zinc-300 font-bold">
              {asks[0] && bids[0] ? formatDollar(asks[0].price - bids[0].price) : '$0.02'}
            </span>
          </div>

          {/* BIDS (Buy Orders) */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase text-zinc-400 font-semibold flex justify-between px-1">
              <span>Bids (Price)</span>
              <span>Size</span>
            </div>
            {bids.slice(0, 4).map((bid, i) => (
              <div key={i} className="relative flex justify-between items-center px-1.5 py-0.5 rounded bg-zinc-950/60 overflow-hidden">
                <div
                  className="absolute right-0 top-0 bottom-0 bg-emerald-950/40 border-l border-emerald-500/20 pointer-events-none"
                  style={{ width: `${Math.min(100, (bid.size / maxBidSize) * 100)}%` }}
                />
                <span className="text-emerald-400 font-bold relative z-10">{formatDollar(bid.price)} ({formatCents(bid.price)})</span>
                <span className="text-zinc-400 text-[11px] relative z-10">{bid.size.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* RECENT TRADES TAB */
        <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
          <div className="text-[10px] uppercase text-zinc-400 font-semibold flex justify-between px-1 mb-1">
            <span>Price / Outcome</span>
            <span>Size</span>
            <span>Time</span>
          </div>
          {recentTrades.length === 0 ? (
            <div className="text-center py-6 text-zinc-400 text-xs">Waiting for live trade events...</div>
          ) : (
            recentTrades.slice(0, 15).map((trade) => (
              <div
                key={trade.id}
                className="flex items-center justify-between px-1.5 py-1 rounded bg-zinc-950/50 text-[11px]"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`font-bold ${
                      trade.outcome === 'UP' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatDollar(trade.price)} ({formatCents(trade.price)})
                  </span>
                  <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1 rounded">
                    {trade.outcome}
                  </span>
                </div>
                <span className="text-zinc-400">${trade.size.toFixed(2)}</span>
                <span className="text-zinc-400 text-[10px]">
                  {new Date(trade.timestamp).toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
