import React, { useState } from 'react';
import { Cpu, Play, CheckCircle2, XCircle, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { OutcomeType } from '../server/types';

interface TestSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInjectPrice: (outcome: OutcomeType, price: number) => Promise<void>;
}

export const TestSimulatorModal: React.FC<TestSimulatorModalProps> = ({
  isOpen,
  onClose,
  onInjectPrice,
}) => {
  const [isRunningScenario, setIsRunningScenario] = useState<boolean>(false);
  const [scenarioStep, setScenarioStep] = useState<string>('');
  const [customPrice, setCustomPrice] = useState<string>('0.75');
  const [customOutcome, setCustomOutcome] = useState<OutcomeType>('UP');

  if (!isOpen) return null;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Scenario 1: Upward Breakout (0.50 -> 0.70 -> 0.80 -> 0.89 -> 0.90)
  const runScenario1 = async () => {
    setIsRunningScenario(true);
    const steps = [0.50, 0.60, 0.70, 0.80, 0.89, 0.90, 0.91];

    for (const p of steps) {
      setScenarioStep(`Injecting UP = $${p.toFixed(2)} (${p >= 0.90 ? 'TRIGGER HIT!' : 'WAITING'})`);
      await onInjectPrice('UP', p);
      await sleep(1200);
    }

    setScenarioStep('Scenario 1 Complete! Check orders table and event console.');
    setIsRunningScenario(false);
  };

  // Scenario 2: Downward Dip (0.50 -> 0.48 -> 0.45 -> 0.41 -> 0.40)
  const runScenario2 = async () => {
    setIsRunningScenario(true);
    const steps = [0.50, 0.48, 0.45, 0.42, 0.40, 0.39];

    for (const p of steps) {
      setScenarioStep(`Injecting UP = $${p.toFixed(2)} (${p <= 0.40 ? 'TRIGGER HIT!' : 'WAITING'})`);
      await onInjectPrice('UP', p);
      await sleep(1200);
    }

    setScenarioStep('Scenario 2 Complete! Check orders table and event console.');
    setIsRunningScenario(false);
  };

  // Scenario 3: Duplicate Protection (Rapid 0.90 -> 0.91 -> 0.92 -> 0.91 -> 0.90)
  const runScenario3 = async () => {
    setIsRunningScenario(true);
    const steps = [0.90, 0.91, 0.92, 0.91, 0.90];

    for (const p of steps) {
      setScenarioStep(`Rapid Tick: UP = $${p.toFixed(2)} (Duplicate Protection Check)`);
      await onInjectPrice('UP', p);
      await sleep(500);
    }

    setScenarioStep('Duplicate Test Complete! Verify only ONE real order was generated.');
    setIsRunningScenario(false);
  };

  const handleManualInject = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(customPrice);
    if (isNaN(p) || p <= 0 || p >= 1.0) return;
    await onInjectPrice(customOutcome, p);
  };

  return (
    <div id="test-simulator-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-xl w-full shadow-2xl space-y-5 font-mono text-xs">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-bold text-zinc-100 tracking-tight">ACCEPTANCE TEST SIMULATOR</h3>
              <p className="text-[11px] text-zinc-400">Validate real-time trigger transitions and duplicate protection</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {scenarioStep && (
          <div className="bg-amber-950/40 border border-amber-500/40 p-3 rounded flex items-center gap-2 text-amber-300">
            <Zap className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
            <span>{scenarioStep}</span>
          </div>
        )}

        {/* Preset Scenarios */}
        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">
            Automated Acceptance Scenarios
          </div>

          {/* Scenario 1 */}
          <div className="bg-zinc-950 border border-zinc-800 p-3 rounded space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-200">Scenario 1: Breakout Trigger Above ($0.50 → $0.90)</span>
              <button
                type="button"
                id="btn-run-scenario-1"
                disabled={isRunningScenario}
                onClick={runScenario1}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold cursor-pointer transition shadow"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Simulate</span>
              </button>
            </div>
            <div className="text-[11px] text-zinc-400 leading-tight">
              Steps: $0.50 (Wait) → $0.70 (Wait) → $0.80 (Wait) → $0.89 (Wait) → $0.90 (TRIGGER & SUBMIT ORDER).
            </div>
          </div>

          {/* Scenario 2 */}
          <div className="bg-zinc-950 border border-zinc-800 p-3 rounded space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-200">Scenario 2: Pullback Trigger Below ($0.50 → $0.40)</span>
              <button
                type="button"
                id="btn-run-scenario-2"
                disabled={isRunningScenario}
                onClick={runScenario2}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold cursor-pointer transition shadow"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Simulate</span>
              </button>
            </div>
            <div className="text-[11px] text-zinc-400 leading-tight">
              Steps: $0.50 (Wait) → $0.48 (Wait) → $0.45 (Wait) → $0.41 (Wait) → $0.40 (TRIGGER & SUBMIT ORDER).
            </div>
          </div>

          {/* Scenario 3 */}
          <div className="bg-zinc-950 border border-zinc-800 p-3 rounded space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-200">Scenario 3: Duplicate Protection (Oscillating Ticks)</span>
              <button
                type="button"
                id="btn-run-scenario-3"
                disabled={isRunningScenario}
                onClick={runScenario3}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-zinc-950 font-bold cursor-pointer transition shadow"
              >
                <ShieldCheck className="w-3 h-3" />
                <span>Simulate</span>
              </button>
            </div>
            <div className="text-[11px] text-zinc-400 leading-tight">
              Ticks: 0.90 → 0.91 → 0.92 → 0.91 → 0.90. Verifies mutex lock prevents creating duplicate orders.
            </div>
          </div>
        </div>

        {/* Manual Price Injection Form */}
        <form onSubmit={handleManualInject} className="bg-zinc-950 border border-zinc-800 p-3 rounded space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">
            Manual Price Tick Injection
          </div>
          <div className="flex gap-2">
            <select
              value={customOutcome}
              onChange={(e) => setCustomOutcome(e.target.value as OutcomeType)}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200"
            >
              <option value="UP">UP Token</option>
              <option value="DOWN">DOWN Token</option>
            </select>
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1.5 text-zinc-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="0.99"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded py-1.5 pl-6 pr-2 text-zinc-100 font-bold"
                placeholder="0.75"
              />
            </div>
            <button
              type="submit"
              id="btn-inject-price"
              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold cursor-pointer transition"
            >
              Inject Tick
            </button>
          </div>
        </form>

        {/* Live CLOB Direct Order Test */}
        <div className="bg-zinc-950 border border-zinc-800 p-3 rounded space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-300 font-bold">
                Direct CLOB Order Test
              </div>
              <div className="text-[10px] text-zinc-500">
                Tests EIP-712 order signing and submission directly without waiting for price triggers
              </div>
            </div>
            <button
              type="button"
              id="btn-test-direct-order"
              disabled={isRunningScenario}
              onClick={async () => {
                setIsRunningScenario(true);
                setScenarioStep('Sending direct test order to /api/test-order...');
                try {
                  const res = await fetch('/api/test-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ outcome: customOutcome, price: parseFloat(customPrice) || 0.50, amountUsd: 5 }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setScenarioStep(`Success! Order ID: ${data.order?.polymarketOrderId || 'Submitted'}`);
                  } else {
                    setScenarioStep(`Error: ${data.error || 'Failed'}`);
                  }
                } catch (err: any) {
                  setScenarioStep(`Exception: ${err?.message || err}`);
                }
                setIsRunningScenario(false);
              }}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold cursor-pointer transition shadow"
            >
              Test Order
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono cursor-pointer transition"
          >
            Close Simulator
          </button>
        </div>
      </div>
    </div>
  );
};
