/**
 * SQLite Database Manager
 * Uses sql.js WebAssembly with durable filesystem persistence to ./data/trader.sqlite
 */

import fs from 'fs';
import path from 'path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import {
  Btc5mMarket,
  ConditionalOrder,
  RealOrder,
  Position,
  SystemEvent,
  PublicTrade,
} from '../types.js';

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let dbPath: string = path.resolve(process.env.DATABASE_PATH || './data/trader.sqlite');

export async function getDb(): Promise<Database> {
  if (db) return db;

  if (!SQL) {
    SQL = await initSqlJs();
  }

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(dbPath)) {
    try {
      const filebuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(filebuffer);
    } catch (err) {
      console.error('[DB] Failed to load existing SQLite database, creating new one:', err);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  initTables(db);
  migrateSchema(db);
  persistDb();
  return db;
}

/** Additive migrations for existing SQLite files (CREATE TABLE IF NOT EXISTS won't alter columns). */
function migrateSchema(database: Database): void {
  const columns = database.exec(`PRAGMA table_info(conditional_orders);`);
  const existing = new Set<string>();
  if (columns.length > 0) {
    for (const row of columns[0].values) {
      existing.add(String(row[1]));
    }
  }
  if (!existing.has('take_profit_price')) {
    database.run(`ALTER TABLE conditional_orders ADD COLUMN take_profit_price REAL;`);
  }
  if (!existing.has('take_profit_order_id')) {
    database.run(`ALTER TABLE conditional_orders ADD COLUMN take_profit_order_id TEXT;`);
  }
}

export function persistDb(): void {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('[DB] Error persisting SQLite database:', err);
  }
}

