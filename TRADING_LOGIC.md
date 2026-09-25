# Trading Logic & Execution Protocol

This guide describes the mathematical and logical rules governing conditional orders on the **Polymarket BTC 5M Terminal**.

---

## 1. The Core Conditional Invariant

> **Rule 1:** A conditional order is NEVER sent directly to Polymarket upon creation. It resides exclusively on the local terminal until its trigger condition evaluates to `TRUE`.

```
User Action: "BUY UP @ $0.90 (Current $0.50)"
      |
      v
[Terminal saves Conditional Order locally]
      |
      v
Status: WAITING_FOR_TRIGGER
      |
      |-- Price $0.50 -> WAIT
      |-- Price $0.70 -> WAIT
      |-- Price $0.89 -> WAIT
      |
      v (Price hits $0.90)
Status: TRIGGERED
      |
      v
Status: SUBMITTING
      |
      v
Submit Real Polymarket Limit Order @ $0.90
      |
      v
Status: OPEN / FILLED
```

---

## 2. Intelligent Trigger Direction Logic

When an order is created, the system compares the **trigger price** against the **current market price**:

### Scenario A: Upward Breakout Trigger
- **Current Price:** `$0.50`
- **User Parameters:** BUY UP, Trigger = `$0.90`, Order Price = `$0.90`
- **Inferred Direction:** `ABOVE_OR_EQUAL` ($\ge$)
- **Interpretation:** Wait until price is greater than or equal to `$0.90`.
- **Ticks:**
  - `$0.50` $\rightarrow$ WAIT
  - `$0.60` $\rightarrow$ WAIT
  - `$0.70` $\rightarrow$ WAIT
  - `$0.80` $\rightarrow$ WAIT
  - `$0.89` $\rightarrow$ WAIT
  - `$0.90` $\rightarrow$ **TRIGGER** (Submits limit order @ `$0.90`)
  - `$0.91` $\rightarrow$ Already triggered (Ignored)

### Scenario B: Downward Pullback / Dip Buy Trigger
- **Current Price:** `$0.50`
- **User Parameters:** BUY UP, Trigger = `$0.40`, Order Price = `$0.40`
- **Inferred Direction:** `BELOW_OR_EQUAL` ($\le$)
- **Interpretation:** Wait until price drops to `$0.40`. The system **MUST NEVER** immediately buy at `$0.50`.
- **Ticks:**
  - `$0.50` $\rightarrow$ WAIT
  - `$0.48` $\rightarrow$ WAIT
  - `$0.45` $\rightarrow$ WAIT
  - `$0.41` $\rightarrow$ WAIT
  - `$0.40` $\rightarrow$ **TRIGGER** (Submits limit order @ `$0.40`)

---

## 3. Trigger Price vs. Order Price

The system keeps `triggerPrice` and `orderPrice` separate:
- **`triggerPrice`**: The market threshold that activates the rule.
- **`orderPrice`**: The limit price submitted to the Polymarket CLOB once triggered.
- **`triggerSource`**: The price stream used for evaluation:
  - `LAST_TRADE` (Default)
  - `BEST_BID`
  - `BEST_ASK`
  - `MID_PRICE`

---

## 4. Duplicate Protection & Idempotency

When real money is involved, WebSocket price oscillations (e.g. `0.90` $\rightarrow$ `0.91` $\rightarrow$ `0.92` $\rightarrow$ `0.91` $\rightarrow$ `0.90`) must **never** create duplicate orders.

We implement 4 tiers of protection:
1. **In-Memory Mutex (`executingLocks`)**: A synchronous lock is acquired on the conditional order ID before evaluation.
2. **Database State Verification**: The record is re-queried from SQLite immediately inside the lock to confirm its status is still `WAITING_FOR_TRIGGER`.
3. **Atomic State Transition**: Status is flipped to `TRIGGERED` prior to network order submission.
4. **Unique Linkage**: The generated `polymarketOrderId` is stored and indexed in `real_orders`.

---

## 5. Market Expiration Handling

Polymarket BTC 5-minute markets run in discrete 300-second windows:
- If a market window closes (e.g., at `08:05:00 UTC`) while a conditional order is still `WAITING_FOR_TRIGGER`:
  - **Do NOT submit the order.**
  - Status updates to `EXPIRED`.
  - Reason: `"Market expired before trigger."`
