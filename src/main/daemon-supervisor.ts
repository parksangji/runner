import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { DAEMON_PID, DAEMON_SOCKET } from '@shared/paths';
import { DaemonClient } from './daemon-client';

let client: DaemonClient | null = null;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(): number | null {
  if (!existsSync(DAEMON_PID())) return null;
  const raw = readFileSync(DAEMON_PID(), 'utf8').trim();
  const pid = Number.parseInt(raw, 10);
  return Number.isFinite(pid) ? pid : null;
}

function clearPid(): void {
  try {
    unlinkSync(DAEMON_PID());
  } catch {
    /* ignore */
  }
}

function spawnDaemon(): number {
  const daemonScript = join(__dirname, 'daemon.js');
  const child = spawn(process.execPath, [daemonScript], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  if (!child.pid) throw new Error('Failed to spawn daemon');
  child.unref();
  writeFileSync(DAEMON_PID(), String(child.pid), 'utf8');
  return child.pid;
}

async function waitForSocket(timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(DAEMON_SOCKET())) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Daemon socket did not appear in time');
}

export async function ensureDaemon(): Promise<DaemonClient> {
  if (client?.connected) return client;

  let pid = readPid();
  if (pid && !isAlive(pid)) {
    clearPid();
    pid = null;
  }
  if (!pid) {
    pid = spawnDaemon();
    await waitForSocket();
  }

  client = new DaemonClient(DAEMON_SOCKET());
  await client.connect();
  return client;
}

export function getClient(): DaemonClient {
  if (!client) throw new Error('Daemon client not initialized');
  return client;
}

export function shutdownClient(): void {
  client?.close();
  client = null;
}

app.on('will-quit', () => {
  shutdownClient();
});
