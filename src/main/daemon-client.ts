import { createConnection, type Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import type { DaemonEvent, DaemonRequest, DaemonResponse, RpcEnvelope } from '@shared/protocol';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

export class DaemonClient extends EventEmitter {
  private socket: Socket | null = null;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, Pending>();
  public connected = false;

  constructor(private readonly socketPath: string) {
    super();
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = createConnection(this.socketPath);
      sock.once('connect', () => {
        this.connected = true;
        resolve();
      });
      sock.once('error', (err) => {
        if (!this.connected) reject(err);
        else this.emit('error', err);
      });
      sock.on('data', (chunk) => this.onData(chunk));
      sock.on('close', () => {
        this.connected = false;
        this.emit('close');
      });
      this.socket = sock;
    });
  }

  close(): void {
    this.socket?.end();
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
  }

  request<T = unknown>(req: DaemonRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error('Daemon not connected'));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.send({ id, req });
    });
  }

  private send(env: RpcEnvelope): void {
    const json = Buffer.from(JSON.stringify(env), 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(json.length, 0);
    this.socket!.write(Buffer.concat([len, json]));
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0);
      if (this.buffer.length < 4 + len) break;
      const payload = this.buffer.subarray(4, 4 + len);
      this.buffer = this.buffer.subarray(4 + len);
      try {
        const env = JSON.parse(payload.toString('utf8')) as RpcEnvelope;
        this.handleEnvelope(env);
      } catch (err) {
        this.emit('error', err);
      }
    }
  }

  private handleEnvelope(env: RpcEnvelope): void {
    if (env.evt) {
      this.emit('event', env.evt satisfies DaemonEvent);
      return;
    }
    if (env.id == null || !env.res) return;
    const p = this.pending.get(env.id);
    if (!p) return;
    this.pending.delete(env.id);
    const res = env.res as DaemonResponse;
    if (res.ok) p.resolve(res.result);
    else p.reject(new Error(res.error));
  }
}
