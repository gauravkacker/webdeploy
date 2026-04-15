/**
 * LAN Connection State Machine
 * Manages connection state transitions with event emission and concurrency control
 *
 * States: disconnected → connecting → connected → error → disconnected
 */

import { EventEmitter } from 'events';
import type { LANConnectionState, LANNetworkConfig, ConnectedInstance } from '@/types/lan-network';

export type ConnectionStateValue = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface StateTransitionEvent {
  from: ConnectionStateValue;
  to: ConnectionStateValue;
  timestamp: number;
  role?: 'main' | 'child';
  error?: { code: string; message: string; timestamp: number };
}

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<ConnectionStateValue, ConnectionStateValue[]> = {
  disconnected: ['connecting'],
  connecting: ['connected', 'error', 'disconnected'],
  connected: ['disconnected', 'error'],
  error: ['disconnected', 'connecting'],
};

export class ConnectionStateMachine extends EventEmitter {
  private state: LANConnectionState;
  private operationQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  constructor() {
    super();
    this.state = {
      state: 'disconnected',
      connectedInstances: [],
      lastStateChange: Date.now(),
    };
  }

  /**
   * Get current connection state
   */
  public getState(): LANConnectionState {
    return { ...this.state };
  }

  /**
   * Get current state value
   */
  public getCurrentState(): ConnectionStateValue {
    return this.state.state;
  }

  /**
   * Transition to a new state
   */
  public transition(
    to: ConnectionStateValue,
    options?: {
      role?: 'main' | 'child';
      mainServerId?: string;
      connectedInstances?: ConnectedInstance[];
      error?: { code: string; message: string; timestamp: number };
    }
  ): boolean {
    const from = this.state.state;
    const allowed = VALID_TRANSITIONS[from];

    if (!allowed.includes(to)) {
      console.warn(`[StateMachine] Invalid transition: ${from} → ${to}`);
      return false;
    }

    const previousState = { ...this.state };

    this.state = {
      ...this.state,
      state: to,
      lastStateChange: Date.now(),
      role: options?.role ?? (to === 'disconnected' ? undefined : this.state.role),
      mainServerId: options?.mainServerId ?? (to === 'disconnected' ? undefined : this.state.mainServerId),
      connectedInstances: options?.connectedInstances ?? (to === 'disconnected' ? [] : this.state.connectedInstances),
      error: options?.error ?? (to !== 'error' ? undefined : this.state.error),
    };

    const event: StateTransitionEvent = {
      from,
      to,
      timestamp: this.state.lastStateChange,
      role: this.state.role,
      error: this.state.error,
    };

    console.log(`[StateMachine] State transition: ${from} → ${to}`, options?.role ? `(role: ${options.role})` : '');
    this.emit('state-change', event);
    this.emit(`state:${to}`, event);

    return true;
  }

  /**
   * Queue an operation to prevent concurrent connections
   */
  public async queueOperation(operation: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.operationQueue.push(async () => {
        try {
          await operation();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.operationQueue.length === 0) return;

    this.isProcessingQueue = true;
    while (this.operationQueue.length > 0) {
      const op = this.operationQueue.shift();
      if (op) {
        try {
          await op();
        } catch (err) {
          console.error('[StateMachine] Queue operation failed:', err);
        }
      }
    }
    this.isProcessingQueue = false;
  }

  /**
   * Update connected instances list
   */
  public updateConnectedInstances(instances: ConnectedInstance[]): void {
    this.state = { ...this.state, connectedInstances: instances };
    this.emit('instances-updated', instances);
  }

  /**
   * Persist state to storage (dual-mode: localStorage or file)
   */
  public persistState(config?: Partial<LANNetworkConfig>): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('lanConnectionState', JSON.stringify(this.state));
        if (config) {
          const existing = localStorage.getItem('lanNetworkConfig');
          const existingConfig = existing ? JSON.parse(existing) : {};
          localStorage.setItem('lanNetworkConfig', JSON.stringify({ ...existingConfig, ...config }));
        }
      }
    } catch (err) {
      console.warn('[StateMachine] Failed to persist state:', err);
    }
  }

  /**
   * Load persisted state from storage
   */
  public loadPersistedState(): LANConnectionState | null {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('lanConnectionState');
        if (saved) {
          return JSON.parse(saved) as LANConnectionState;
        }
      }
    } catch (err) {
      console.warn('[StateMachine] Failed to load persisted state:', err);
    }
    return null;
  }

  /**
   * Reset to disconnected state
   */
  public reset(): void {
    const from = this.state.state;
    this.state = {
      state: 'disconnected',
      connectedInstances: [],
      lastStateChange: Date.now(),
    };
    this.operationQueue = [];
    this.isProcessingQueue = false;

    this.emit('state-change', { from, to: 'disconnected', timestamp: this.state.lastStateChange });
    this.emit('state:disconnected', { from, to: 'disconnected', timestamp: this.state.lastStateChange });
  }
}

// Singleton instance
let stateMachineInstance: ConnectionStateMachine | null = null;

export function getConnectionStateMachine(): ConnectionStateMachine {
  if (!stateMachineInstance) {
    stateMachineInstance = new ConnectionStateMachine();
  }
  return stateMachineInstance;
}
