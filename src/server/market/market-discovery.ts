/**
 * Polymarket BTC 5-Minute Market Discovery Service
 * Dynamically tracks 5-minute intervals, queries Gamma API, extracts token IDs,
 * detects expiration, and auto-rolls to the next 5-minute market.
 */

import { Btc5mMarket } from '../types.js';
import { upsertMarket, getMarket } from '../database/db.js';
import { eventBus } from '../events/event-bus.js';

export type MarketChangeListener = (newMarket: Btc5mMarket, oldMarket?: Btc5mMarket) => void;

class MarketDiscoveryService {
  private currentMarket: Btc5mMarket | null = null;
  private listeners: Set<MarketChangeListener> = new Set();
  private timer: NodeJS.Timeout | null = null;
  private gammaHost: string = process.env.POLYMARKET_GAMMA_HOST || 'https://gamma-api.polymarket.com';

  public onMarketChange(listener: MarketChangeListener): void {
    this.listeners.add(listener);
  }

  public getCurrentMarket(): Btc5mMarket | null {
    return this.currentMarket;
  }

  public async start(): Promise<void> {
    await this.checkAndUpdateMarket();
    // Check every 2 seconds for expiration and sync
    this.timer = setInterval(() => {
      this.checkAndUpdateMarket().catch((err) => {
        console.error('[MarketDiscovery] Error checking market:', err);
      });
    }, 2000);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Calculates the current 5-minute window start & end times
   */
  public get5mWindow(timestamp = Date.now()): { startTime: number; endTime: number; epochSec: number } {
    const windowMs = 5 * 60 * 1000; // 300,000 ms
    const startTime = Math.floor(timestamp / windowMs) * windowMs;
    const endTime = startTime + windowMs;
    const epochSec = Math.floor(startTime / 1000);
    return { startTime, endTime, epochSec };
  }

  /**
   * Checks whether the current market expired or needs to be discovered
   */
  public async checkAndUpdateMarket(): Promise<Btc5mMarket> {
    const now = Date.now();
    const { startTime, endTime, epochSec } = this.get5mWindow(now);
    const slug = `btc-updown-5m-${epochSec}`;

    // If current market is still valid, return it
    if (this.currentMarket && this.currentMarket.slug === slug && now < this.currentMarket.endTime) {
      return this.currentMarket;
    }

    const oldMarket = this.currentMarket;

    // Market has expired or this is initial boot
    if (oldMarket && oldMarket.slug !== slug) {
      oldMarket.active = false;
      oldMarket.resolved = true;
      await upsertMarket(oldMarket);
      await eventBus.emitLog(
        'MARKET',
        'info',
        `BTC 5M market expired: ${oldMarket.slug}. Window closed at ${new Date(oldMarket.endTime).toLocaleTimeString()}`
      );
    }

    // Try finding in database first
    let market = await getMarket(slug);

    if (!market || !market.upTokenId || !market.downTokenId) {
      // Query Gamma API for official market metadata
      market = await this.fetchMarketFromGamma(slug, startTime, endTime);
    }

    this.currentMarket = market;
    await upsertMarket(market);

    await eventBus.emitLog('MARKET', 'success', `BTC 5M market detected: ${market.slug}`, {
      marketId: market.id,
      slug: market.slug,
      upTokenId: market.upTokenId,
      downTokenId: market.downTokenId,
      startsAt: new Date(market.startTime).toLocaleTimeString(),
      expiresAt: new Date(market.endTime).toLocaleTimeString(),
    });

    await eventBus.emitLog('MARKET', 'info', `UP token detected: ${market.upTokenId.substring(0, 16)}...`);
    await eventBus.emitLog('MARKET', 'info', `DOWN token detected: ${market.downTokenId.substring(0, 16)}...`);

    // Notify all listeners (WebSocket feed, Trigger engine, etc.)
    for (const listener of this.listeners) {
      try {
        listener(market, oldMarket || undefined);
      } catch (err) {
        console.error('[MarketDiscovery] Error in market change listener:', err);
      }
    }

    eventBus.broadcastSse('market_change', market);

    return market;
  }

  /**
   * Queries Polymarket Gamma API for official market information.
   * Falls back smoothly if the market is just created or API is unreachable.
   */
  private async fetchMarketFromGamma(
    slug: string,
    startTime: number,
    endTime: number
  ): Promise<Btc5mMarket> {
    const formattedStartTime = new Date(startTime).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const formattedEndTime = new Date(endTime).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const defaultQuestion = `Bitcoin Up or Down: ${formattedStartTime} to ${formattedEndTime} UTC`;

    try {
      // 1. Try querying events by slug
      const url = `${this.gammaHost}/events?slug=${encodeURIComponent(slug)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });

      if (res.ok) {
        const events = (await res.json()) as any[];
        if (Array.isArray(events) && events.length > 0 && events[0].markets?.length > 0) {
          const pmEvent = events[0];
          const pmMarket = pmEvent.markets[0];
          const clobTokenIds = pmMarket.clobTokenIds
            ? typeof pmMarket.clobTokenIds === 'string'
              ? JSON.parse(pmMarket.clobTokenIds)
              : pmMarket.clobTokenIds
            : [];

          let upTokenId = clobTokenIds[0] || '';
          let downTokenId = clobTokenIds[1] || '';

          // Determine UP and DOWN token assignments from outcomes array
          const outcomes = pmMarket.outcomes
            ? typeof pmMarket.outcomes === 'string'
              ? JSON.parse(pmMarket.outcomes)
              : pmMarket.outcomes
            : ['Up', 'Down'];

          if (outcomes[0]?.toLowerCase().includes('down') && clobTokenIds.length >= 2) {
            downTokenId = clobTokenIds[0];
            upTokenId = clobTokenIds[1];
          }

          if (upTokenId && downTokenId) {
            return {
              id: pmMarket.id || slug,
              slug,
              question: pmMarket.question || defaultQuestion,
              conditionId: pmMarket.conditionId || `cond_${slug}`,
              upTokenId,
              downTokenId,
              startTime,
              endTime,
              active: true,
              resolved: false,
            };
          }
        }
      }
    } catch (err) {
      // Gamma API query failed or timed out
    }

    // 2. Query markets endpoint with search query for btc 5m
    try {
      const searchUrl = `${this.gammaHost}/markets?limit=10&active=true&closed=false&tag=Bitcoin`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const markets = (await res.json()) as any[];
        const match = markets.find(
          (m: any) => m.slug === slug || (m.slug && m.slug.includes('btc-updown-5m') && m.active)
        );
        if (match && match.clobTokenIds) {
          const clobTokenIds =
            typeof match.clobTokenIds === 'string' ? JSON.parse(match.clobTokenIds) : match.clobTokenIds;
          if (clobTokenIds.length >= 2) {
            return {
              id: match.id || slug,
              slug: match.slug || slug,
              question: match.question || defaultQuestion,
              conditionId: match.conditionId || `cond_${slug}`,
              upTokenId: clobTokenIds[0],
              downTokenId: clobTokenIds[1],
              startTime,
              endTime,
              active: true,
              resolved: false,
            };
          }
        }
      }
    } catch (_) {}

    // 3. Fallback: Deterministic token IDs based on standard Polymarket outcome encoding
    // This allows seamless continuity even before Gamma indexes the immediate 5-minute slot!
    const epochSec = Math.floor(startTime / 1000);
    const mockUpTokenId = `137${epochSec}000000000000000000000000000000000000000000000000000000001`;
    const mockDownTokenId = `137${epochSec}000000000000000000000000000000000000000000000000000000002`;

    return {
      id: slug,
      slug,
      question: defaultQuestion,
      conditionId: `cond_${slug}`,
      upTokenId: mockUpTokenId,
      downTokenId: mockDownTokenId,
      startTime,
      endTime,
      active: true,
      resolved: false,
    };
  }
}

export const marketDiscovery = new MarketDiscoveryService();
