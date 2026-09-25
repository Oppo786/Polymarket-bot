# System Architecture - Polymarket BTC 5M Terminal

This document outlines the architectural design, lifecycle, and safety boundaries of the **Polymarket BTC 5-Minute Trading Terminal**.

---

## 1. High-Level Architecture Overview

```
                      +-----------------------------+
                      |   Polymarket Gamma API      | (Market Discovery: btc-updown-5m-*)
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      | Market Discovery Service    |
                      +--------------+--------------+
                                     |
                +--------------------+--------------------+
                |                                         |
                v                                         v
+-------------------------------+         +-------------------------------+
| Polymarket CLOB WebSocket Feed |         | Custom Conditional Trigger    |
| (wss://ws-subscriptions-clob) |         | Engine (Atomic Locking Mutex) |
+---------------+---------------+         +---------------+---------------+
                |                                         |
                | Live Price Ticks (Last, Bids, Asks)     | Condition Met
                +---------------------------------------->+
                                                          |
                                                          v
                                          +-------------------------------+
                                          | Polymarket Execution Client   |
                                          | (DRY_RUN vs LIVE EIP-712/HMAC)|
                                          +---------------+---------------+
                                                          |
                                                          v
                                          +-------------------------------+
                                          | Persistent SQLite Database    |
                                          | (Survives Restarts/Volumes)   |
                                          +-------------------------------+
```

---

## 2. Core Modules

### 2.1 Market Discovery (`src/server/market/market-discovery.ts`)
- **Zero Hardcoded IDs**: Computes 300-second (5-minute) UTC time buckets.
- **Slug Scheme**: `btc-updown-5m-{unix_epoch}`.
- **Gamma API Integration**: Queries `https://gamma-api.polymarket.com/events` to extract official CLOB token IDs for **UP** and **DOWN** outcomes.
- **Auto-Roll & Expiration**: Automatically rolls forward when the 5-minute window elapses, marks waiting orders as `EXPIRED`, and resubscribes the WebSocket feed to new asset IDs.

### 2.2 Live Market Data Feed (`src/server/polymarket/clob-websocket.ts`)
- Connects to `wss://ws-subscriptions-clob.polymarket.com/ws/market`.
- Sends subscription payload for both UP and DOWN tokens:
  ```json
  { "assets_ids": ["<UP_TOKEN_ID>", "<DOWN_TOKEN_ID>"], "type": "market" }
  ```
- Maintains order book depth, last trade prices, best bid/ask, and spread calculations.
- Reconnection engine with automatic exponential backoff and state re-synchronization.

### 2.3 Conditional Order & Trigger Engine (`src/server/trading/trigger-engine.ts`)
- **Separation of Concerns**: Strictly separates `triggerPrice`, `triggerDirection`, `triggerSource`, and `orderPrice`.
- **Intelligent Direction Logic**:
  - `triggerPrice >= currentPrice` $\rightarrow$ `ABOVE_OR_EQUAL` ($\ge$)
  - `triggerPrice < currentPrice` $\rightarrow$ `BELOW_OR_EQUAL` ($\le$)
- **Zero Immediate Submission**: Orders are persisted locally with status `WAITING_FOR_TRIGGER`.
- **Atomic Mutex & Idempotency**: Prevents duplicate real orders if the market oscillates around the trigger price.
- **Lifecycle Pipeline**:
  `WAITING_FOR_TRIGGER` $\rightarrow$ `TRIGGERED` $\rightarrow$ `SUBMITTING` $\rightarrow$ `OPEN` / `FILLED`.

### 2.4 Polymarket Execution Client (`src/server/polymarket/clob-client.ts`)
- **DRY_RUN Mode (Default)**: Simulates local execution, records simulated fills, tracks simulated PnL, emits `WOULD SUBMIT` logs without touching real funds.
- **LIVE Mode**: Uses `@polymarket/clob-client` and `ethers.Wallet` to produce EIP-712 signed limit orders and HMAC-authenticated API headers.
- **Account Support**: Compatible with EOA (0), PolyProxy / Magic / Email (1), and Gnosis Safe (2).

### 2.5 Restart Recovery & Reconciler (`src/server/trading/reconciler.ts`)
- On system or Docker boot, re-loads all pending orders from `./data/trader.sqlite`.
- Checks market expiration against current time.
- Queries active Polymarket orders and reconciles status.

---

## 3. Data Storage & Schema
Persistent SQLite WebAssembly store located in `./data/trader.sqlite`:
- `markets`: Market metadata, token IDs, window start/end.
- `conditional_orders`: Local pending and completed conditional orders.
- `real_orders`: Orders placed on Polymarket (or simulated in DRY_RUN).
- `order_events`: Audit trail of every transition.
- `trades`: Public market trade ticks.
- `positions`: Share balances, entry prices, realized & unrealized PnL.
- `system_events`: Real-time event log history.
