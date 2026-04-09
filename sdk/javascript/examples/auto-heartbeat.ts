/**
 * Example: Auto Heartbeat
 *
 * This example demonstrates how to maintain a regular heartbeat
 * with the EKET server to keep the agent's status alive.
 *
 * Run: npx ts-node sdk/javascript/examples/auto-heartbeat.ts
 */

import { EketClient } from '../src/index.js';

const SERVER_URL = process.env.EKET_SERVER_URL ?? 'http://localhost:8080';
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const RUN_DURATION_MS = 120_000;      // 2 minutes

async function main() {
  const client = new EketClient({ serverUrl: SERVER_URL });

  // Step 1: Register agent
  console.log('Registering agent...');
  const { instance_id, heartbeat_interval } = await client.registerAgent({
    agent_type: 'custom',
    role: 'slaver',
    specialty: 'backend',
    capabilities: ['typescript', 'node'],
  });
  console.log(`✓ Registered: ${instance_id}`);
  console.log(`  Server-recommended heartbeat interval: ${heartbeat_interval}s`);

  // Step 2: Send heartbeats at regular intervals
  console.log(`\nStarting heartbeat loop (every ${HEARTBEAT_INTERVAL_MS / 1000}s)...`);

  let beatCount = 0;

  const interval = setInterval(async () => {
    try {
      beatCount += 1;
      const result = await client.sendHeartbeat(instance_id, {
        status: 'idle',
        current_task: undefined,
        progress: 0,
      });

      console.log(`[${new Date().toISOString()}] ✓ Heartbeat #${beatCount} sent`);
      console.log(`  Server time: ${result.server_time}`);

      // Check for pending messages
      if (result.messages.length > 0) {
        console.log(`  📧 ${result.messages.length} pending message(s):`);
        for (const msg of result.messages) {
          console.log(`    - [${msg.type}] from ${msg.from}`);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${new Date().toISOString()}] ✗ Heartbeat failed: ${message}`);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Step 3: Stop after RUN_DURATION_MS
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, RUN_DURATION_MS);
  });

  console.log(`\nStopping after ${beatCount} heartbeat(s)...`);

  // Step 4: Deregister and shutdown
  await client.deregisterAgent(instance_id);
  await client.shutdown();
  console.log('✓ Agent deregistered. Goodbye!');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('❌ Fatal error:', message);
  process.exit(1);
});
