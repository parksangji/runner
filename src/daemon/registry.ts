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
          // Daemon-side restore: bring the shell back up immediately so a
          // reconnecting renderer can attach and start receiving output.
          this.createInternal(spec, true);
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

  /**
   * Build a Session for the spec but do NOT spawn its PTY yet.
   * The PTY is forked at attach time so the renderer has a chance to
   * register its data-event listener first. `eager=true` overrides this
   * (used for daemon-side restore — we want surviving sessions running).
   */
  private createInternal(spec: SessionSpec, eager: boolean = false): Session {
    const session = new Session(spec);
    this.wire(session);
    this.sessions.set(spec.id, session);
    if (eager) session.start();
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
        // For sessions whose PTY hasn't been forked yet (new spawns), do it
        // now — the renderer's listener is already in place, so the prompt
        // arrives as a live event with no race or duplicate path.
        // For restored sessions whose PTY is already running, just return
        // the scrollback snapshot.
        if (!s.isStarted) {
          s.start();
          return { summary: s.summary(), scrollback: '' };
        }
        return { summary: s.summary(), scrollback: s.scrollback() };
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
