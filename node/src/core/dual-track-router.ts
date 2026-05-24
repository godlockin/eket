/**
 * EKET Framework - Dual-Track Fallback Engine (Dual-Track Router)
 *
 * Implements transparent routing of high-frequency operations between Track A (Rust Core)
 * and Track B (Node.js Local Fallback). Real-time exception catching during Rust connection
 * failures dynamically switches subsequent operations seamlessly to the Node.js implementation.
 */

import { MasterElection } from './master-election.js';
import { EventBus } from './event-bus.js';
import type { Result } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';

// ============================================================================
// Environment Detection Helper
// ============================================================================

export interface EnvironmentDiagnostics {
  available: boolean;
  track: 'A' | 'B';
  reason?: string;
}

/**
 * Automatically detects whether the Rust HTTP API server is available.
 */
export async function detectRustEnvironment(
  apiUrl?: string
): Promise<EnvironmentDiagnostics> {
  const url = apiUrl || process.env.EKET_RUST_API_URL || 'http://localhost:9877';
  let resp: Response | undefined;
  try {
    resp = await fetch(`${url}/health`, { signal: AbortSignal.timeout(300) });
    if (resp.ok) {
      return {
        available: true,
        track: 'A',
      };
    }
    return {
      available: false,
      track: 'B',
      reason: `Rust server health endpoint returned status ${resp.status}`,
    };
  } catch (err: any) {
    return {
      available: false,
      track: 'B',
      reason: `Failed to connect to Rust server: ${err.message}`,
    };
  } finally {
    // Cancel fetch response body to release the socket back to the undici connection pool
    if (resp && resp.body && !resp.bodyUsed) {
      await resp.body.cancel().catch(() => {});
    }
  }
}

// ============================================================================
// Master Election Track Adapters
// ============================================================================

export interface IMasterElection {
  tryElect(): Promise<boolean>;
}

export class RustElectionAdapter implements IMasterElection {
  public apiUrl: string;

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || process.env.EKET_RUST_API_URL || 'http://localhost:9877';
  }

  async tryElect(): Promise<boolean> {
    let resp: Response | undefined;
    try {
      resp = await fetch(`${this.apiUrl}/api/v1/election`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId: 'dual-track-master' }),
        signal: AbortSignal.timeout(500),
      });

      if (!resp.ok) {
        throw new Error(`Rust server election returned status ${resp.status}`);
      }

      // Check Content-Type to prevent large HTML payloads from blocking the parser
      const contentType = resp.headers && typeof resp.headers.get === 'function' ? resp.headers.get('content-type') : null;
      if (contentType && !contentType.includes('application/json')) {
        throw new Error(`Rust server response is not JSON (Content-Type: ${contentType})`);
      }

      const data = (await resp.json()) as any;
      return !!(data && data.success);
    } finally {
      if (resp && resp.body && !resp.bodyUsed) {
        await resp.body.cancel().catch(() => {});
      }
    }
  }
}

export class NodeElectionFallback implements IMasterElection {
  private election: MasterElection;

  constructor(election: MasterElection) {
    this.election = election;
  }

  async tryElect(): Promise<boolean> {
    const res = await this.election.elect();
    return res.success && !!(res.data && (res.data as any).isMaster);
  }
}

// ============================================================================
// Dual-Track Election
// ============================================================================

export class DualTrackElection implements IMasterElection {
  private rustAdapter: RustElectionAdapter;
  private nodeFallback: NodeElectionFallback;
  private currentTrack: 'A' | 'B' = 'A';
  private lastFailureTime = 0;
  private isCheckingHealth = false;
  public cooldownMs = 30000; // 30 seconds cooldown before retrying Track A

  constructor(rust: RustElectionAdapter, node: NodeElectionFallback) {
    this.rustAdapter = rust;
    this.nodeFallback = node;
  }

  getCurrentTrack(): 'A' | 'B' {
    return this.currentTrack;
  }

  setTrack(track: 'A' | 'B'): void {
    this.currentTrack = track;
    if (track === 'A') {
      this.lastFailureTime = 0;
    }
  }

  async tryElect(): Promise<boolean> {
    const now = Date.now();
    if (this.currentTrack === 'B' && now - this.lastFailureTime > this.cooldownMs) {
      if (!this.isCheckingHealth) {
        this.isCheckingHealth = true;
        try {
          const diagnostics = await detectRustEnvironment(this.rustAdapter.apiUrl);
          if (diagnostics.available) {
            console.info(`[Dual-Track] Rust Core is healthy again, recovering to Track A.`);
            this.currentTrack = 'A';
          } else {
            this.lastFailureTime = Date.now(); // Reset cooldown
          }
        } catch {
          this.lastFailureTime = Date.now();
        } finally {
          this.isCheckingHealth = false;
        }
      }
    }

    if (this.currentTrack === 'A') {
      try {
        return await this.rustAdapter.tryElect();
      } catch (err: any) {
        console.warn(
          `[Dual-Track] Rust Core 异常或不可用，自动降级至 JS 本轨。原因: ${err.message}`
        );
        this.currentTrack = 'B';
        this.lastFailureTime = Date.now();
      }
    }
    return await this.nodeFallback.tryElect();
  }
}

