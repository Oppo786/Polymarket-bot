/**
 * Polymarket BTC 5M Trading Terminal - Server Entry Point
 * Express API + SSE Real-time Feed + Vite Integration
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import {
  getMarket,
  getConditionalOrders,
  getRealOrders,
  getPositions,
  getRecentSystemEvents,
  getDb,
} from './src/server/database/db.js';
import { marketDiscovery } from './src/server/market/market-discovery.js';
import { clobWebSocket } from './src/server/polymarket/clob-websocket.js';
import { polymarketClient } from './src/server/polymarket/clob-client.js';
import { triggerEngine } from './src/server/trading/trigger-engine.js';
import { reconciler } from './src/server/trading/reconciler.js';
import { btcPriceFeed } from './src/server/market/btc-price-feed.js';
import { eventBus } from './src/server/events/event-bus.js';

const PORT = 3000;
const app = express();

app.use(express.json());

// Optional auth middleware for sensitive trading commands if DASHBOARD_AUTH_PASSWORD set
const authMiddleware = (req: Request, res: Response, next: () => void) => {
  const secret = process.env.DASHBOARD_AUTH_PASSWORD;
  if (!secret) return next();

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader === `Bearer ${secret}`) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Dashboard password required.' });
};

// -------------------------------------------------------------
// REST API Endpoints
// -------------------------------------------------------------

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    tradingMode: polymarketClient.getTradingMode(),
    wsConnected: clobWebSocket.isWsConnected(),
    market: marketDiscovery.getCurrentMarket()?.slug || 'discovering',
    timestamp: Date.now(),
  });
});

// Real-time Server-Sent Events (SSE) Stream
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  eventBus.registerSseClient(res);

  // Send initial snapshot
  const initial = {
    market: marketDiscovery.getCurrentMarket(),
    priceData: clobWebSocket.getLatestPriceData(),
    tradingMode: polymarketClient.getTradingMode(),
    btcPrice: btcPriceFeed.getPrice(),
  };
  res.write(`event: init\ndata: ${JSON.stringify(initial)}\n\n`);
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }
});

// Account Info
app.get('/api/account', async (req, res) => {
  try {
    const account = await polymarketClient.getAccountInfo();
    res.json(account);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Current Market
app.get('/api/market/current', (req, res) => {
  const market = marketDiscovery.getCurrentMarket();
  const prices = clobWebSocket.getLatestPriceData();
  res.json({ market, prices, btcPrice: btcPriceFeed.getPrice() });
});

// Orderbook
app.get('/api/market/orderbook', (req, res) => {
  const outcome = ((req.query.outcome as string) || 'UP').toUpperCase() as 'UP' | 'DOWN';
  const book = clobWebSocket.getOrderBook(outcome);
  res.json(book || { outcome, bids: [], asks: [], timestamp: Date.now() });
});

// Recent Trades
app.get('/api/market/trades', (req, res) => {
  res.json(clobWebSocket.getRecentTrades());
});

// Conditional Orders
app.get('/api/orders/conditional', async (req, res) => {
  try {
    const orders = await getConditionalOrders();
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create Conditional Order
// IMPORTANT: Sits locally in SQLite until trigger price condition met!
app.post('/api/orders/conditional', authMiddleware, async (req, res) => {
  try {
    const { outcome, side, triggerPrice, orderPrice, triggerSource, triggerDirection, size, takeProfitPrice } = req.body;
    const currentMarket = marketDiscovery.getCurrentMarket();
    if (!currentMarket) {
      return res.status(400).json({ error: 'No active BTC 5M market currently available.' });
    }

    const priceData = clobWebSocket.getLatestPriceData();
    const currentPrice = priceData
      ? triggerEngine.getPriceBySource(priceData, outcome, triggerSource || 'LAST_TRADE')
      : 0.50;

    const order = await triggerEngine.createConditionalOrder({
      market: currentMarket,
      outcome,
      side: side || 'BUY',
      triggerPrice: parseFloat(triggerPrice),
      orderPrice: parseFloat(orderPrice),
      triggerSource,
      triggerDirection,
      sizeUsd: parseFloat(size),
      currentPrice,
      takeProfitPrice:
        takeProfitPrice !== undefined && takeProfitPrice !== null && takeProfitPrice !== ''
          ? parseFloat(takeProfitPrice)
          : undefined,
    });

    res.status(201).json(order);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Cancel Conditional Order
app.delete('/api/orders/conditional/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await triggerEngine.cancelOrder(id);
    res.json({ success: true, message: `Conditional order ${id} cancelled.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Real Orders
app.get('/api/orders/real', async (req, res) => {
  try {
    const orders = await getRealOrders();
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel Real Order
app.post('/api/orders/real/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await polymarketClient.cancelOrder(id);
    res.json({ success: true, message: `Real order ${id} cancellation requested.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Positions
app.get('/api/positions', async (req, res) => {
  try {
    const positions = await getPositions();
    res.json(positions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Live Event Logs
app.get('/api/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const events = await getRecentSystemEvents(limit);
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Settings
app.get('/api/settings', (req, res) => {
  res.json({
    tradingMode: polymarketClient.getTradingMode(),
    hasClobCredentials: Boolean(
      process.env.POLYMARKET_API_KEY &&
      process.env.POLYMARKET_API_SECRET &&
      process.env.POLYMARKET_API_PASSPHRASE
    ),
    hasWalletPrivateKey: Boolean(process.env.POLYMARKET_PRIVATE_KEY),
    funderAddress: process.env.POLYMARKET_FUNDER_ADDRESS || '',
    signatureType: process.env.POLYMARKET_SIGNATURE_TYPE || '0',
    chainId: process.env.POLYMARKET_CHAIN_ID || '137',
    requiresPassword: Boolean(process.env.DASHBOARD_AUTH_PASSWORD),
  });
});

// Update Trading Mode (DRY_RUN vs LIVE)
app.post('/api/settings/trading-mode', authMiddleware, (req, res) => {
  const { mode } = req.body;
  if (mode !== 'DRY_RUN' && mode !== 'LIVE') {
    return res.status(400).json({ error: 'Invalid mode. Must be DRY_RUN or LIVE.' });
  }
  polymarketClient.setTradingMode(mode);
  res.json({ success: true, tradingMode: mode });
});

// Simulation & Acceptance Testing Price Injection Endpoint
// Allows simulating price ticks (e.g. 0.50 -> 0.70 -> 0.90) on the terminal
app.post('/api/simulate/tick', (req, res) => {
  const { outcome = 'UP', price } = req.body;
  const p = parseFloat(price);
  if (isNaN(p) || p <= 0 || p >= 1.0) {
    return res.status(400).json({ error: 'Price must be between 0.01 and 0.99' });
  }
  clobWebSocket.injectPrice(outcome, p);
  res.json({ success: true, outcome, injectedPrice: p });
});

// Direct Test Order Endpoint (supports checking live signing & execution)
app.post('/api/test-order', authMiddleware, async (req, res) => {
  try {
    const market = marketDiscovery.getCurrentMarket();
    if (!market) {
      return res.status(400).json({ error: 'No active BTC 5M market discovered yet.' });
    }
    const outcome = (req.body.outcome || 'UP') as 'UP' | 'DOWN';
    const side = (req.body.side || 'BUY') as 'BUY' | 'SELL';
    const price = parseFloat(req.body.price || '0.50');
    const amountUsd = parseFloat(req.body.amountUsd || '5.0');
    const tokenId = outcome === 'UP' ? market.upTokenId : market.downTokenId;

    const result = await polymarketClient.submitOrder({
      conditionalOrderId: `test_${Date.now()}`,
      marketId: market.id,
      marketSlug: market.slug,
      outcome,
      tokenId,
      side,
      price,
      amountUsd,
    });

    res.json({ success: true, order: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// -------------------------------------------------------------
// App Boot & Integration Setup
// -------------------------------------------------------------

async function startServer() {
  // Initialize Database
  await getDb();

  // Wire up Market Discovery -> WebSocket & Trigger Engine
  marketDiscovery.onMarketChange((newMarket, oldMarket) => {
    clobWebSocket.updateMarket(newMarket);
    if (oldMarket) {
      triggerEngine.handleMarketExpired(oldMarket.slug);
    }
  });

  // Wire up Price Updates -> Trigger Engine
  clobWebSocket.onPriceUpdate((priceData) => {
    triggerEngine.evaluatePriceTick(priceData).catch((err) => {
      console.error('[TriggerEngine] Price tick evaluation error:', err);
    });
  });

  // Start Services
  btcPriceFeed.start();
  await triggerEngine.start();
  await marketDiscovery.start();
  clobWebSocket.start();

  // Run restart recovery & order reconciliation
  await reconciler.reconcileOnStartup();

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Polymarket Terminal] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[FATAL] Error starting server:', err);
  process.exit(1);
});
