# Formal Negative Audit Report: TASK-Z03 (Node.js Dual-Track Fallback Engine)

**Audit Phase**: Blue Team / Chaos Auditor Review  
**Auditor**: Negative Auditor Agent (Chaos & Security)  
**Target Ticket**: TASK-Z03  
**Target Files**: 
- `node/src/core/dual-track-router.ts`
- `node/tests/dual-track-router.test.ts`
**Audit Date**: 2026-05-24  
**Status**: Critical Flaws Identified — HARDENING REQUIRED BEFORE PRODUCTION

---

## 1. Executive Summary

While the implementation of `TASK-Z03` succeeds in providing basic dual-track switching under clean single-threaded test environments, a **rigorous red-team analysis and architectural stress-test** reveals multiple **critical vulnerabilities, race conditions, and logical bugs**. 

Under high-frequency production load or unexpected dependency failures, the current implementation will lead to:
1. **TCP Socket Leakage and FD Exhaustion**: Causing application crashes (`EMFILE`) within minutes of high-frequency operation on Track A.
2. **Severe Local Handler Double-Execution**: An architectural bug in the try-catch block causing local JS events to run twice if a JS subscriber throws an exception.
3. **Thundering Herd Latency Spikes**: Lack of serialization or locks on track transitions, causing severe thread-pool starvation when Track A goes down.
4. **Permanent Downgrade Starvation**: Dynamic fallback is a "one-way street" with no auto-recovery or health polling mechanism.

---

## 2. Adversarial Chaos Simulations & Red-Team Attack Vectors

