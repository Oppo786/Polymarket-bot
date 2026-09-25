/**
 * Polymarket Execution Client & Account Manager
 * Supports both DRY_RUN mode (safe testing) and LIVE mode (real EIP-712 signing & CLOB posting).
 * Strictly guards credentials, never logs private keys or secrets.
 */

import { ethers } from 'ethers';
import { ClobClient, Side, OrderType, SignatureTypeV2 } from '@polymarket/clob-client-v2';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import {
  RealOrder,
  TradingMode,
  AccountInfo,
  OrderSide,
  OutcomeType,
} from '../types.js';
import {
  insertRealOrder,
  updateRealOrderStatus,
  getRealOrders,
  getPositions,
  upsertPosition,
} from '../database/db.js';
import { eventBus } from '../events/event-bus.js';

class PolymarketClientManager {
  private clobClient: any = null;
  private signer: any = null;
  private tradingMode: TradingMode = (process.env.TRADING_MODE as TradingMode) || 'DRY_RUN';

  // In-memory simulated balance for DRY_RUN
  private simulatedUsdcBalance: number = 500.0;

  constructor() {
    this.initClient();
  }

  public getTradingMode(): TradingMode {
    return this.tradingMode;
  }

  public setTradingMode(mode: TradingMode): void {
    const oldMode = this.tradingMode;
    this.tradingMode = mode;
    eventBus.emitLog(
      'SYSTEM',
      mode === 'LIVE' ? 'warn' : 'info',
      `Trading Mode changed from ${oldMode} to ${mode}`
    );
    eventBus.broadcastSse('trading_mode', { tradingMode: mode });
  }

  private initClient(): void {
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
    const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS;
    const chainId = parseInt(process.env.POLYMARKET_CHAIN_ID || '137', 10);
    const host = process.env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';

    if (privateKey) {
      try {
        let pk = privateKey;
        if (!pk.startsWith('0x')) pk = '0x' + pk;
        const account = privateKeyToAccount(pk as `0x${string}`);
        this.signer = createWalletClient({
          account,
          chain: polygon,
          transport: http()
        });

        eventBus.emitLog(
          'SYSTEM',
          'info',
          `Polymarket signer initialized for address: ${account.address.substring(0, 6)}...${account.address.substring(38)}`
        );

        // Deposit Wallet / Polymarket Proxy uses SignatureTypeV2.POLY_1271 (3)
        const sigType = funderAddress ? SignatureTypeV2.POLY_1271 : SignatureTypeV2.EOA;

        this.clobClient = new ClobClient({
          host,
          chain: chainId,
          signer: this.signer,
          signatureType: sigType,
          funderAddress: funderAddress || undefined
        });

        eventBus.emitLog('SYSTEM', 'info', 'Polymarket CLOB V2 client initialized. Deriving API key...');
        this.clobClient.createOrDeriveApiKey().then((creds: any) => {
          if (creds && creds.key && this.clobClient) {
            this.clobClient.creds = creds;
            eventBus.emitLog('SYSTEM', 'success', 'Polymarket CLOB V2 API credentials successfully derived.');
          }
        }).catch((deriveErr: any) => {
          eventBus.emitLog('SYSTEM', 'info', `L2 API derivation notice: ${deriveErr?.message || 'Using L1 order signing'}`);
        });
      } catch (err: any) {
        eventBus.emitLog('ERROR', 'error', `Failed to initialize Polymarket client: ${err?.message || err}`);
      }
    } else {
      eventBus.emitLog(
        'SYSTEM',
        'info',
        'No wallet private key provided in environment. Running with simulated local wallet.'
      );
    }
  }

