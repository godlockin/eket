/**
 * Example: Complete Workflow
 *
 * Demonstrates the full Slaver lifecycle:
 *   1. Register as a slaver agent
 *   2. Claim an available task
 *   3. Maintain heartbeats while working
 *   4. Submit a pull request
 *   5. Notify master and clean up
 *
 * Run: npx ts-node sdk/javascript/examples/complete-workflow.ts
 */

import { EketClient, sleep } from '../src/index.js';

const SERVER_URL = process.env.EKET_SERVER_URL ?? 'http://localhost:8080';

async function main() {
  const client = new EketClient({ serverUrl: SERVER_URL });

  // ── Step 1: Register ──────────────────────────────────────────────────────
  console.log('Step 1: Registering slaver agent...');
  const { instance_id } = await client.registerAgent({
    agent_type: 'claude_code',
    agent_version: '1.0.0',
    role: 'slaver',
    specialty: 'fullstack',
    capabilities: ['typescript', 'react', 'nodejs', 'testing'],
    metadata: { user: 'developer', machine: process.env.HOSTNAME ?? 'local' },
  });
  console.log(`✓ Registered: ${instance_id}`);

  // ── Step 2: Find and claim a task ─────────────────────────────────────────
  console.log('\nStep 2: Looking for available tasks...');
  const available = await client.listTasks({ status: 'ready' });
  console.log(`  Found ${available.length} task(s)`);

  if (available.length === 0) {
    console.log('ℹ No ready tasks — exiting.');
    await client.deregisterAgent(instance_id);
    return;
  }

  const selected = available[0];
  console.log(`  Selecting: [${selected.id}] ${selected.title}`);

  console.log('\nStep 3: Claiming task...');
  const claimed = await client.claimTask(selected.id, instance_id);
  console.log(`✓ Claimed: ${claimed.id} (status=${claimed.status})`);

  // ── Step 3: Work with heartbeats ─────────────────────────────────────────
  console.log('\nStep 4: Working on task (with heartbeats)...');

  const workPhases: Array<{ label: string; progress: number }> = [
    { label: 'Analysing requirements', progress: 0.1 },
    { label: 'Scaffolding code',       progress: 0.3 },
    { label: 'Core implementation',    progress: 0.6 },
    { label: 'Writing tests',          progress: 0.85 },
    { label: 'Final review',           progress: 1.0 },
  ];

  for (const phase of workPhases) {
    console.log(`  [${Math.round(phase.progress * 100)}%] ${phase.label}`);

    // Send heartbeat so the server knows we're alive
    const hb = await client.sendHeartbeat(instance_id, {
      status: 'busy',
      current_task: claimed.id,
      progress: phase.progress,
    });

    if (hb.messages.length > 0) {
      console.log(`  📧 ${hb.messages.length} pending message(s) from server`);
    }

    // Update task progress in the tracker
    await client.updateTask(claimed.id, {
      progress: phase.progress,
      notes: phase.label,
    });

    await sleep(500); // simulate work
  }

  // ── Step 4: Mark ready for review ────────────────────────────────────────
  console.log('\nStep 5: Marking task as "review"...');
  await client.updateTask(claimed.id, { status: 'review', progress: 1.0 });
  console.log('✓ Task status → review');

  // ── Step 5: Submit PR ─────────────────────────────────────────────────────
  console.log('\nStep 6: Submitting pull request...');
  const prId = await client.submitPR({
    instance_id,
    task_id: claimed.id,
    branch: `feature/${claimed.id.toLowerCase()}-implementation`,
    description: `Implements ${claimed.title}.\n\n- All acceptance criteria met\n- Tests passing`,
    test_status: 'passed',
  });
  console.log(`✓ PR submitted: ${prId}`);

  // ── Step 6: Notify master ─────────────────────────────────────────────────
  console.log('\nStep 7: Notifying master for review...');
  await client.sendMessage({
    from: instance_id,
    to: 'master',
    type: 'pr_review_request',
    priority: 'normal',
    payload: {
      task_id: claimed.id,
      branch: `feature/${claimed.id.toLowerCase()}-implementation`,
      pr_id: prId,
      description: `Please review: ${claimed.title}`,
    },
  });
  console.log('✓ Master notified');

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log('\nStep 8: Cleaning up...');
  await client.sendHeartbeat(instance_id, { status: 'idle' });
  await client.deregisterAgent(instance_id);
  await client.shutdown();
  console.log('✓ Agent deregistered');

  console.log('\n✅ Complete workflow finished!');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('❌ Fatal error:', message);
  process.exit(1);
});
