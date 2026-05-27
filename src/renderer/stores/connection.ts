import { create } from 'zustand';
import type { ConnectionStatus } from '@shared/protocol';
import { runner } from '../api';

interface ConnectionState {
  status: ConnectionStatus;
  set: (status: ConnectionStatus) => void;
  reconnect: () => Promise<void>;
}

export const useConnection = create<ConnectionState>((set) => ({
  status: 'connected',
  set: (status) => set({ status }),
  async reconnect() {
    set({ status: 'reconnecting' });
    try {
      await runner().daemon.reconnect();
    } catch {
      set({ status: 'disconnected' });
    }
  },
}));

/** Subscribe to main-process connection-status broadcasts. */
export function bindConnectionStatus(): () => void {
  return runner().daemon.onStatus((status) => useConnection.getState().set(status));
}
