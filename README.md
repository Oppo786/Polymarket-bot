# Polymarket BTC 5-Minute Trading Terminal

A high-frequency conditional order trading terminal built specifically for Polymarket **BTC 5-minute UP/DOWN markets**, designed for production deployment on **Oracle Cloud Ubuntu** with Docker.

---

## Key Features

- **Exclusive BTC 5-Minute Focus**: Dedicated strictly to automated monitoring and execution on Polymarket BTC 5m prediction markets.
- **Custom Conditional Trigger Engine**:
  - `WAITING_FOR_TRIGGER` $\rightarrow$ `TRIGGERED` $\rightarrow$ `SUBMITTING` $\rightarrow$ `OPEN/FILLED`
  - Zero premature limit order submissions. Sits locally until market reaches trigger price.
  - Intelligent trigger direction (`ABOVE_OR_EQUAL` vs `BELOW_OR_EQUAL`).
  - Configurable trigger sources: Last Trade, Best Bid, Best Ask, Mid Price.
- **Automatic 5-Minute Market Discovery**:
  - No hardcoded IDs or slugs.
  - Computes epoch boundaries (`btc-updown-5m-{epoch}`).
  - Queries Polymarket Gamma API for official UP and DOWN CLOB token IDs.
  - Detects market expiration and auto-rolls to the next 5-minute market.
  - Expiration Protection: Marks waiting orders as `EXPIRED` if the market closes before trigger.
- **Duplicate Protection**:
  - Strict atomic mutex locking and database state transition prevent duplicate real orders across oscillating price ticks.
- **Official Polymarket CLOB Integration**:
  - WebSocket market data: `wss://ws-subscriptions-clob.polymarket.com/ws/market`
  - EIP-712 order signing and HMAC L2 authentication via `@polymarket/clob-client`.
  - Supports EOA (Standard Private Key), PolyProxy (Magic / Email wallet), and Gnosis Safe.
  - Safe by default: Defaults to `DRY_RUN` mode until explicitly toggled to `LIVE`.
- **Restart & Disconnect Recovery**:
  - Persistent SQLite database located at `./data/trader.sqlite`.
  - Auto-reconnects WebSocket on dropouts.
  - Reconciles order states upon container or server restart.
- **Professional Terminal Interface**:
  - Real-time BTC spot price ticker and 5-minute countdown clock.
  - UP and DOWN market panels with best bid/ask, last trade, and spread.
  - Live order book with depth visualizers and recent trades stream.
  - Interactive conditional order placement and confirmation dialog.
  - Live event console formatted with timestamped audit logs.

---

## Quick Start on Oracle Cloud Ubuntu

### 1. Prerequisites
Install Docker and Docker Compose on your Ubuntu instance:
```bash
sudo apt update && sudo apt install -y docker.io docker-compose git
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

### 2. Clone & Configure
```bash
git clone <your-repo-url> polymarket-trader
cd polymarket-trader
cp .env.example .env
```

Edit `.env` to configure your credentials:
```env
TRADING_MODE=DRY_RUN
POLYMARKET_PRIVATE_KEY=0x...
POLYMARKET_API_KEY=...
POLYMARKET_API_SECRET=...
POLYMARKET_API_PASSPHRASE=...
POLYMARKET_FUNDER_ADDRESS=0x...
POLYMARKET_SIGNATURE_TYPE=0
```

### 3. Run with Docker Compose
```bash
docker-compose up -d --build
```
Your terminal is now live at `http://<your-oracle-server-ip>:3000`.

### 4. Run Automated Tests
```bash
docker-compose exec polymarket-trader npm test
# Or locally:
npm test
```

---

## API Endpoints

- `GET /api/health`: Health status, active market, and WS connectivity.
- `GET /api/market/current`: Active market metadata and price data.
- `GET /api/market/orderbook`: Live order book bids and asks.
- `GET /api/market/trades`: Recent trades stream.
- `GET /api/orders/conditional`: List all conditional orders.
- `POST /api/orders/conditional`: Create a local conditional order.
- `DELETE /api/orders/conditional/:id`: Cancel a waiting conditional order.
- `GET /api/orders/real`: Real Polymarket orders.
- `POST /api/orders/real/:id/cancel`: Cancel an order on Polymarket.
- `GET /api/positions`: Current token share positions and PnL.
- `GET /api/account`: Account USDC balances and status.
- `GET /api/events`: Timestamped system event logs.
- `POST /api/settings/trading-mode`: Switch between `DRY_RUN` and `LIVE`.
- `POST /api/simulate/tick`: Testing endpoint for injecting price ticks.
