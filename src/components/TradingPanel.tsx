import React, { useState } from 'react';
import { Target, ArrowRight, ShieldCheck, AlertCircle, HelpCircle } from 'lucide-react';
import {
  OutcomeType,
  OrderSide,
  TriggerSource,
  TriggerDirection,
  Btc5mMarket,
  MarketPriceData,
} from '../server/types';
import { formatDollar, formatCents } from '../utils/formatters';

interface TradingPanelProps {
  market: Btc5mMarket | null;
  prices: MarketPriceData | null;
  selectedOutcome: OutcomeType;
  onSelectOutcome: (outcome: OutcomeType) => void;
  onSubmitOrder: (params: {
    outcome: OutcomeType;
    side: OrderSide;
    triggerPrice: number;
    orderPrice: number;
    triggerSource: TriggerSource;
    triggerDirection: TriggerDirection;
    size: number;
  }) => Promise<void>;
}

export const TradingPanel: React.FC<TradingPanelProps> = ({
  market,
  prices,
  selectedOutcome,
  onSelectOutcome,
  onSubmitOrder,
}) => {
  const [side, setSide] = useState<OrderSide>('BUY');
  const [triggerPrice, setTriggerPrice] = useState<string>('0.90');
  const [orderPrice, setOrderPrice] = useState<string>('0.90');
  const [triggerSource, setTriggerSource] = useState<TriggerSource>('BEST_ASK');
  const [size, setSize] = useState<string>('5');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Extract current price for selected outcome and trigger source
  const targetPriceData = selectedOutcome === 'UP' ? prices?.up : prices?.down;
  const bestAskPrice = targetPriceData?.bestAsk && targetPriceData.bestAsk > 0 ? targetPriceData.bestAsk : (targetPriceData?.lastTrade || 0.50);
  const bestBidPrice = targetPriceData?.bestBid && targetPriceData.bestBid > 0 ? targetPriceData.bestBid : (targetPriceData?.lastTrade || 0.50);

  const currentPrice = (() => {
    if (!targetPriceData) return 0.50;
    switch (triggerSource) {
      case 'BEST_BID':
        return targetPriceData.bestBid;
      case 'BEST_ASK':
        return targetPriceData.bestAsk;
      case 'MID_PRICE':
        return targetPriceData.midPrice;
      case 'LAST_TRADE':
      default:
        return targetPriceData.lastTrade;
    }
  })();

  const upDisplayPrice = prices?.up.bestAsk && prices.up.bestAsk > 0 ? prices.up.bestAsk : (prices?.up.lastTrade || 0.50);
  const downDisplayPrice = prices?.down.bestAsk && prices.down.bestAsk > 0 ? prices.down.bestAsk : (prices?.down.lastTrade || 0.50);

  const numTrigger = parseFloat(triggerPrice) || 0.50;
  const numOrder = parseFloat(orderPrice) || 0.50;
  const numSize = parseFloat(size) || 5;

  // Intelligent Direction Determination
  // If triggerPrice >= currentPrice -> ABOVE_OR_EQUAL
  // If triggerPrice < currentPrice -> BELOW_OR_EQUAL
  const inferredDirection: TriggerDirection =
    numTrigger >= currentPrice ? 'ABOVE_OR_EQUAL' : 'BELOW_OR_EQUAL';

  const directionSymbol = inferredDirection === 'ABOVE_OR_EQUAL' ? '>=' : '<=';

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (numTrigger <= 0 || numTrigger >= 1.0) {
      setErrorMsg('Trigger price must be between $0.01 and $0.99');
      return;
    }
    if (numOrder <= 0 || numOrder >= 1.0) {
      setErrorMsg('Order price must be between $0.01 and $0.99');
      return;
    }
    if (numSize <= 0) {
      setErrorMsg('Size must be greater than $0.00');
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSubmitOrder({
        outcome: selectedOutcome,
        side,
        triggerPrice: numTrigger,
        orderPrice: numOrder,
        triggerSource,
        triggerDirection: inferredDirection,
        size: numSize,
      });
      setShowConfirmModal(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create conditional order');
    } finally {
      setIsSubmitting(false);
    }
  };

  const expiryTimeFormatted = market
    ? new Date(market.endTime).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '--:--:--';

  return (
    <>
      <div id="trading-panel" className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-zinc-100 font-mono tracking-tight">TRADING PANEL</h3>
          </div>
          <span className="text-[11px] font-mono text-zinc-400">Custom Conditional Orders</span>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 p-2.5 bg-rose-950/60 border border-rose-500/50 rounded text-rose-300 text-xs font-mono">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleOpenConfirm} className="space-y-4 font-mono text-xs">
          {/* Outcome Selector: [ UP ] [ DOWN ] */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5 font-bold">
              Outcome
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="outcome-select-up"
                onClick={() => onSelectOutcome('UP')}
                className={`py-2 px-2 rounded font-bold transition border cursor-pointer ${
                  selectedOutcome === 'UP'
                    ? 'bg-emerald-600 text-white border-emerald-400'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                UP ({formatCents(upDisplayPrice)} / {formatDollar(upDisplayPrice)})
              </button>
              <button
                type="button"
                id="outcome-select-down"
                onClick={() => onSelectOutcome('DOWN')}
                className={`py-2 px-2 rounded font-bold transition border cursor-pointer ${
                  selectedOutcome === 'DOWN'
                    ? 'bg-rose-600 text-white border-rose-400'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                DOWN ({formatCents(downDisplayPrice)} / {formatDollar(downDisplayPrice)})
              </button>
            </div>
          </div>

          {/* Action: [ BUY ] [ SELL ] */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5 font-bold">
              Action
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="action-select-buy"
                onClick={() => setSide('BUY')}
                className={`py-1.5 rounded font-bold transition border cursor-pointer ${
                  side === 'BUY'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                BUY
              </button>
              <button
                type="button"
                id="action-select-sell"
                onClick={() => setSide('SELL')}
                className={`py-1.5 rounded font-bold transition border cursor-pointer ${
                  side === 'SELL'
                    ? 'bg-rose-950 text-rose-300 border-rose-500'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                SELL
              </button>
            </div>
          </div>

          {/* Trigger Price & Order Price Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">
                  Trigger Price
                </label>
                <button
                  type="button"
                  onClick={() => setTriggerPrice(String(currentPrice))}
                  className="text-[10px] text-amber-400/90 hover:text-amber-300 font-mono underline decoration-dotted"
                  title="Click to populate with current price"
                >
                  Current: {formatDollar(currentPrice)} ({formatCents(currentPrice)})
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2 text-zinc-500">$</span>
                <input
                  id="input-trigger-price"
                  type="number"
                  step="any"
                  min="0.001"
                  max="0.999"
                  value={triggerPrice}
                  onChange={(e) => setTriggerPrice(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded py-2 pl-7 pr-3 text-zinc-100 font-bold focus:border-amber-400 focus:outline-none"
                  placeholder="0.90"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">
                  Order Price
                </label>
                <button
                  type="button"
                  onClick={() => setOrderPrice(String(bestAskPrice))}
                  className="text-[10px] text-emerald-400/90 hover:text-emerald-300 font-mono underline decoration-dotted"
                  title="Click to fill with current Best Ask"
                >
                  Best Ask: {formatDollar(bestAskPrice)} ({formatCents(bestAskPrice)})
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2 text-zinc-500">$</span>
                <input
                  id="input-order-price"
                  type="number"
                  step="any"
                  min="0.001"
                  max="0.999"
                  value={orderPrice}
                  onChange={(e) => setOrderPrice(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded py-2 pl-7 pr-3 text-zinc-100 font-bold focus:border-amber-400 focus:outline-none"
                  placeholder="0.90"
                  required
                />
              </div>
            </div>
          </div>

          {/* Trigger Source & Size */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1 font-bold">
                Trigger Source
              </label>
              <select
                id="select-trigger-source"
                value={triggerSource}
                onChange={(e) => setTriggerSource(e.target.value as TriggerSource)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded py-2 px-3 text-zinc-200 focus:border-amber-400 focus:outline-none cursor-pointer"
              >
                <option value="BEST_ASK">Best Ask (Default for Buy)</option>
                <option value="LAST_TRADE">Last Trade</option>
                <option value="BEST_BID">Best Bid</option>
                <option value="MID_PRICE">Mid Price</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1 font-bold">
                Size ($ USDC)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-zinc-500">$</span>
                <input
                  id="input-order-size"
                  type="number"
                  step="1"
                  min="1"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded py-2 pl-7 pr-3 text-zinc-100 font-bold focus:border-amber-400 focus:outline-none"
                  placeholder="5"
                  required
                />
              </div>
            </div>
          </div>

          {/* Quick Size Preset Chips */}
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-[10px] text-zinc-400 mr-1">Presets:</span>
            {[5, 10, 25, 50, 100].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setSize(String(preset))}
                className={`px-2 py-0.5 rounded text-[11px] border cursor-pointer transition ${
                  size === String(preset)
                    ? 'bg-amber-950 text-amber-300 border-amber-500'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                ${preset}
              </button>
            ))}
          </div>

          {/* Intelligent Trigger Logic Evaluation Preview Badge */}
          <div className="bg-zinc-950 border border-zinc-800 p-2.5 rounded text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Trigger Rule:</span>
              <span className="font-bold text-amber-400">
                WAIT UNTIL PRICE {directionSymbol} ${numTrigger.toFixed(2)}
              </span>
            </div>
            <div className="text-[10px] text-zinc-400 leading-tight">
              Current: ${currentPrice.toFixed(2)} → Will NOT place limit order until condition is met.
            </div>
          </div>

          {/* Main Action Button */}
          <button
            type="submit"
            id="create-conditional-order-btn"
            className="w-full py-3 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold font-mono tracking-wide transition shadow cursor-pointer text-xs flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>CREATE CONDITIONAL ORDER</span>
          </button>
          <div className="text-[10px] text-center text-zinc-400 font-sans">
            Saves locally. Order will only be sent to Polymarket after trigger condition is hit.
          </div>
        </form>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div id="conditional-confirm-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full shadow-2xl space-y-4 font-mono">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-zinc-100">CONFIRM CONDITIONAL ORDER</h3>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                LOCAL TRIGGER
              </span>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded p-4 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Current Price:</span>
                <span className="font-bold text-zinc-200">${currentPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Trigger Price:</span>
                <span className="font-bold text-amber-400">${numTrigger.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Order Price:</span>
                <span className="font-bold text-zinc-200">${numOrder.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-800/80 pt-2">
                <span className="text-zinc-400">Trigger Rule:</span>
                <span className="font-bold text-amber-300">
                  PRICE {directionSymbol} ${numTrigger.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Action:</span>
                <span className={`font-bold ${selectedOutcome === 'UP' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {side} {selectedOutcome}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Amount:</span>
                <span className="font-bold text-zinc-200">${numSize.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-800/80 pt-2">
                <span className="text-zinc-400">Market Expires:</span>
                <span className="font-bold text-zinc-400">{expiryTimeFormatted}</span>
              </div>
            </div>

            <div className="text-[11px] text-zinc-400 font-sans leading-relaxed bg-zinc-900 border border-zinc-800/80 p-2.5 rounded">
              ⚠️ If the 5-minute market expires before the trigger price is hit, this order will automatically expire without submitting to Polymarket.
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                id="cancel-confirm-order-btn"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                id="submit-confirmed-order-btn"
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className="px-5 py-2 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-mono font-bold cursor-pointer transition shadow"
              >
                {isSubmitting ? 'SAVING...' : 'CONFIRM CONDITIONAL ORDER'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
