export type SessionId = string;

export interface SessionSpec {
  id: SessionId;
  cwd: string;
  cmd: string;
  args: string[];
  env: Record<string, string>;
  cols: number;
  rows: number;
  title: string;
  createdAt: number;
}

export interface SessionSummary {
  id: SessionId;
  cwd: string;
  title: string;
  alive: boolean;
  cols: number;
  rows: number;
}

export type DaemonRequest =
  | { kind: 'list' }
  | { kind: 'spawn'; spec: Omit<SessionSpec, 'id' | 'createdAt'> }
  | { kind: 'attach'; id: SessionId }
  | { kind: 'detach'; id: SessionId }
  | { kind: 'kill'; id: SessionId }
  | { kind: 'write'; id: SessionId; data: string }
  | { kind: 'resize'; id: SessionId; cols: number; rows: number }
  | { kind: 'ping' };

export type DaemonResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

export type DaemonEvent =
  | { kind: 'data'; id: SessionId; data: string }
  | { kind: 'exit'; id: SessionId; code: number | null; signal: string | null }
  | { kind: 'cwd'; id: SessionId; cwd: string }
  | { kind: 'title'; id: SessionId; title: string };

export interface RpcEnvelope {
  id?: number;
  req?: DaemonRequest;
  res?: DaemonResponse;
  evt?: DaemonEvent;
}