  private async fetchPolygonUsdcBalance(address: string): Promise<number | null> {
    try {
      const provider = new ethers.JsonRpcProvider('https://polygon-bor-rpc.publicnode.com');
      const usdcAbi = ['function balanceOf(address owner) view returns (uint256)'];
      
      const usdcEContract = new ethers.Contract('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', usdcAbi, provider);
      const balanceUsdcE = await usdcEContract.balanceOf(address);
      const valUsdcE = parseFloat(ethers.formatUnits(balanceUsdcE, 6));

      const nativeUsdcContract = new ethers.Contract('0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', usdcAbi, provider);
      const balanceNative = await nativeUsdcContract.balanceOf(address);
      const valNative = parseFloat(ethers.formatUnits(balanceNative, 6));

      return valUsdcE + valNative;
    } catch {
      return null;
    }
  }

  public async getAccountInfo(): Promise<AccountInfo> {
    const isLive = this.tradingMode === 'LIVE';
    const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS;
    const walletAddress = funderAddress || (this.signer?.account?.address || '0xSimulatedWallet0000000000000000000000');
    const signatureType = parseInt(process.env.POLYMARKET_SIGNATURE_TYPE || (funderAddress ? '3' : '0'), 10);
    const hasClobCredentials = Boolean(this.clobClient);

    let usdcBalance = this.simulatedUsdcBalance;
    let availableBalance = this.simulatedUsdcBalance;

    if (isLive && this.signer) {
      const targetAddress = funderAddress || this.signer.account.address;
      try {
        const onChainBalance = await this.fetchPolygonUsdcBalance(targetAddress);
        if (onChainBalance !== null) {
          usdcBalance = onChainBalance;
          availableBalance = onChainBalance;
        }
      } catch (_) {}
    }

    const positions = await getPositions();
    let positionsValue = 0;
    let totalUnrealizedPnl = 0;
    let totalRealizedPnl = 0;

    for (const pos of positions) {
      positionsValue += pos.currentValue;
      totalUnrealizedPnl += pos.unrealizedPnl;
      totalRealizedPnl += pos.realizedPnl;
    }

    return {
      tradingMode: this.tradingMode,
      walletAddress,
      funderAddress: funderAddress || '',
      signatureType,
      usdcBalance: parseFloat(usdcBalance.toFixed(2)),
      availableBalance: parseFloat(availableBalance.toFixed(2)),
      positionsValue: parseFloat(positionsValue.toFixed(2)),
      totalAccountValue: parseFloat((usdcBalance + positionsValue).toFixed(2)),
      totalRealizedPnl: parseFloat(totalRealizedPnl.toFixed(2)),
      totalUnrealizedPnl: parseFloat(totalUnrealizedPnl.toFixed(2)),
      isConfigured: Boolean(this.signer),
      hasClobCredentials,
    };
  }

