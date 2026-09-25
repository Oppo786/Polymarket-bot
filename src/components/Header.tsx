import React, { useState } from 'react';
import { Activity, ShieldAlert, Cpu, CheckCircle2, AlertTriangle } from 'lucide-react';
import { TradingMode, AccountInfo } from '../server/types';

interface HeaderProps {
  btcPrice: number;
  tradingMode: TradingMode;
  isWsConnected: boolean;
  account: AccountInfo | null;
  onToggleTradingMode: (newMode: TradingMode) => void;
  onOpenSimulator: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  btcPrice,
  tradingMode,
  isWsConnected,
  account,
  onToggleTradingMode,
  onOpenSimulator,
}) => {
  const [showModeModal, setShowModeModal] = useState(false);

  const isLive = tradingMode === 'LIVE';

  return (
    <>
      <header id="terminal-header" className="w-full border-b border-zinc-800 bg-zinc-950/90 backdrop-blur px-3 sm:px-4 py-2 sm:py-3 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
          {/* Logo & Product Tag */}
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded bg-gradient-to-br from-amber-500 to-amber-700 text-zinc-950 font-black text-xs sm:text-sm tracking-wider shadow shrink-0">
                5M
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono font-bold text-zinc-100 text-sm sm:text-base tracking-tight">POLYMARKET BTC 5M</span>
                  <span className="text-[9px] sm:text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700">
                    CLOB TERMINAL
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-zinc-400 font-mono hidden xs:block">Custom Conditional Trigger Order Engine</p>
              </div>
            </div>
          </div>

          {/* BTC Price & WS Status & Action Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 w-full md:w-auto">
            {/* Live BTC Price */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2 sm:px-3 py-1 sm:py-1.5 rounded text-xs">
              <span className="text-[10px] sm:text-xs font-mono text-zinc-400">BTC</span>
              <span className="font-mono text-xs sm:text-sm font-semibold text-emerald-400 tracking-tight">
                ${btcPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Connection Status */}
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-mono bg-zinc-900 border border-zinc-800 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded">
              <span className={`w-2 h-2 rounded-full shrink-0 ${isWsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-zinc-300">{isWsConnected ? 'WS Live' : 'Connecting...'}</span>
            </div>

            {/* Acceptance Test Simulator Button */}
            <button
              id="open-simulator-btn"
              onClick={onOpenSimulator}
              className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/30 hover:border-amber-500/60 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded text-[10px] sm:text-xs font-mono transition cursor-pointer"
            >
              <Cpu className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />
              <span>Simulator</span>
            </button>

            {/* DRY RUN / LIVE TRADING Toggle */}
            <button
              id="trading-mode-toggle-btn"
              onClick={() => setShowModeModal(true)}
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[10px] sm:text-xs font-mono font-bold tracking-wide transition border cursor-pointer ${
                isLive
                  ? 'bg-rose-950/80 text-rose-300 border-rose-500 animate-pulse hover:bg-rose-900'
                  : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/60'
              }`}
            >
              {isLive ? (
                <>
                  <ShieldAlert className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-400 shrink-0" />
                  <span>LIVE</span>
                </>
              ) : (
                <>
                  <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />
                  <span>DRY RUN</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Switch Mode Confirmation Modal */}
      {showModeModal && (
        <div id="mode-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              {isLive ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-rose-500" />
              )}
              <h3 className="text-base font-bold text-zinc-100 font-mono">
                {isLive ? 'Switch to DRY RUN Mode?' : 'CAUTION: Switch to LIVE Trading?'}
              </h3>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed font-sans">
              {isLive
                ? 'In DRY RUN mode, all conditional orders and triggers will execute locally in simulation without risking real Polymarket funds.'
                : 'In LIVE mode, when your conditional trigger price is hit, the system will submit REAL orders to the Polymarket CLOB using your configured wallet and credentials. Real money will be at risk.'}
            </p>

            <div className="bg-zinc-950 border border-zinc-800 p-3 rounded font-mono text-xs text-zinc-400 space-y-1">
              <div>Current Mode: <span className="font-semibold text-zinc-200">{tradingMode}</span></div>
              <div>Wallet Configured: <span className="font-semibold text-zinc-200">{account?.isConfigured ? 'Yes (Signer Loaded)' : 'No (Local Simulated)'}</span></div>
              <div>CLOB Credentials: <span className="font-semibold text-zinc-200">{account?.hasClobCredentials ? 'Configured' : 'Missing (Read-Only/Sim)'}</span></div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                id="cancel-mode-switch-btn"
                onClick={() => setShowModeModal(false)}
                className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                id="confirm-mode-switch-btn"
                onClick={() => {
                  onToggleTradingMode(isLive ? 'DRY_RUN' : 'LIVE');
                  setShowModeModal(false);
                }}
                className={`px-4 py-2 rounded text-xs font-mono font-bold cursor-pointer transition ${
                  isLive
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {isLive ? 'Switch to DRY RUN' : 'I Understand, Enable LIVE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
