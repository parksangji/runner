import { createServer, type Server, type Socket } from 'node:net';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DAEMON_PID, DAEMON_SOCKET, appDataDir } from '@shared/paths';
import type { DaemonEvent, DaemonRequest, DaemonResponse, RpcEnvelope } from '@shared/protocol';
import { SessionRegistry } from './registry';

function frame(env: RpcEnvelope): Buffer {
  const json = Buffer.from(JSON.stringify(env), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(json.length, 0);
  return Buffer.concat([len, json]);
}

class ClientConn {
  private buffer = Buffer.alloc(0);
  constructor(
    private readonly socket: Socket,
    private readonly registry: SessionRegistry,
    private readonly onClose: () => void
  ) {
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('close', () => this.onClose());
    socket.on('error', () => this.onClose());
  }

  send(env: RpcEnvelope): void {
    if (!this.socket.writable) return;
    this.socket.write(frame(env));
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
        if (env.req && env.id != null) void this.handle(env.id, env.req);
      } catch {
        /* ignore malformed */
      }
    }
  }

  private async handle(id: number, req: DaemonRequest): Promise<void> {
    try {
      const result = await this.registry.dispatch(req);
      const res: DaemonResponse = { ok: true, result };
      this.send({ id, res });
    } catch (err) {
      const res: DaemonResponse = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
      this.send({ id, res });
    }
  }
}

function bootstrap(): void {
  mkdirSync(appDataDir(), { recursive: true });
  if (existsSync(DAEMON_SOCKET())) {
    try {
      unlinkSync(DAEMON_SOCKET());
    } catch {
      /* ignore */
    }
  }
  writeFileSync(DAEMON_PID(), String(process.pid), 'utf8');

  const registry = new SessionRegistry();
  const clients = new Set<ClientConn>();

  const broadcast = (evt: DaemonEvent): void => {
    for (const c of clients) c.send({ evt });
  };
  registry.on('event', broadcast);

  const server: Server = createServer((socket) => {
    const conn = new ClientConn(socket, registry, () => {
      clients.delete(conn);
    });
    clients.add(conn);
  });

  server.listen(DAEMON_SOCKET(), () => {
    // mode 600 on unix-domain socket
    if (process.platform !== 'win32') {
      try {
        const { chmodSync } = require('node:fs') as typeof import('node:fs');
        chmodSync(DAEMON_SOCKET(), 0o600);
      } catch {
        /* ignore */
      }
    }
  });

  const cleanup = (): void => {
    try {
      registry.dispose();
    } catch {
      /* ignore */
    }
    try {
      server.close();
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(DAEMON_SOCKET());
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(DAEMON_PID());
    } catch {
      /* ignore */
    }
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  // Ensure parent dir for socket exists (defensive)
  mkdirSync(dirname(DAEMON_SOCKET()), { recursive: true });
}

bootstrap();
