import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { MarketHero } from './components/MarketHero';
import { TradingPanel } from './components/TradingPanel';
import { OrderBookAndTrades } from './components/OrderBookAndTrades';
import { ConditionalOrdersTable } from './components/ConditionalOrdersTable';
import { RealOrdersTable } from './components/RealOrdersTable';
import { AccountOverview } from './components/AccountOverview';
import { LiveConsole } from './components/LiveConsole';
import { TestSimulatorModal } from './components/TestSimulatorModal';
import {
  Btc5mMarket,
  MarketPriceData,
  ConditionalOrder,
  RealOrder,
  Position,
  AccountInfo,
  SystemEvent,
  TradingMode,
  OutcomeType,
  OrderSide,
  TriggerSource,
  TriggerDirection,
  OrderBook,
  PublicTrade,
} from './server/types';

export default function App() {
  // Global State
  const [market, setMarket] = useState<Btc5mMarket | null>(null);
  const [prices, setPrices] = useState<MarketPriceData | null>(null);
  const [btcPrice, setBtcPrice] = useState<number>(65200.0);
  const [tradingMode, setTradingMode] = useState<TradingMode>('DRY_RUN');
  const [isWsConnected, setIsWsConnected] = useState<boolean>(true);

  const [conditionalOrders, setConditionalOrders] = useState<ConditionalOrder[]>([]);
  const [realOrders, setRealOrders] = useState<RealOrder[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [events, setEvents] = useState<SystemEvent[]>([]);

  const [upBook, setUpBook] = useState<OrderBook | null>(null);
  const [downBook, setDownBook] = useState<OrderBook | null>(null);
  const [recentTrades, setRecentTrades] = useState<PublicTrade[]>([]);

  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeType>('UP');
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);

  // Initial Data Fetch
  const fetchAllData = useCallback(async () => {
    try {
      const [
        marketRes,
        condRes,
        realRes,
        posRes,
        accRes,
        eventsRes,
        upBookRes,
        downBookRes,
        tradesRes,
      ] = await Promise.all([
        fetch('/api/market/current').then((r) => r.json()).catch(() => null),
        fetch('/api/orders/conditional').then((r) => r.json()).catch(() => []),
        fetch('/api/orders/real').then((r) => r.json()).catch(() => []),
        fetch('/api/positions').then((r) => r.json()).catch(() => []),
        fetch('/api/account').then((r) => r.json()).catch(() => null),
        fetch('/api/events?limit=80').then((r) => r.json()).catch(() => []),
        fetch('/api/market/orderbook?outcome=UP').then((r) => r.json()).catch(() => null),
        fetch('/api/market/orderbook?outcome=DOWN').then((r) => r.json()).catch(() => null),
        fetch('/api/market/trades').then((r) => r.json()).catch(() => []),
      ]);

      if (marketRes?.market) setMarket(marketRes.market);
      if (marketRes?.prices) setPrices(marketRes.prices);
      if (marketRes?.btcPrice) setBtcPrice(marketRes.btcPrice);
      if (Array.isArray(condRes)) setConditionalOrders(condRes);
      if (Array.isArray(realRes)) setRealOrders(realRes);
      if (Array.isArray(posRes)) setPositions(posRes);
      if (accRes) setAccount(accRes);
      if (Array.isArray(eventsRes)) setEvents(eventsRes);
      if (upBookRes) setUpBook(upBookRes);
      if (downBookRes) setDownBook(downBookRes);
      if (Array.isArray(tradesRes)) setRecentTrades(tradesRes);
    } catch (err) {
      console.error('Error fetching terminal data:', err);
    }
  }, []);

  // Real-time Server-Sent Events (SSE) Stream Subscription
  useEffect(() => {
    fetchAllData();

    const eventSource = new EventSource('/api/stream');

    eventSource.onopen = () => {
      setIsWsConnected(true);
    };

    eventSource.onerror = () => {
      setIsWsConnected(false);
    };

    eventSource.addEventListener('init', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.market) setMarket(data.market);
        if (data.priceData) setPrices(data.priceData);
        if (data.tradingMode) setTradingMode(data.tradingMode);
        if (data.btcPrice) setBtcPrice(data.btcPrice);
      } catch (err) {
        console.error('SSE init parse error:', err);
      }
    });

    eventSource.addEventListener('price_tick', (e: MessageEvent) => {
      try {
        const tick: MarketPriceData = JSON.parse(e.data);
        setPrices(tick);
      } catch (err) {
        console.error('SSE price_tick parse error:', err);
      }
    });

    eventSource.addEventListener('btc_price', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.price) setBtcPrice(data.price);
      } catch (err) {
        console.error('SSE btc_price parse error:', err);
      }
    });

    eventSource.addEventListener('market_rollover', (e: MessageEvent) => {
      try {
        const newMarket: Btc5mMarket = JSON.parse(e.data);
        setMarket(newMarket);
        fetchAllData();
      } catch (err) {
        console.error('SSE market_rollover parse error:', err);
      }
    });

    eventSource.addEventListener('conditional_order_created', (e: MessageEvent) => {
      try {
        const newOrder: ConditionalOrder = JSON.parse(e.data);
        setConditionalOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)]);
      } catch (err) {
        console.error('SSE conditional_order_created parse error:', err);
      }
    });

    eventSource.addEventListener('conditional_order_updated', (e: MessageEvent) => {
      try {
        const updated = JSON.parse(e.data);
        setConditionalOrders((prev) =>
          prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
        );
      } catch (err) {
        console.error('SSE conditional_order_updated parse error:', err);
      }
    });

    eventSource.addEventListener('real_order_created', (e: MessageEvent) => {
      try {
        const realOrder: RealOrder = JSON.parse(e.data);
        setRealOrders((prev) => [realOrder, ...prev.filter((o) => o.id !== realOrder.id)]);
        fetchAllData();
      } catch (err) {
        console.error('SSE real_order_created parse error:', err);
      }
    });

    eventSource.addEventListener('system_log', (e: MessageEvent) => {
      try {
        const logEvent: SystemEvent = JSON.parse(e.data);
        setEvents((prev) => [...prev, logEvent]);
      } catch (err) {
        console.error('SSE system_log parse error:', err);
      }
    });

    // Periodic Background Sync (every 10s)
    const interval = setInterval(fetchAllData, 10000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [fetchAllData]);

  // Handler: Create Conditional Order
  const handleCreateConditionalOrder = async (params: {
    outcome: OutcomeType;
    side: OrderSide;
    triggerPrice: number;
    orderPrice: number;
    triggerSource: TriggerSource;
    triggerDirection: TriggerDirection;
    size: number;
    takeProfitPrice?: number;
  }) => {
    const res = await fetch('/api/orders/conditional', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create conditional order');
    }

    const created: ConditionalOrder = await res.json();
    setConditionalOrders((prev) => [created, ...prev]);
  };

  // Handler: Cancel Conditional Order
  const handleCancelConditionalOrder = async (id: string) => {
    const res = await fetch(`/api/orders/conditional/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to cancel conditional order');
    }
    setConditionalOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: 'CANCELLED' } : o))
    );
  };

  // Handler: Cancel Real Order
  const handleCancelRealOrder = async (polymarketOrderId: string) => {
    const res = await fetch(`/api/orders/real/${polymarketOrderId}/cancel`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to cancel Polymarket order');
    }
    setRealOrders((prev) =>
      prev.map((o) => (o.polymarketOrderId === polymarketOrderId ? { ...o, status: 'CANCELLED' } : o))
    );
  };

  // Handler: Toggle Trading Mode
  const handleToggleTradingMode = async (newMode: TradingMode) => {
    const res = await fetch('/api/settings/trading-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: newMode }),
    });
    if (res.ok) {
      setTradingMode(newMode);
    }
  };

  // Handler: Inject Price Tick for Simulator
  const handleInjectPrice = async (outcome: OutcomeType, price: number) => {
    await fetch('/api/simulate/tick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome, price }),
    });
  };

  return (
    <div className="min-h-screen w-full max-w-full bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-500 selection:text-zinc-950 overflow-x-hidden">
      {/* Terminal Header */}
      <Header
        btcPrice={btcPrice}
        tradingMode={tradingMode}
        isWsConnected={isWsConnected}
        account={account}
        onToggleTradingMode={handleToggleTradingMode}
        onOpenSimulator={() => setIsSimulatorOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-2.5 sm:p-4 space-y-3 sm:space-y-4 overflow-x-hidden">
        {/* Active BTC 5M Market & Outcome Cards */}
        <MarketHero
          market={market}
          prices={prices}
          selectedOutcome={selectedOutcome}
          onSelectOutcome={setSelectedOutcome}
        />

        {/* Middle Two-Column Grid: Trading Panel + Order Book */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Custom Conditional Order Form */}
          <div className="lg:col-span-7">
            <TradingPanel
              market={market}
              prices={prices}
              selectedOutcome={selectedOutcome}
              onSelectOutcome={setSelectedOutcome}
              onSubmitOrder={handleCreateConditionalOrder}
            />
          </div>

          {/* Live Order Book & Recent Trades */}
          <div className="lg:col-span-5">
            <OrderBookAndTrades
              upBook={upBook}
              downBook={downBook}
              recentTrades={recentTrades}
              selectedOutcome={selectedOutcome}
              onSelectOutcome={setSelectedOutcome}
            />
          </div>
        </div>

        {/* Account & Portfolio Balances */}
        <AccountOverview
          account={account}
          positions={positions}
          prices={prices}
        />

        {/* Conditional Orders Table */}
        <ConditionalOrdersTable
          orders={conditionalOrders}
          prices={prices}
          onCancelOrder={handleCancelConditionalOrder}
        />

        {/* Real Polymarket Orders Table */}
        <RealOrdersTable
          orders={realOrders}
          onCancelRealOrder={handleCancelRealOrder}
        />

        {/* Live Terminal Event Console */}
        <LiveConsole events={events} />
      </main>

      {/* Test Simulator Modal */}
      <TestSimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        onInjectPrice={handleInjectPrice}
      />
    </div>
  );
}
