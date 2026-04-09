/**
 * Example: Error Handling
 *
 * Demonstrates how to catch and handle the different error types thrown
 * by the EKET SDK:
 *
 *   - ValidationError   — bad input / missing required fields
 *   - AuthenticationError — invalid or expired JWT
 *   - NotFoundError     — resource (task/agent) does not exist
 *   - ConflictError     — task already claimed by another agent
 *   - NetworkError      — server unreachable or no response
 *   - EketError         — base class; catch-all for SDK errors
 *
 * Run: npx ts-node sdk/javascript/examples/error-handling.ts
 */

import {
  EketClient,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError,
  NetworkError,
  EketError,
} from '../src/index.js';

const SERVER_URL = process.env.EKET_SERVER_URL ?? 'http://localhost:8080';

// ── Helper: print a structured error summary ──────────────────────────────────
function reportError(label: string, err: unknown): void {
  if (err instanceof EketError) {
    console.error(`  [${err.name}] ${label}`);
    console.error(`    code   : ${err.code}`);
    console.error(`    message: ${err.message}`);
    if (err.details) {
      console.error(`    details: ${JSON.stringify(err.details)}`);
    }
  } else if (err instanceof Error) {
    console.error(`  [Error] ${label}: ${err.message}`);
  } else {
    console.error(`  [Unknown] ${label}: ${String(err)}`);
  }
}

// ── Scenario 1: ValidationError ───────────────────────────────────────────────
async function demoValidationError(client: EketClient): Promise<void> {
  console.log('\n[1] ValidationError — missing required fields');
  try {
    // agent_type and role are required; omitting them triggers a ValidationError
    await client.registerAgent({
      // @ts-expect-error intentionally omitting required fields for demo
      specialty: 'backend',
    });
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      reportError('Registration rejected due to missing fields', err);
      console.log('  ✓ Handled ValidationError correctly');
    } else {
      reportError('Unexpected error', err);
    }
  }
}

// ── Scenario 2: AuthenticationError ──────────────────────────────────────────
async function demoAuthError(): Promise<void> {
  console.log('\n[2] AuthenticationError — invalid JWT token');
  const badClient = new EketClient({
    serverUrl: SERVER_URL,
    jwtToken: 'invalid.jwt.token',
  });

  try {
    // Any authenticated endpoint will reject the bad token
    await badClient.listAgents();
  } catch (err: unknown) {
    if (err instanceof AuthenticationError) {
      reportError('Request rejected: bad token', err);
      console.log('  ✓ Handled AuthenticationError correctly');
    } else if (err instanceof NetworkError) {
      // Server might not be running — that's fine for the demo
      reportError('Server unreachable (expected in offline demo)', err);
    } else {
      reportError('Unexpected error', err);
    }
  } finally {
    await badClient.shutdown();
  }
}

// ── Scenario 3: NotFoundError ─────────────────────────────────────────────────
async function demoNotFoundError(client: EketClient): Promise<void> {
  console.log('\n[3] NotFoundError — task does not exist');
  try {
    await client.getTask('NONEXISTENT-9999');
  } catch (err: unknown) {
    if (err instanceof NotFoundError) {
      reportError('Task not found', err);
      console.log('  ✓ Handled NotFoundError correctly');
    } else if (err instanceof NetworkError) {
      reportError('Server unreachable (expected in offline demo)', err);
    } else {
      reportError('Unexpected error', err);
    }
  }
}

// ── Scenario 4: ConflictError ─────────────────────────────────────────────────
async function demoConflictError(client: EketClient, instanceId: string): Promise<void> {
  console.log('\n[4] ConflictError — task already claimed');
  try {
    // Attempting to claim the same task twice will produce a conflict
    const tasks = await client.listTasks({ status: 'ready' });
    if (tasks.length === 0) {
      console.log('  ℹ No ready tasks — skipping conflict demo');
      return;
    }

    const taskId = tasks[0].id;
    await client.claimTask(taskId, instanceId);  // first claim
    await client.claimTask(taskId, instanceId);  // second claim → conflict
  } catch (err: unknown) {
    if (err instanceof ConflictError) {
      reportError('Task already claimed', err);
      console.log('  ✓ Handled ConflictError correctly');
    } else if (err instanceof NetworkError) {
      reportError('Server unreachable (expected in offline demo)', err);
    } else {
      reportError('Unexpected error', err);
    }
  }
}

// ── Scenario 5: NetworkError ──────────────────────────────────────────────────
async function demoNetworkError(): Promise<void> {
  console.log('\n[5] NetworkError — server not reachable');
  const offlineClient = new EketClient({
    serverUrl: 'http://localhost:19999', // nothing listening here
    timeout: 2000,
  });

  try {
    await offlineClient.healthCheck();
  } catch (err: unknown) {
    if (err instanceof NetworkError) {
      reportError('Could not reach server', err);
      console.log('  ✓ Handled NetworkError correctly');
    } else {
      reportError('Unexpected error', err);
    }
  } finally {
    await offlineClient.shutdown();
  }
}

// ── Scenario 6: Generic EketError catch-all ───────────────────────────────────
async function demoGenericEketError(client: EketClient): Promise<void> {
  console.log('\n[6] EketError catch-all — unknown task update');
  try {
    // Updating a non-existent task may throw NotFoundError (subclass of EketError)
    await client.updateTask('GHOST-0000', { status: 'done' });
  } catch (err: unknown) {
    if (err instanceof EketError) {
      reportError(`SDK error (code=${err.code})`, err);
      console.log('  ✓ Caught via EketError base class');
    } else {
      reportError('Non-SDK error', err);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== EKET SDK — Error Handling Examples ===');

  const client = new EketClient({ serverUrl: SERVER_URL, timeout: 5000 });

  // Register a real agent so authenticated scenarios work (if server is up)
  let instanceId: string | undefined;
  try {
    const reg = await client.registerAgent({
      agent_type: 'custom',
      role: 'slaver',
      specialty: 'qa',
    });
    instanceId = reg.instance_id;
    console.log(`\nℹ Connected to server. Instance: ${instanceId}`);
  } catch {
    console.log('\nℹ Server not available — running in offline demo mode');
  }

  await demoValidationError(client);
  await demoAuthError();
  await demoNotFoundError(client);

  if (instanceId) {
    await demoConflictError(client, instanceId);
  }

  await demoNetworkError();
  await demoGenericEketError(client);

  // Cleanup
  if (instanceId) {
    try {
      await client.deregisterAgent(instanceId);
    } catch {
      // best effort
    }
  }
  await client.shutdown();

  console.log('\n✅ Error handling demo complete!');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('❌ Fatal error:', message);
  process.exit(1);
});
