/**
 * Polymarket BTC 5M Trading Terminal - Domain Types
 */

export type OutcomeType = 'UP' | 'DOWN';
export type OrderSide = 'BUY' | 'SELL';

export type TriggerDirection = 'ABOVE_OR_EQUAL' | 'BELOW_OR_EQUAL';

export type TriggerSource = 'LAST_TRADE' | 'BEST_BID' | 'BEST_ASK' | 'MID_PRICE';

export type ConditionalOrderStatus =
  | 'WAITING_FOR_TRIGGER'
  | 'TRIGGERED'
  | 'SUBMITTING'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'FAILED';

export type RealOrderStatus =
  | 'PENDING'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED';

export type TradingMode = 'DRY_RUN' | 'LIVE';

export interface Btc5mMarket {
  id: string; // Gamma market ID or slug
  slug: string; // e.g. btc-updown-5m-1726963200
  question: string;
  conditionId: string;
  upTokenId: string;
  downTokenId: string;
  startTime: number; // Unix timestamp ms
  endTime: number; // Unix timestamp ms
  strikePrice?: number; // Starting BTC price when window opened
  active: boolean;
  resolved: boolean;
  winner?: OutcomeType;
}

export interface MarketPriceData {
  marketId: string;
  timestamp: number;
  btcPrice: number;
  up: {
    tokenId: string;
    lastTrade: number;
    bestBid: number;
    bestAsk: number;
    midPrice: number;
    bidSize: number;
    askSize: number;
    spread: number;
  };
  down: {
    tokenId: string;
    lastTrade: number;
    bestBid: number;
    bestAsk: number;
    midPrice: number;
    bidSize: number;
    askSize: number;
    spread: number;
  };
}

export interface OrderBookEntry {
  price: number;
  size: number;
}

export interface OrderBook {
  marketId: string;
  outcome: OutcomeType;
  tokenId: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}

export interface PublicTrade {
  id: string;
  marketId: string;
  outcome: OutcomeType;
  price: number;
  size: number;
  side: OrderSide;
  timestamp: number;
}

export interface ConditionalOrder {
  id: string;
  marketId: string;
  marketSlug: string;
  outcome: OutcomeType;
  side: OrderSide;
  triggerPrice: number;
  triggerDirection: TriggerDirection;
  triggerSource: TriggerSource;
  orderPrice: number;
  size: number; // in USD (or shares)
  shares: number; // computed shares = size / orderPrice
  takeProfitPrice?: number; // Optional sell target after BUY fill
  status: ConditionalOrderStatus;
  tradingMode: TradingMode;
  initialPriceAtCreation: number;
  triggeredPrice?: number;
  triggeredAt?: number;
  realOrderId?: string;
  polymarketOrderId?: string;
  takeProfitOrderId?: string; // Linked take-profit Limit Sell real order id
  failureReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RealOrder {
  id: string;
  conditionalOrderId?: string;
  polymarketOrderId: string;
  marketId: string;
  marketSlug: string;
  outcome: OutcomeType;
  tokenId: string;
  side: OrderSide;
  price: number;
  size: number; // Shares
  amountUsd: number;
  filledSize: number;
  averageFillPrice: number;
  status: RealOrderStatus;
  tradingMode: TradingMode;
  rawOrderPayload?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Position {
  marketId: string;
  marketSlug: string;
  outcome: OutcomeType;
  tokenId: string;
  shares: number;
  averagePrice: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  updatedAt: number;
}

export interface AccountInfo {
  tradingMode: TradingMode;
  walletAddress: string;
  funderAddress: string;
  signatureType: number;
  usdcBalance: number;
  availableBalance: number;
  positionsValue: number;
  totalAccountValue: number;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  isConfigured: boolean;
  hasClobCredentials: boolean;
}

export interface SystemEvent {
  id: string;
  type: 'MARKET' | 'ORDER' | 'TRIGGER' | 'TRADE' | 'WS' | 'SYSTEM' | 'ERROR';
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: Record<string, any>;
  timestamp: number;
}