  /**
   * Submit an order to Polymarket CLOB (or simulate in DRY_RUN).
   * Provide either amountUsd (shares = amountUsd / price) or sizeShares (exact share count).
   */
  public async submitOrder(params: {
    conditionalOrderId: string;
    marketId: string;
    marketSlug: string;
    outcome: OutcomeType;
    tokenId: string;
    side: OrderSide;
    price: number;
    amountUsd?: number;
    sizeShares?: number;
  }): Promise<RealOrder> {
    const { conditionalOrderId, marketId, marketSlug, outcome, tokenId, side, price } = params;
    const now = Date.now();
    const shares =
      params.sizeShares !== undefined
        ? parseFloat(params.sizeShares.toFixed(4))
        : parseFloat(((params.amountUsd || 0) / price).toFixed(4));
    const amountUsd =
      params.amountUsd !== undefined
        ? params.amountUsd
        : parseFloat((shares * price).toFixed(4));
    const internalId = `ro_${now}_${Math.random().toString(36).substring(2, 6)}`;

    // -------------------------------------------------------------
    // DRY RUN SIMULATION MODE
    // -------------------------------------------------------------
    if (this.tradingMode === 'DRY_RUN') {
      const simPmId = `pm_dry_${now}_${Math.random().toString(36).substring(2, 8)}`;

      await eventBus.emitLog('ORDER', 'info', `[DRY_RUN] Submitting simulated order to local engine...`);
      await eventBus.emitLog(
        'ORDER',
        'info',
        `WOULD SUBMIT: ${side} ${outcome} PRICE = $${price.toFixed(2)} SIZE = $${amountUsd.toFixed(2)} (${shares} shares)`
      );

      const realOrder: RealOrder = {
        id: internalId,
        conditionalOrderId,
        polymarketOrderId: simPmId,
        marketId,
        marketSlug,
        outcome,
        tokenId,
        side,
        price,
        size: shares,
        amountUsd,
        filledSize: shares,
        averageFillPrice: price,
        status: 'FILLED',
        tradingMode: 'DRY_RUN',
        rawOrderPayload: JSON.stringify({ simulated: true, side, price, shares, outcome }),
        createdAt: now,
        updatedAt: now,
      };

      await insertRealOrder(realOrder);

      if (side === 'BUY') {
        this.simulatedUsdcBalance = Math.max(0, this.simulatedUsdcBalance - amountUsd);
      } else {
        this.simulatedUsdcBalance += amountUsd;
      }

      await this.updatePositionFromFill(marketId, marketSlug, outcome, tokenId, side, shares, price);

      await eventBus.emitLog(
        'ORDER',
        'success',
        `Order accepted & filled [DRY_RUN]: Polymarket Order ID = ${simPmId}`,
        { orderId: simPmId, price, shares }
      );

      return realOrder;
    }

    // -------------------------------------------------------------
    // LIVE MODE (REAL POLYMARKET CLOB V2)
    // -------------------------------------------------------------
    await eventBus.emitLog(
      'ORDER',
      'warn',
      `[LIVE] Submitting REAL Polymarket order: ${side} ${outcome} @ $${price} (Size: $${amountUsd})`
    );

    if (!this.clobClient) {
      throw new Error('Polymarket CLOB client not configured. Missing private key or credentials.');
    }

    try {
      const pmSide = side === 'BUY' ? Side.BUY : Side.SELL;
      const validPrice = Math.min(0.99, Math.max(0.01, Math.round(price * 100) / 100));

      // Polymarket V2: createOrder then postOrder
      const signedOrder = await this.clobClient.createOrder({
        tokenID: tokenId,
        price: validPrice,
        side: pmSide,
        size: Math.max(1, Math.round(shares)),
      });

      const response = await this.clobClient.postOrder(signedOrder, OrderType.GTC);

      if ((response as any)?.errorMsg) {
        throw new Error((response as any)?.errorMsg);
      }

      const pmOrderId = (response as any)?.orderID || (response as any)?.id || `pm_${now}`;

      const realOrder: RealOrder = {
        id: internalId,
        conditionalOrderId,
        polymarketOrderId: pmOrderId,
        marketId,
        marketSlug,
        outcome,
        tokenId,
        side,
        price,
        size: shares,
        amountUsd,
        filledSize: 0,
        averageFillPrice: 0,
        status: 'OPEN',
        tradingMode: 'LIVE',
        rawOrderPayload: JSON.stringify(response),
        createdAt: now,
        updatedAt: now,
      };

      await insertRealOrder(realOrder);

      await eventBus.emitLog(
        'ORDER',
        'success',
        `Real Polymarket Order accepted: Polymarket Order ID = ${pmOrderId}`,
        { pmOrderId, response }
      );

      return realOrder;
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      await eventBus.emitLog('ORDER', 'error', `Polymarket CLOB rejected order: ${errorMsg}`);
      throw new Error(`Polymarket order failed: ${errorMsg}`);
    }
  }