// ============================================================================
// Event Bus Track Adapters
// ============================================================================

export class RustEventBusAdapter {
  public apiUrl: string;

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || process.env.EKET_RUST_API_URL || 'http://localhost:9877';
  }

  async publish(eventType: string, payload: any, source?: string): Promise<void> {
    let resp: Response | undefined;
    try {
      resp = await fetch(`${this.apiUrl}/api/v1/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: eventType, payload, source }),
        signal: AbortSignal.timeout(500),
      });

      if (!resp.ok) {
        throw new Error(`Rust server event publish returned status ${resp.status}`);
      }
    } finally {
      if (resp && resp.body && !resp.bodyUsed) {
        await resp.body.cancel().catch(() => {});
      }
    }
  }
}

// ============================================================================
// Dual-Track Event Bus
// ============================================================================

export class DualTrackEventBus {
  private rustAdapter: RustEventBusAdapter;
  private nodeFallback: EventBus;
  private currentTrack: 'A' | 'B' = 'A';
  private lastFailureTime = 0;
  private isCheckingHealth = false;
  public cooldownMs = 30000; // 30 seconds cooldown

  constructor(rust: RustEventBusAdapter, node: EventBus) {
    this.rustAdapter = rust;
    this.nodeFallback = node;
  }

  getCurrentTrack(): 'A' | 'B' {
    return this.currentTrack;
  }

  setTrack(track: 'A' | 'B'): void {
    this.currentTrack = track;
    if (track === 'A') {
      this.lastFailureTime = 0;
    }
  }

  private async checkAutoRecovery(): Promise<void> {
    const now = Date.now();
    if (this.currentTrack === 'B' && now - this.lastFailureTime > this.cooldownMs) {
      if (!this.isCheckingHealth) {
        this.isCheckingHealth = true;
        try {
          const diagnostics = await detectRustEnvironment(this.rustAdapter.apiUrl);
          if (diagnostics.available) {
            console.info(`[Dual-Track] Rust Core is healthy again, recovering to Track A.`);
            this.currentTrack = 'A';
          } else {
            this.lastFailureTime = Date.now();
          }
        } catch {
          this.lastFailureTime = Date.now();
        } finally {
          this.isCheckingHealth = false;
        }
      }
    }
  }

  async emit<T>(eventType: string, payload: T, source?: string): Promise<void> {
    await this.checkAutoRecovery();

    let trackAFailed = false;
    if (this.currentTrack === 'A') {
      try {
        await this.rustAdapter.publish(eventType, payload, source);
      } catch (err: any) {
        console.warn(
          `[Dual-Track] Rust EventBus emit 失败，降级至 JS 本轨。原因: ${err.message}`
        );
        this.currentTrack = 'B';
        this.lastFailureTime = Date.now();
        trackAFailed = true;
      }

      if (!trackAFailed) {
        // Distribute to local listeners so Node.js in-process routing continues to work.
        // Isolated from the Track A try-catch block to prevent listener double execution or false track B triggers.
        this.nodeFallback.emit(eventType, payload, source);
        return;
      }
    }

    this.nodeFallback.emit(eventType, payload, source);
  }

  async emitAsync<T>(eventType: string, payload: T, source?: string): Promise<void> {
    await this.checkAutoRecovery();

    let trackAFailed = false;
    if (this.currentTrack === 'A') {
      try {
        await this.rustAdapter.publish(eventType, payload, source);
      } catch (err: any) {
        console.warn(
          `[Dual-Track] Rust EventBus emitAsync 失败，降级至 JS 本轨。原因: ${err.message}`
        );
        this.currentTrack = 'B';
        this.lastFailureTime = Date.now();
        trackAFailed = true;
      }

      if (!trackAFailed) {
        await this.nodeFallback.emitAsync(eventType, payload, source);
        return;
      }
    }

    await this.nodeFallback.emitAsync(eventType, payload, source);
  }

  async publish<T>(eventType: string, payload: T, source?: string): Promise<void> {
    await this.checkAutoRecovery();

    let trackAFailed = false;
    if (this.currentTrack === 'A') {
      try {
        await this.rustAdapter.publish(eventType, payload, source);
      } catch (err: any) {
        console.warn(
          `[Dual-Track] Rust EventBus publish 失败，降级至 JS 本轨。原因: ${err.message}`
        );
        this.currentTrack = 'B';
        this.lastFailureTime = Date.now();
        trackAFailed = true;
      }

      if (!trackAFailed) {
        await this.nodeFallback.publish(eventType, payload, source);
        return;
      }
    }

    await this.nodeFallback.publish(eventType, payload, source);
  }

  on<T>(eventType: string, handler: any, options?: any): void {
    this.nodeFallback.on(eventType, handler, options);
  }

  once<T>(eventType: string, handler: any, options?: any): void {
    this.nodeFallback.once(eventType, handler, options);
  }

  off<T>(eventType: string, handler: any): void {
    this.nodeFallback.off(eventType, handler);
  }

  offAll(eventType?: string): void {
    this.nodeFallback.offAll(eventType);
  }

  connect(): void {
    this.nodeFallback.connect();
  }

  disconnect(): void {
    this.nodeFallback.disconnect();
  }

  isReady(): boolean {
    return this.nodeFallback.isReady();
  }
}