function initTables(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS markets (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE,
      question TEXT,
      condition_id TEXT,
      up_token_id TEXT,
      down_token_id TEXT,
      start_time INTEGER,
      end_time INTEGER,
      strike_price REAL,
      active INTEGER,
      resolved INTEGER,
      winner TEXT
    );

    CREATE TABLE IF NOT EXISTS conditional_orders (
      id TEXT PRIMARY KEY,
      market_id TEXT,
      market_slug TEXT,
      outcome TEXT,
      side TEXT,
      trigger_price REAL,
      trigger_direction TEXT,
      trigger_source TEXT,
      order_price REAL,
      size REAL,
      shares REAL,
      take_profit_price REAL,
      status TEXT,
      trading_mode TEXT,
      initial_price_at_creation REAL,
      triggered_price REAL,
      triggered_at INTEGER,
      real_order_id TEXT,
      polymarket_order_id TEXT,
      take_profit_order_id TEXT,
      failure_reason TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_cond_status ON conditional_orders(status);
    CREATE INDEX IF NOT EXISTS idx_cond_market ON conditional_orders(market_id);

    CREATE TABLE IF NOT EXISTS real_orders (
      id TEXT PRIMARY KEY,
      conditional_order_id TEXT,
      polymarket_order_id TEXT,
      market_id TEXT,
      market_slug TEXT,
      outcome TEXT,
      token_id TEXT,
      side TEXT,
      price REAL,
      size REAL,
      amount_usd REAL,
      filled_size REAL,
      average_fill_price REAL,
      status TEXT,
      trading_mode TEXT,
      raw_order_payload TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_real_pm_id ON real_orders(polymarket_order_id);

    CREATE TABLE IF NOT EXISTS order_events (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      event_type TEXT,
      old_status TEXT,
      new_status TEXT,
      price REAL,
      size REAL,
      message TEXT,
      timestamp INTEGER
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      market_id TEXT,
      outcome TEXT,
      price REAL,
      size REAL,
      side TEXT,
      timestamp INTEGER
    );

    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY, -- \`\${market_id}_\${outcome}\`
      market_id TEXT,
      market_slug TEXT,
      outcome TEXT,
      token_id TEXT,
      shares REAL,
      average_price REAL,
      current_price REAL,
      current_value REAL,
      unrealized_pnl REAL,
      realized_pnl REAL,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS account_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trading_mode TEXT,
      usdc_balance REAL,
      available_balance REAL,
      positions_value REAL,
      unrealized_pnl REAL,
      realized_pnl REAL,
      timestamp INTEGER
    );

    CREATE TABLE IF NOT EXISTS system_events (
      id TEXT PRIMARY KEY,
      type TEXT,
      level TEXT,
      message TEXT,
      details TEXT,
      timestamp INTEGER
    );
  `);
}

// -------------------------------------------------------------
// Database Operations Helpers
// -------------------------------------------------------------

export async function upsertMarket(market: Btc5mMarket): Promise<void> {
  const database = await getDb();
  database.run(
    `INSERT INTO markets (id, slug, question, condition_id, up_token_id, down_token_id, start_time, end_time, strike_price, active, resolved, winner)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       slug=excluded.slug,
       question=excluded.question,
       condition_id=excluded.condition_id,
       up_token_id=excluded.up_token_id,
       down_token_id=excluded.down_token_id,
       start_time=excluded.start_time,
       end_time=excluded.end_time,
       strike_price=excluded.strike_price,
       active=excluded.active,
       resolved=excluded.resolved,
       winner=excluded.winner;`,
    [
      market.id,
      market.slug,
      market.question,
      market.conditionId,
      market.upTokenId,
      market.downTokenId,
      market.startTime,
      market.endTime,
      market.strikePrice || null,
      market.active ? 1 : 0,
      market.resolved ? 1 : 0,
      market.winner || null,
    ]
  );
  persistDb();
}

export async function getMarket(marketId: string): Promise<Btc5mMarket | null> {
  const database = await getDb();
  const stmt = database.prepare(`SELECT * FROM markets WHERE id = ? OR slug = ? LIMIT 1;`);
  stmt.bind([marketId, marketId]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return {
      id: row.id as string,
      slug: row.slug as string,
      question: row.question as string,
      conditionId: row.condition_id as string,
      upTokenId: row.up_token_id as string,
      downTokenId: row.down_token_id as string,
      startTime: row.start_time as number,
      endTime: row.end_time as number,
      strikePrice: (row.strike_price as number) || undefined,
      active: Boolean(row.active),
      resolved: Boolean(row.resolved),
      winner: (row.winner as any) || undefined,
    };
  }
  stmt.free();
  return null;
}

export async function insertConditionalOrder(order: ConditionalOrder): Promise<void> {
  const database = await getDb();
  database.run(
    `INSERT INTO conditional_orders (
      id, market_id, market_slug, outcome, side, trigger_price, trigger_direction,
      trigger_source, order_price, size, shares, take_profit_price, status, trading_mode,
      initial_price_at_creation, triggered_price, triggered_at, real_order_id,
      polymarket_order_id, take_profit_order_id, failure_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      order.id,
      order.marketId,
      order.marketSlug,
      order.outcome,
      order.side,
      order.triggerPrice,
      order.triggerDirection,
      order.triggerSource,
      order.orderPrice,
      order.size,
      order.shares,
      order.takeProfitPrice ?? null,
      order.status,
      order.tradingMode,
      order.initialPriceAtCreation,
      order.triggeredPrice || null,
      order.triggeredAt || null,
      order.realOrderId || null,
      order.polymarketOrderId || null,
      order.takeProfitOrderId || null,
      order.failureReason || null,
      order.createdAt,
      order.updatedAt,
    ]
  );
  persistDb();
}

export async function updateConditionalOrderStatus(
  orderId: string,
  status: ConditionalOrder['status'],
  extra?: Partial<ConditionalOrder>
): Promise<void> {
  const database = await getDb();
  const now = Date.now();
  let query = `UPDATE conditional_orders SET status = ?, updated_at = ?`;
  const params: any[] = [status, now];

  if (extra?.triggeredPrice !== undefined) {
    query += `, triggered_price = ?`;
    params.push(extra.triggeredPrice);
  }
  if (extra?.triggeredAt !== undefined) {
    query += `, triggered_at = ?`;
    params.push(extra.triggeredAt);
  }
  if (extra?.realOrderId !== undefined) {
    query += `, real_order_id = ?`;
    params.push(extra.realOrderId);
  }
  if (extra?.polymarketOrderId !== undefined) {
    query += `, polymarket_order_id = ?`;
    params.push(extra.polymarketOrderId);
  }
  if (extra?.failureReason !== undefined) {
    query += `, failure_reason = ?`;
    params.push(extra.failureReason);
  }
  if (extra?.takeProfitOrderId !== undefined) {
    query += `, take_profit_order_id = ?`;
    params.push(extra.takeProfitOrderId);
  }

  query += ` WHERE id = ?`;
  params.push(orderId);

  database.run(query, params);
  persistDb();
}

export async function getConditionalOrders(filter?: {
  marketId?: string;
  status?: string;
}): Promise<ConditionalOrder[]> {
  const database = await getDb();
  let query = `SELECT * FROM conditional_orders`;
  const params: any[] = [];
  const conditions: string[] = [];

  if (filter?.marketId) {
    conditions.push(`market_id = ?`);
    params.push(filter.marketId);
  }
  if (filter?.status) {
    conditions.push(`status = ?`);
    params.push(filter.status);
  }
  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }
  query += ` ORDER BY created_at DESC;`;

  const stmt = database.prepare(query);
  stmt.bind(params);
  const results: ConditionalOrder[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      id: row.id as string,
      marketId: row.market_id as string,
      marketSlug: row.market_slug as string,
      outcome: row.outcome as any,
      side: row.side as any,
      triggerPrice: row.trigger_price as number,
      triggerDirection: row.trigger_direction as any,
      triggerSource: row.trigger_source as any,
      orderPrice: row.order_price as number,
      size: row.size as number,
      shares: row.shares as number,
      takeProfitPrice: (row.take_profit_price as number) || undefined,
      status: row.status as any,
      tradingMode: row.trading_mode as any,
      initialPriceAtCreation: row.initial_price_at_creation as number,
      triggeredPrice: (row.triggered_price as number) || undefined,
      triggeredAt: (row.triggered_at as number) || undefined,
      realOrderId: (row.real_order_id as string) || undefined,
      polymarketOrderId: (row.polymarket_order_id as string) || undefined,
      takeProfitOrderId: (row.take_profit_order_id as string) || undefined,
      failureReason: (row.failure_reason as string) || undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    });
  }
  stmt.free();
  return results;
}

export async function getWaitingConditionalOrders(): Promise<ConditionalOrder[]> {
  return getConditionalOrders({ status: 'WAITING_FOR_TRIGGER' });
}

export async function insertRealOrder(order: RealOrder): Promise<void> {
  const database = await getDb();
  database.run(
    `INSERT INTO real_orders (
      id, conditional_order_id, polymarket_order_id, market_id, market_slug,
      outcome, token_id, side, price, size, amount_usd, filled_size,
      average_fill_price, status, trading_mode, raw_order_payload, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      order.id,
      order.conditionalOrderId || null,
      order.polymarketOrderId,
      order.marketId,
      order.marketSlug,
      order.outcome,
      order.tokenId,
      order.side,
      order.price,
      order.size,
      order.amountUsd,
      order.filledSize,
      order.averageFillPrice,
      order.status,
      order.tradingMode,
      order.rawOrderPayload || null,
      order.createdAt,
      order.updatedAt,
    ]
  );
  persistDb();
}

export async function updateRealOrderStatus(
  polymarketOrderId: string,
  status: RealOrder['status'],
  filledSize?: number,
  averageFillPrice?: number
): Promise<void> {
  const database = await getDb();
  const now = Date.now();
  let query = `UPDATE real_orders SET status = ?, updated_at = ?`;
  const params: any[] = [status, now];

  if (filledSize !== undefined) {
    query += `, filled_size = ?`;
    params.push(filledSize);
  }
  if (averageFillPrice !== undefined) {
    query += `, average_fill_price = ?`;
    params.push(averageFillPrice);
  }

  query += ` WHERE polymarket_order_id = ? OR id = ?`;
  params.push(polymarketOrderId, polymarketOrderId);

  database.run(query, params);
  persistDb();
}

export async function getRealOrders(filter?: { marketId?: string }): Promise<RealOrder[]> {
  const database = await getDb();
  let query = `SELECT * FROM real_orders`;
  const params: any[] = [];
  if (filter?.marketId) {
    query += ` WHERE market_id = ?`;
    params.push(filter.marketId);
  }
  query += ` ORDER BY created_at DESC;`;

  const stmt = database.prepare(query);
  stmt.bind(params);
  const results: RealOrder[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      id: row.id as string,
      conditionalOrderId: (row.conditional_order_id as string) || undefined,
      polymarketOrderId: row.polymarket_order_id as string,
      marketId: row.market_id as string,
      marketSlug: row.market_slug as string,
      outcome: row.outcome as any,
      tokenId: row.token_id as string,
      side: row.side as any,
      price: row.price as number,
      size: row.size as number,
      amountUsd: row.amount_usd as number,
      filledSize: row.filled_size as number,
      averageFillPrice: row.average_fill_price as number,
      status: row.status as any,
      tradingMode: row.trading_mode as any,
      rawOrderPayload: (row.raw_order_payload as string) || undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    });
  }
  stmt.free();
  return results;
}

