/**
 * Event Bus for system events, trading events, and real-time SSE streaming
 */

import { EventEmitter } from 'events';
import { Response } from 'express';
import { SystemEvent } from '../types.js';
import { insertSystemEvent } from '../database/db.js';

class EventBus extends EventEmitter {
  private sseClients: Set<Response> = new Set();

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  public registerSseClient(res: Response): void {
    this.sseClients.add(res);
    res.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  public async emitLog(
    type: SystemEvent['type'],
    level: SystemEvent['level'],
    message: string,
    details?: Record<string, any>
  ): Promise<SystemEvent> {
    const timestamp = Date.now();
    const event: SystemEvent = {
      id: `evt_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      level,
      message,
      details,
      timestamp,
    };

    const timeStr = new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    console.log(`[${timeStr}] [${type}] ${message}`);

    // Persist to database asynchronously
    try {
      await insertSystemEvent(event);
    } catch (err) {
      console.error('[EventBus] Error persisting system event:', err);
    }

    // Broadcast via internal emitter
    this.emit('event', event);

    // Broadcast to SSE clients
    this.broadcastSse('event', event);

    return event;
  }

  public broadcastSse(channel: string, data: any): void {
    const payload = `event: ${channel}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
        if (typeof (client as any).flush === 'function') {
          (client as any).flush();
        }
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }
}

export const eventBus = new EventBus();
