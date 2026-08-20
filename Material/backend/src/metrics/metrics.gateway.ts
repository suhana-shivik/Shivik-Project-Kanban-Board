import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { MetricsService } from './metrics.service';

/** Requests can finish faster than a screen can usefully repaint. */
const THROTTLE_MS = 200;
/** Keeps uptime and the rolling rate moving while traffic is idle. */
const HEARTBEAT_MS = 1000;

@WebSocketGateway({ cors: { origin: '*' } })
export class MetricsGateway
  implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server;

  private unsubscribe?: () => void;
  private heartbeat?: NodeJS.Timeout;
  private pending?: NodeJS.Timeout;
  private lastPushAt = 0;

  constructor(private readonly metrics: MetricsService) {}

  afterInit(): void {
    this.unsubscribe = this.metrics.subscribe(() => this.push());
    this.heartbeat = setInterval(() => this.emit(), HEARTBEAT_MS);
  }

  /** A fresh client should not wait for the next request to see anything. */
  handleConnection(client: Socket): void {
    client.emit('metrics', this.metrics.snapshot());
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.pending) clearTimeout(this.pending);
  }

  /** Leading-edge throttle: instant on the first hit, coalesced under load. */
  private push(): void {
    if (this.pending) return;

    const elapsed = Date.now() - this.lastPushAt;
    if (elapsed >= THROTTLE_MS) {
      this.emit();
      return;
    }

    this.pending = setTimeout(() => {
      this.pending = undefined;
      this.emit();
    }, THROTTLE_MS - elapsed);
  }

  private emit(): void {
    this.lastPushAt = Date.now();
    this.server?.emit('metrics', this.metrics.snapshot());
  }
}
