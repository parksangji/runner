import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { readlink } from 'node:fs/promises';
import type { IPty } from 'node-pty';
import type { SessionSpec, SessionSummary } from '@shared/protocol';
import { RingBuffer } from './ring-buffer';

const SCROLLBACK_LINES = 10_000;
const CWD_POLL_MS = 1500;

// Resolve the *actual* working directory of a running process. Most shells
// don't emit OSC 7, so we can't rely on terminal escapes alone — instead we
// ask the OS for the shell pid's cwd. macOS: lsof; Linux: /proc; Windows: n/a.
function queryProcessCwd(pid: number): Promise<string | null> {
  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      execFile('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], (err, stdout) => {
        if (err) return resolve(null);
        const line = stdout.split('\n').find((l) => l.startsWith('n'));
        resolve(line ? line.slice(1).trim() || null : null);
      });
    });
  }
  if (process.platform === 'linux') {
    return readlink(`/proc/${pid}/cwd`).then((p) => p || null).catch(() => null);
  }
  return Promise.resolve(null);
}

export class Session extends EventEmitter {
  readonly id: string;
  spec: SessionSpec;
  private pty: IPty | null = null;
  private buffer = new RingBuffer<string>(SCROLLBACK_LINES);
  private currentLine = '';
  private alive = false;
  private cwdTimer: NodeJS.Timeout | null = null;
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
      this.stopCwdPolling();
      this.emit('exit', exitCode ?? null, signal ? String(signal) : null);
    });
    this.startCwdPolling(proc.pid);
  }

  private startCwdPolling(pid: number): void {
    const poll = async (): Promise<void> => {
      const cwd = await queryProcessCwd(pid);
      if (cwd && cwd !== this.spec.cwd) {
        this.spec = { ...this.spec, cwd };
        this.emit('cwd', cwd);
      }
    };
    void poll();
    this.cwdTimer = setInterval(() => void poll(), CWD_POLL_MS);
  }

  private stopCwdPolling(): void {
    if (this.cwdTimer) {
      clearInterval(this.cwdTimer);
      this.cwdTimer = null;
    }
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
    this.stopCwdPolling();
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
