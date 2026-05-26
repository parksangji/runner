import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { SESSIONS_JSON } from '@shared/paths';
import type {
  DaemonEvent,
  DaemonRequest,
  SessionId,
  SessionSpec,
  SessionSummary,
} from '@shared/protocol';
import { Session } from './session';

export class SessionRegistry extends EventEmitter {
  private sessions = new Map<SessionId, Session>();
  private persistTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.restore();
  }

  private restore(): void {
    if (!existsSync(SESSIONS_JSON())) return;
    try {
      const raw = readFileSync(SESSIONS_JSON(), 'utf8');
      const specs = JSON.parse(raw) as SessionSpec[];
      for (const spec of specs) {
        try {
          this.createInternal(spec);
        } catch {
          /* skip unspawnable */
        }
      }
    } catch {
      /* ignore corrupt file */
    }
  }

  private persist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      const specs: SessionSpec[] = [];
      for (const s of this.sessions.values()) {
        specs.push(s.spec);
      }
      try {
        writeFileSync(SESSIONS_JSON(), JSON.stringify(specs, null, 2));
      } catch {
        /* ignore */
      }
    }, 100);
  }

  private wire(session: Session): void {
    session.on('data', (data: string) => {
      this.emit('event', { kind: 'data', id: session.id, data } satisfies DaemonEvent);
    });
    session.on('cwd', (cwd: string) => {
      this.emit('event', { kind: 'cwd', id: session.id, cwd } satisfies DaemonEvent);
      this.persist();
    });
    session.on('exit', (code: number | null, signal: string | null) => {
      this.emit('event', {
        kind: 'exit',
        id: session.id,
        code,
        signal,
      } satisfies DaemonEvent);
      this.sessions.delete(session.id);
      this.persist();
    });
  }

  private createInternal(spec: SessionSpec): Session {
    const session = new Session(spec);
    this.wire(session);
    this.sessions.set(spec.id, session);
    session.start();
    return session;
  }

  summaries(): SessionSummary[] {
    return Array.from(this.sessions.values()).map((s) => s.summary());
  }

  async dispatch(req: DaemonRequest): Promise<unknown> {
    switch (req.kind) {
      case 'list':
        return this.summaries();
      case 'spawn': {
        const spec: SessionSpec = {
          id: randomUUID(),
          createdAt: Date.now(),
          ...req.spec,
        };
        const s = this.createInternal(spec);
        this.persist();
        return s.summary();
      }
      case 'attach': {
        const s = this.sessions.get(req.id);
        if (!s) throw new Error(`Unknown session ${req.id}`);
        const snapshot = { summary: s.summary(), scrollback: s.scrollback() };
        // Open the floodgates only AFTER we've captured the scrollback so
        // the caller writes the snapshot first and then receives only
        // post-attach data events — no duplicates.
        s.beginBroadcasting();
        return snapshot;
      }
      case 'detach':
        // Detach is a UI concept; daemon keeps the session alive.
        return true;
      case 'kill': {
        const s = this.sessions.get(req.id);
        if (!s) return false;
        s.kill();
        return true;
      }
      case 'write': {
        const s = this.sessions.get(req.id);
        if (!s) throw new Error(`Unknown session ${req.id}`);
        s.write(req.data);
        return true;
      }
      case 'resize': {
        const s = this.sessions.get(req.id);
        if (!s) throw new Error(`Unknown session ${req.id}`);
        s.resize(req.cols, req.rows);
        return true;
      }
      case 'ping':
        return { pong: Date.now() };
    }
  }

  dispose(): void {
    for (const s of this.sessions.values()) s.kill();
    this.sessions.clear();
  }
}
