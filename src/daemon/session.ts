import { EventEmitter } from 'node:events';
import type { IPty } from 'node-pty';
import type { SessionSpec, SessionSummary } from '@shared/protocol';
import { RingBuffer } from './ring-buffer';

const SCROLLBACK_LINES = 10_000;

export class Session extends EventEmitter {
  readonly id: string;
  spec: SessionSpec;
  private pty: IPty | null = null;
  private buffer = new RingBuffer<string>(SCROLLBACK_LINES);
  private currentLine = '';
  private alive = false;
  // Lazy PTY spawn: we don't fork the shell until a client attaches. This
  // guarantees the renderer has registered its data-event listener BEFORE
  // any PTY output exists, so the startup prompt arrives via live events
  // (no scrollback needed, no duplicate write to xterm).
  private started = false;

  constructor(spec: SessionSpec) {
    super();
    this.id = spec.id;
    this.spec = spec;
  }

  get isStarted(): boolean {
    return this.started;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const pty = require('node-pty') as typeof import('node-pty');
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...this.spec.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };
    const proc = pty.spawn(this.spec.cmd, this.spec.args, {
      cwd: this.spec.cwd,
      cols: this.spec.cols,
      rows: this.spec.rows,
      env,
      name: 'xterm-256color',
    });
    this.pty = proc;
    this.alive = true;
    proc.onData((data) => {
      this.absorb(data);
      this.emit('data', data);
      this.detectCwdMarker(data);
    });
    proc.onExit(({ exitCode, signal }) => {
      this.alive = false;
      this.emit('exit', exitCode ?? null, signal ? String(signal) : null);
    });
  }

  private absorb(chunk: string): void {
    let acc = this.currentLine;
    for (const ch of chunk) {
      if (ch === '\n') {
        this.buffer.push(acc);
        acc = '';
      } else {
        acc += ch;
      }
    }
    this.currentLine = acc;
  }

  // OSC 7: ESC ] 7 ; file://host/path ST  → cwd update
  private detectCwdMarker(data: string): void {
    const m = data.match(/\x1b\]7;file:\/\/[^/]*([^\x07\x1b]+)(\x07|\x1b\\)/);
    if (!m || !m[1]) return;
    const cwd = decodeURIComponent(m[1]);
    if (cwd && cwd !== this.spec.cwd) {
      this.spec = { ...this.spec, cwd };
      this.emit('cwd', cwd);
    }
  }

  write(data: string): void {
    this.pty?.write(data);
  }

  resize(cols: number, rows: number): void {
    if (!this.pty) return;
    this.pty.resize(cols, rows);
    this.spec = { ...this.spec, cols, rows };
  }

  kill(): void {
    try {
      this.pty?.kill();
    } catch {
      /* ignore */
    }
    this.alive = false;
  }

  scrollback(): string {
    const lines = this.buffer.toArray();
    if (this.currentLine) lines.push(this.currentLine);
    return lines.join('\n');
  }

  summary(): SessionSummary {
    return {
      id: this.id,
      cwd: this.spec.cwd,
      title: this.spec.title,
      alive: this.alive,
      cols: this.spec.cols,
      rows: this.spec.rows,
    };
  }
}
