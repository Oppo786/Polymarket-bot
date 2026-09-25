import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Trash2, ArrowDownCircle } from 'lucide-react';
import { SystemEvent } from '../server/types';

interface LiveConsoleProps {
  events: SystemEvent[];
  onClearEvents?: () => void;
}

export const LiveConsole: React.FC<LiveConsoleProps> = ({ events, onClearEvents }) => {
  const [filter, setFilter] = useState<string>('ALL');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const filteredEvents = events.filter((ev) => {
    if (filter === 'ALL') return true;
    return ev.type.toUpperCase() === filter;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'success':
        return 'text-emerald-400';
      case 'warn':
        return 'text-amber-400';
      case 'error':
        return 'text-rose-400';
      case 'info':
      default:
        return 'text-zinc-300';
    }
  };

  return (
    <div id="live-console-card" className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-2 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-bold text-zinc-100 tracking-tight">LIVE TERMINAL LOGS</span>
          <span className="text-[10px] text-zinc-400">({events.length})</span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 text-[10px]">
          {['ALL', 'TRIGGER', 'ORDER', 'WS', 'SYSTEM'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-2 py-0.5 rounded cursor-pointer transition ${
                filter === cat
                  ? 'bg-zinc-800 text-zinc-100 font-bold border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-300'
              }`}
            >
              {cat}
            </button>
          ))}
          <label className="flex items-center gap-1 text-zinc-400 ml-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-zinc-900 border-zinc-700 text-amber-500"
            />
            <span>Auto-scroll</span>
          </label>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div
        ref={scrollRef}
        className="h-48 overflow-y-auto space-y-1 bg-black/60 p-2.5 rounded border border-zinc-900 font-mono text-[11px] leading-relaxed select-text"
      >
        {filteredEvents.length === 0 ? (
          <div className="text-zinc-400 py-4 text-center">System event logs will appear here in real-time...</div>
        ) : (
          filteredEvents.map((ev) => {
            const time = new Date(ev.timestamp).toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            return (
              <div key={ev.id} className="flex items-start gap-2 hover:bg-zinc-900/40 px-1 rounded">
                <span className="text-zinc-400 shrink-0">[{time}]</span>
                <span className="text-zinc-400 font-semibold shrink-0">[{ev.type}]</span>
                <span className={`break-words ${getLevelColor(ev.level)}`}>{ev.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
