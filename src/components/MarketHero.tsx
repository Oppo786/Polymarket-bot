import React, { useEffect, useState } from 'react';
import { Clock, TrendingUp, TrendingDown, Layers } from 'lucide-react';
import { Btc5mMarket, MarketPriceData, OutcomeType } from '../server/types';
import { formatDollar, formatCents, formatProbability } from '../utils/formatters';

interface MarketHeroProps {
  market: Btc5mMarket | null;
  prices: MarketPriceData | null;
  onSelectOutcome: (outcome: OutcomeType) => void;
  selectedOutcome: OutcomeType;
}

export const MarketHero: React.FC<MarketHeroProps> = ({
  market,
  prices,
  onSelectOutcome,
  selectedOutcome,
}) => {
  const [timeLeftSec, setTimeLeftSec] = useState<number>(300);

  useEffect(() => {
    const updateCountdown = () => {
      if (!market) return;
      const diff = Math.max(0, Math.floor((market.endTime - Date.now()) / 1000));
      setTimeLeftSec(diff);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [market]);

  const minutes = Math.floor(timeLeftSec / 60);
  const seconds = timeLeftSec % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const progressPercent = Math.min(100, Math.max(0, ((300 - timeLeftSec) / 300) * 100));

  const up = prices?.up || {
    lastTrade: 0.50,
    bestBid: 0.49,
    bestAsk: 0.51,
    midPrice: 0.50,
    bidSize: 0,
    askSize: 0,
    spread: 0.02,
  };

  const down = prices?.down || {
    lastTrade: 0.50,
    bestBid: 0.49,
    bestAsk: 0.51,
    midPrice: 0.50,
    bidSize: 0,
    askSize: 0,
    spread: 0.02,
  };

  // The true acquisition price for buying an outcome is Best Ask (fallback to lastTrade if ask is 0)
  const upBuyPrice = up.bestAsk > 0 ? up.bestAsk : (up.lastTrade > 0 ? up.lastTrade : 0.50);
  const downBuyPrice = down.bestAsk > 0 ? down.bestAsk : (down.lastTrade > 0 ? down.lastTrade : 0.50);

  return (
    <div id="market-hero-card" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4">
      {/* Top Bar: Market Question & 5M Countdown */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 border-b border-zinc-800/80 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-amber-950/60 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono font-semibold">
              <Layers className="w-3 h-3" />
              BTC 5-MINUTE
            </span>
            <span className="text-zinc-500 text-[11px] sm:text-xs font-mono truncate max-w-[200px] sm:max-w-none">
              {market?.slug || 'discovering...'}
            </span>
          </div>
          <h2 className="text-xs sm:text-sm font-semibold text-zinc-100 font-mono tracking-tight">
            {market?.question || 'BTC 5-Minute Up or Down Market'}
          </h2>
        </div>

        {/* 5-Minute Window Countdown Timer */}
        <div className="flex items-center gap-2.5 bg-zinc-950 border border-zinc-800 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded">
          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <div>
            <div className="text-[9px] sm:text-[10px] uppercase font-mono text-zinc-400 tracking-wider">Expires In</div>
            <div className="text-xs sm:text-sm font-mono font-bold text-zinc-100 tracking-wider">
              {timeFormatted}
            </div>
          </div>
          {/* Progress Mini Bar */}
          <div className="w-10 sm:w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden shrink-0">
            <div
              className={`h-full transition-all duration-1000 ${
                timeLeftSec < 60 ? 'bg-rose-500' : 'bg-amber-400'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* UP vs DOWN Market Prices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {/* UP OUTCOME CARD */}
        <div
          id="outcome-card-up"
          onClick={() => onSelectOutcome('UP')}
          className={`relative p-4 rounded border transition cursor-pointer ${
            selectedOutcome === 'UP'
              ? 'bg-emerald-950/30 border-emerald-500 ring-1 ring-emerald-500/50'
              : 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-mono font-bold text-emerald-400">UP</span>
                <span className="text-[11px] font-mono text-zinc-400 ml-1.5">Outcome</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-mono font-black text-emerald-400 flex items-baseline justify-end gap-1.5">
                <span>{formatCents(upBuyPrice)}</span>
                <span className="text-xs text-emerald-400/80 font-normal">({formatDollar(upBuyPrice)})</span>
              </div>
              <div className="text-[10px] font-mono text-zinc-400 flex items-center justify-end gap-1">
                <span className="text-emerald-400 font-semibold">Best Ask (Buy)</span>
                <span>·</span>
                <span className="text-zinc-200 font-bold">{formatProbability(upBuyPrice)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-2 border-t border-zinc-800/60 font-mono text-xs">
            <div>
              <div className="text-[10px] text-zinc-400">Best Bid</div>
              <div className="text-zinc-200 font-medium">{formatDollar(up.bestBid)}</div>
            </div>
            <div className="bg-emerald-500/10 rounded px-1 py-0.5 -my-0.5 border border-emerald-500/30">
              <div className="text-[10px] text-emerald-400 font-bold">Best Ask</div>
              <div className="text-emerald-300 font-bold">{formatDollar(up.bestAsk)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-400">Last Trade</div>
              <div className="text-zinc-400 font-medium">{formatDollar(up.lastTrade)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-400">Spread</div>
              <div className="text-zinc-400 font-medium">{formatDollar(up.spread)}</div>
            </div>
          </div>
        </div>

        {/* DOWN OUTCOME CARD */}
        <div
          id="outcome-card-down"
          onClick={() => onSelectOutcome('DOWN')}
          className={`relative p-4 rounded border transition cursor-pointer ${
            selectedOutcome === 'DOWN'
              ? 'bg-rose-950/30 border-rose-500 ring-1 ring-rose-500/50'
              : 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <TrendingDown className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-mono font-bold text-rose-400">DOWN</span>
                <span className="text-[11px] font-mono text-zinc-400 ml-1.5">Outcome</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-mono font-black text-rose-400 flex items-baseline justify-end gap-1.5">
                <span>{formatCents(downBuyPrice)}</span>
                <span className="text-xs text-rose-400/80 font-normal">({formatDollar(downBuyPrice)})</span>
              </div>
              <div className="text-[10px] font-mono text-zinc-400 flex items-center justify-end gap-1">
                <span className="text-rose-400 font-semibold">Best Ask (Buy)</span>
                <span>·</span>
                <span className="text-zinc-200 font-bold">{formatProbability(downBuyPrice)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-2 border-t border-zinc-800/60 font-mono text-xs">
            <div>
              <div className="text-[10px] text-zinc-400">Best Bid</div>
              <div className="text-zinc-200 font-medium">{formatDollar(down.bestBid)}</div>
            </div>
            <div className="bg-rose-500/10 rounded px-1 py-0.5 -my-0.5 border border-rose-500/30">
              <div className="text-[10px] text-rose-400 font-bold">Best Ask</div>
              <div className="text-rose-300 font-bold">{formatDollar(down.bestAsk)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-400">Last Trade</div>
              <div className="text-zinc-400 font-medium">{formatDollar(down.lastTrade)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-400">Spread</div>
              <div className="text-zinc-400 font-medium">{formatDollar(down.spread)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