### 🚨 Vector A: TCP Socket Leak & FD Exhaustion (Unconsumed Fetch Bodies)
* **Mechanics**: In Node.js (undici-backed `fetch`), if you invoke `fetch()` but do not consume the response body (via `.json()`, `.text()`, `.arrayBuffer()`) or cancel it (`resp.body?.cancel()`), the underlying TCP socket is kept alive and suspended in the connection pool.
* **Target Lines**: `RustEventBusAdapter.publish` ([L146-158](file:///Users/chenchen/working/sourcecode/tools/dev-tools/eket/node/src/core/dual-track-router.ts#L146-L158)) and `detectRustEnvironment` ([L27-51](file:///Users/chenchen/working/sourcecode/tools/dev-tools/eket/node/src/core/dual-track-router.ts#L27-L51)).
* **Chaos Impact**: Under a standard workload of 5,000 events/sec, Track A will exhaust the system's File Descriptor limits within seconds. The system will throw `Error: EMFILE, too many open files` and crash completely, violating the "100% no-crash fallback" goal.

### 🚨 Vector B: Local JS Handler Error Cascading (Double-Execution Bug)
* **Mechanics**: The try-catch block in `emit`, `emitAsync`, and `publish` wraps *both* the Rust publisher and the local fallback emitter.
  ```typescript
  // File: node/src/core/dual-track-router.ts
  async publish<T>(eventType: string, payload: T, source?: string): Promise<void> {
    if (this.currentTrack === 'A') {
      try {
        await this.rustAdapter.publish(eventType, payload, source);
        await this.nodeFallback.publish(eventType, payload, source); // <--- IF THIS THROWS
        return;
      } catch (err: any) {
        console.warn(`...`);
        this.currentTrack = 'B';
      }
    }
    await this.nodeFallback.publish(eventType, payload, source); // <--- IT RUNS AGAIN!
  }
  ```
* **Chaos Impact**: If a JS handler registered to `nodeFallback` throws a legitimate runtime error (e.g., database constraint failure or null pointer):
  1. The Rust publish succeeds.
  2. The local `nodeFallback.publish` is called and throws.
  3. The `catch` block intercepts it, **falsely blames the Rust core**, prints a warning, and switches the track to `'B'`.
  4. The code then calls `nodeFallback.publish` **a second time**.
  5. The local handler executes again, repeating side-effects, wasting CPU, and polluting logs.

### 🚨 Vector C: Thundering Herd Latency Spike (Lack of State Locking)
* **Mechanics**: There is no synchronization or lock on the track-switching state. 
* **Target Lines**: `DualTrackElection.tryElect` ([L120-132](file:///Users/chenchen/working/sourcecode/tools/dev-tools/eket/node/src/core/dual-track-router.ts#L120-L132)) and event bus wrappers.
* **Chaos Impact**: If the Rust HTTP daemon hangs or experiences latency spikes, and 1,000 requests are fired concurrently:
  1. All 1,000 requests see `currentTrack === 'A'`.
  2. All 1,000 requests concurrently hit the Rust server.
  3. Every single request blocks for `500ms` (the timeout limit), starving the Node.js event loop and network thread pool.
  4. After 500ms, 1,000 timeouts fire, printing 1,000 duplicate console warnings (which blocks Node's synchronous stdout pipe and spikes CPU to 100%).
  5. All 1,000 then trigger a redundant fallback execution.

### 🚨 Vector D: Permanent Downgrade Starvation (No Auto-Recovery)
* **Mechanics**: Once a single transient network glitch occurs, `currentTrack` is set to `'B'` permanently.
* **Chaos Impact**: A 100ms backend hiccup permanently degrades the entire system to Track B, missing out on Rust's high-performance capability forever until a manual process restart occurs.

---

## 3. Deep-Dive Vulnerability Matrix

| Vulnerability ID | Target File / Line | Severity | Flaw Description | Business & Runtime Impact |
| :--- | :--- | :--- | :--- | :--- |
| **VULN-001** | `dual-track-router.ts`<br>[L146-158](file:///Users/chenchen/working/sourcecode/tools/dev-tools/eket/node/src/core/dual-track-router.ts#L146-L158) | **CRITICAL** | Undici fetch response body unconsumed on success and error status codes. | Rapid Socket leak, Memory growth, File Descriptor exhaustion, and eventual process crash (`EMFILE`). |
| **VULN-002** | `dual-track-router.ts`<br>[L182-230](file:///Users/chenchen/working/sourcecode/tools/dev-tools/eket/node/src/core/dual-track-router.ts#L182-L230) | **HIGH** | Over-broad try-catch blocks wrap both Track A and Track B execution. | JS handler exceptions trigger false Track A downgrades and execute the same event listener a second time. |
| **VULN-003** | `dual-track-router.ts`<br>[L120-132](file:///Users/chenchen/working/sourcecode/tools/dev-tools/eket/node/src/core/dual-track-router.ts#L120-L132) | **HIGH** | Missing execution mutex / circuit breaker on dynamic downgrade track transitions. | Concurrent request storms trigger thundering herds, extreme latency spikes, and synchronous standard I/O log blocking. |
| **VULN-004** | `dual-track-router.ts`<br>[L102-133](file:///Users/chenchen/working/sourcecode/tools/dev-tools/eket/node/src/core/dual-track-router.ts#L102-L133) | **MEDIUM** | Absence of background health-probing or automatic recovery. | Permanent fallback. Transient network issues permanently starve the high-performance track. |
| **VULN-005** | `dual-track-router.ts`<br>[L80](file:///Users/chenchen/working/sourcecode/tools/dev-tools/eket/node/src/core/dual-track-router.ts#L80) | **LOW** | Direct `.json()` parsing on untrusted response headers. | If Rust returns HTML (e.g. from Nginx/Ingress 502 error), `json()` fails, which is caught, but large payloads block the event loop. |

---

## 4. Hardening Recommendations (Code Blueprints)

To secure and bulletproof the dual-track engine, we recommend implementing the following blueprints:

### Blueprint 4.1: Socket Leak Fix
Ensure `fetch` responses are always consumed or cancelled safely:
```typescript
async publish(eventType: string, payload: any, source?: string): Promise<void> {
  const resp = await fetch(`${this.apiUrl}/api/v1/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: eventType, payload, source }),
    signal: AbortSignal.timeout(500),
  });

  try {
    if (!resp.ok) {
      throw new Error(`Rust server event publish returned status ${resp.status}`);
    }
  } finally {
    // Cancel or consume response body to release the socket back to the undici pool
    if (resp.body) {
      await resp.body.cancel().catch(() => {});
    }
  }
}
```

### Blueprint 4.2: Isolated Try-Catch to Prevent Double-Execution
Strictly separate Rust publishing failures from JS local subscriber failures:
```typescript
async publish<T>(eventType: string, payload: T, source?: string): Promise<void> {
  let trackAFailed = false;

  if (this.currentTrack === 'A') {
    try {
      await this.rustAdapter.publish(eventType, payload, source);
    } catch (err: any) {
      console.warn(
        `[Dual-Track] Rust EventBus publish 失败，降级至 JS 本轨。原因: ${err.message}`
      );
      this.currentTrack = 'B';
      trackAFailed = true;
    }

    if (!trackAFailed) {
      // If Rust succeeded, run JS listeners. If JS listeners throw, let it propagate naturally!
      // Do NOT catch it as a Track A failure.
      await this.nodeFallback.publish(eventType, payload, source);
      return;
    }
  }

  // If we got here, Track A either failed or was already downgraded.
  await this.nodeFallback.publish(eventType, payload, source);
}
```

### Blueprint 4.3: Circuit Breaker & Thundering Herd Guard
Use a state flag (`isSwitchingOrDegraded`) to immediately bypass Track A for all concurrent in-flight requests once a failure starts, or lock the transition:
```typescript
export class DualTrackElection implements IMasterElection {
  private currentTrack: 'A' | 'B' = 'A';
  private lastFailureTime = 0;
  private cooldownMs = 30000; // 30 seconds cooldown before retrying Track A

  async tryElect(): Promise<boolean> {
    const now = Date.now();
    if (this.currentTrack === 'B' && now - this.lastFailureTime > this.cooldownMs) {
      // Proactive Auto-Recovery Check: Attempt to probe Track A again
      const diagnostics = await detectRustEnvironment(this.rustAdapter.getApiUrl());
      if (diagnostics.available) {
        console.info(`[Dual-Track] Rust Core is healthy again, recovering to Track A.`);
        this.currentTrack = 'A';
      } else {
        this.lastFailureTime = now; // Reset cooldown to prevent spamming health checks
      }
    }

    if (this.currentTrack === 'A') {
      try {
        return await this.rustAdapter.tryElect();
      } catch (err: any) {
        console.warn(
          `[Dual-Track] Rust Core unavailable, switching immediately to Track B. Reason: ${err.message}`
        );
        this.currentTrack = 'B';
        this.lastFailureTime = now;
      }
    }
    return await this.nodeFallback.tryElect();
  }
}
```

---

## 5. Hardened Test Plan Additions

To ensure these issues are never reintroduced, add the following assertions to `node/tests/dual-track-router.test.ts`:

1. **JS Local Listener Exception Isolation Test**: Verify that if `nodeFallback` throws an exception, the system **does not** trigger a downgrade to Track B, and the exception propagates exactly once without double-execution.
2. **Concurrent Request Race Test**: Simulate 100 concurrent emissions during a Rust crash. Verify that `fetch` is only called once or at most a limited number of times, and that total latency does not stack up or block.
3. **Socket Cleanup Verification Test**: Ensure that mocks of `fetch` return responses with bodies, and spy on `body.cancel` to confirm it is called.

---

### Conclusion & Master Sign-Off Request
This negative audit identifies **significant runtime resilience risks** in the fallback engine. Resolving **VULN-001** and **VULN-002** is highly recommended before merging this branch to `testing` and `main` branches.

*Report filed in Confluence by Chaos Auditor Blue Team.*