  /**
   * Fetch remote order status from Polymarket CLOB (LIVE only).
   * Returns null in DRY_RUN or if the client/order is unavailable.
   */
  public async fetchRemoteOrderStatus(
    polymarketOrderId: string
  ): Promise<{ status: RealOrder['status']; filledSize: number; averageFillPrice: number } | null> {
    if (this.tradingMode === 'DRY_RUN' || polymarketOrderId.startsWith('pm_dry_')) {
      return null;
    }
    if (!this.clobClient) return null;

    try {
      const remote = await this.clobClient.getOrder(polymarketOrderId);
      if (!remote) return null;

      const sizeMatched = parseFloat(String(remote.size_matched || '0'));
      const originalSize = parseFloat(String(remote.original_size || '0'));
      const remoteStatus = String(remote.status || '').toUpperCase();

      let status: RealOrder['status'] = 'OPEN';
      if (remoteStatus.includes('CANCEL')) status = 'CANCELLED';
      else if (remoteStatus.includes('EXPIRE')) status = 'EXPIRED';
      else if (remoteStatus.includes('REJECT')) status = 'REJECTED';
      else if (sizeMatched > 0 && originalSize > 0 && sizeMatched >= originalSize * 0.999) status = 'FILLED';
      else if (sizeMatched > 0) status = 'PARTIALLY_FILLED';

      const price = parseFloat(String(remote.price || remote.associate_trades?.[0]?.price || '0'));

      return {
        status,
        filledSize: sizeMatched,
        averageFillPrice: price,
      };
    } catch {
      return null;
    }
  }

  /**
   * Cancel an open order on Polymarket
   */
  public async cancelOrder(polymarketOrderId: string): Promise<void> {
    if (this.tradingMode === 'DRY_RUN' || polymarketOrderId.startsWith('pm_dry_')) {
      await updateRealOrderStatus(polymarketOrderId, 'CANCELLED');
      await eventBus.emitLog('ORDER', 'info', `Order ${polymarketOrderId} cancelled [DRY_RUN]`);
      return;
    }

    if (!this.clobClient) {
      throw new Error('Polymarket CLOB client not configured');
    }

    try {
      await this.clobClient.cancelOrder({ orderID: polymarketOrderId });
      await updateRealOrderStatus(polymarketOrderId, 'CANCELLED');
      await eventBus.emitLog('ORDER', 'success', `Polymarket order ${polymarketOrderId} cancelled successfully`);
    } catch (err: any) {
      await eventBus.emitLog('ORDER', 'error', `Failed to cancel Polymarket order: ${err?.message || err}`);
      throw err;
    }
  }

  /**
   * Reconcile local positions after a filled order
   */
  private async updatePositionFromFill(
    marketId: string,
    marketSlug: string,
    outcome: OutcomeType,
    tokenId: string,
    side: OrderSide,
    shares: number,
    price: number
  ): Promise<void> {
    const positions = await getPositions();
    const existing = positions.find((p) => p.marketId === marketId && p.outcome === outcome);

    let newShares = existing ? existing.shares : 0;
    let avgPrice = existing ? existing.averagePrice : price;
    let realizedPnl = existing ? existing.realizedPnl : 0;

    if (side === 'BUY') {
      const totalCost = newShares * avgPrice + shares * price;
      newShares += shares;
      avgPrice = newShares > 0 ? totalCost / newShares : price;
    } else {
      const pnl = shares * (price - avgPrice);
      realizedPnl += pnl;
      newShares = Math.max(0, newShares - shares);
    }

    const currentValue = newShares * price;
    const unrealizedPnl = newShares * (price - avgPrice);

    await upsertPosition({
      marketId,
      marketSlug,
      outcome,
      tokenId,
      shares: parseFloat(newShares.toFixed(4)),
      averagePrice: parseFloat(avgPrice.toFixed(4)),
      currentPrice: price,
      currentValue: parseFloat(currentValue.toFixed(2)),
      unrealizedPnl: parseFloat(unrealizedPnl.toFixed(2)),
      realizedPnl: parseFloat(realizedPnl.toFixed(2)),
      updatedAt: Date.now(),
    });
  }
}

export const polymarketClient = new PolymarketClientManager();