export async function insertSystemEvent(event: SystemEvent): Promise<void> {
  const database = await getDb();
  database.run(
    `INSERT INTO system_events (id, type, level, message, details, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.type,
      event.level,
      event.message,
      event.details ? JSON.stringify(event.details) : null,
      event.timestamp,
    ]
  );
  persistDb();
}

export async function getRecentSystemEvents(limit = 100): Promise<SystemEvent[]> {
  const database = await getDb();
  const stmt = database.prepare(`SELECT * FROM system_events ORDER BY timestamp DESC LIMIT ?;`);
  stmt.bind([limit]);
  const results: SystemEvent[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      id: row.id as string,
      type: row.type as any,
      level: row.level as any,
      message: row.message as string,
      details: row.details ? JSON.parse(row.details as string) : undefined,
      timestamp: row.timestamp as number,
    });
  }
  stmt.free();
  return results;
}

export async function getPositions(): Promise<Position[]> {
  const database = await getDb();
  const stmt = database.prepare(`SELECT * FROM positions ORDER BY updated_at DESC;`);
  const results: Position[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      marketId: row.market_id as string,
      marketSlug: row.market_slug as string,
      outcome: row.outcome as any,
      tokenId: row.token_id as string,
      shares: row.shares as number,
      averagePrice: row.average_price as number,
      currentPrice: row.current_price as number,
      currentValue: row.current_value as number,
      unrealizedPnl: row.unrealized_pnl as number,
      realizedPnl: row.realized_pnl as number,
      updatedAt: row.updated_at as number,
    });
  }
  stmt.free();
  return results;
}

export async function upsertPosition(position: Position): Promise<void> {
  const database = await getDb();
  const id = `${position.marketId}_${position.outcome}`;
  database.run(
    `INSERT INTO positions (id, market_id, market_slug, outcome, token_id, shares, average_price, current_price, current_value, unrealized_pnl, realized_pnl, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       shares=excluded.shares,
       average_price=excluded.average_price,
       current_price=excluded.current_price,
       current_value=excluded.current_value,
       unrealized_pnl=excluded.unrealized_pnl,
       realized_pnl=excluded.realized_pnl,
       updated_at=excluded.updated_at;`,
    [
      id,
      position.marketId,
      position.marketSlug,
      position.outcome,
      position.tokenId,
      position.shares,
      position.averagePrice,
      position.currentPrice,
      position.currentValue,
      position.unrealizedPnl,
      position.realizedPnl,
      position.updatedAt,
    ]
  );
  persistDb();
}
