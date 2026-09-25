import React from 'react';
import { Wallet, DollarSign, PieChart, TrendingUp, TrendingDown, Layers } from 'lucide-react';
import { AccountInfo, Position, MarketPriceData } from '../server/types';

interface AccountOverviewProps {
  account: AccountInfo | null;
  positions: Position[];
  prices: MarketPriceData | null;
}

export const AccountOverview: React.FC<AccountOverviewProps> = ({
  account,
  positions,
  prices,
}) => {
  const upPosition = positions.find((p) => p.outcome === 'UP');
  const downPosition = positions.find((p) => p.outcome === 'DOWN');

  const upPrice = prices?.up.lastTrade ?? 0.50;
  const downPrice = prices?.down.lastTrade ?? 0.50;

  const upShares = upPosition?.shares ?? 0;
  const downShares = downPosition?.shares ?? 0;

  const upValue = upShares * upPrice;
  const downValue = downShares * downPrice;
  const totalPositionValue = upValue + downValue;

  const upUnrealized = upShares > 0 ? (upPrice - (upPosition?.averagePrice ?? 0)) * upShares : 0;
  const downUnrealized = downShares > 0 ? (downPrice - (downPosition?.averagePrice ?? 0)) * downShares : 0;
  const totalUnrealized = upUnrealized + downUnrealized;

  const totalRealized = positions.reduce((acc, p) => acc + (p.realizedPnl || 0), 0);

  return (
    <div id="account-overview-card" className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4 font-mono">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-zinc-100 tracking-tight">ACCOUNT & PORTFOLIO</h3>
        </div>
        <div className="text-[11px] text-zinc-400 font-mono">
          {account?.funderAddress ? (
            <span title={`Polymarket Proxy: ${account.funderAddress}`}>
              Proxy: {account.funderAddress.substring(0, 6)}...{account.funderAddress.substring(account.funderAddress.length - 4)}
            </span>
          ) : account?.walletAddress ? (
            <span title={`Signer Wallet: ${account.walletAddress}`}>
              Wallet: {account.walletAddress.substring(0, 6)}...{account.walletAddress.substring(account.walletAddress.length - 4)}
            </span>
          ) : (
            'Local Simulated Wallet'
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {/* Total Balance */}
        <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
          <div className="text-[10px] uppercase text-zinc-400 tracking-wider">USDC Balance</div>
          <div className="text-base font-bold text-zinc-100 mt-1">
            ${(account?.usdcBalance ?? 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">
            Available: ${(account?.availableBalance ?? 1000).toFixed(2)}
          </div>
        </div>

        {/* Current Position Value */}
        <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
          <div className="text-[10px] uppercase text-zinc-400 tracking-wider">Positions Value</div>
          <div className="text-base font-bold text-zinc-100 mt-1">
            ${totalPositionValue.toFixed(2)}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">
            UP: ${upValue.toFixed(2)} | DOWN: ${downValue.toFixed(2)}
          </div>
        </div>

        {/* Unrealized P/L */}
        <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
          <div className="text-[10px] uppercase text-zinc-400 tracking-wider">Unrealized P/L</div>
          <div
            className={`text-base font-bold mt-1 ${
              totalUnrealized >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {totalUnrealized >= 0 ? '+' : ''}${totalUnrealized.toFixed(2)}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Marked to Live Ticks</div>
        </div>

        {/* Realized P/L */}
        <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80">
          <div className="text-[10px] uppercase text-zinc-400 tracking-wider">Realized P/L</div>
          <div
            className={`text-base font-bold mt-1 ${
              totalRealized >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {totalRealized >= 0 ? '+' : ''}${totalRealized.toFixed(2)}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Closed Trades</div>
        </div>
      </div>

      {/* Position Breakdown Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
        <div className="flex items-center justify-between p-2.5 rounded bg-zinc-950 border border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-zinc-300 font-bold">UP Outcome:</span>
          </div>
          <div className="text-right">
            <span className="text-emerald-400 font-bold">{upShares} shares</span>
            <span className="text-zinc-500 text-[10px] ml-2">
              (Avg: ${upPosition?.averagePrice.toFixed(2) || '0.00'})
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between p-2.5 rounded bg-zinc-950 border border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span className="text-zinc-300 font-bold">DOWN Outcome:</span>
          </div>
          <div className="text-right">
            <span className="text-rose-400 font-bold">{downShares} shares</span>
            <span className="text-zinc-500 text-[10px] ml-2">
              (Avg: ${downPosition?.averagePrice.toFixed(2) || '0.00'})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
