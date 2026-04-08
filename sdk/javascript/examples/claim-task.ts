/**
 * Example: Claim and Work on a Task
 *
 * This example demonstrates the complete task workflow:
 * 1. Register as a slaver agent
 * 2. List available tasks
 * 3. Claim a task
 * 4. Send heartbeats while working
 * 5. Update task progress
 * 6. Complete the task
 */

import { EketClient, sleep } from '../src/index.js';

async function main() {
  const client = new EketClient({
    serverUrl: 'http://localhost:8080',
  });

  try {
    // Step 1: Register agent
    console.log('Step 1: Registering agent...');
    const { instance_id, token } = await client.registerAgent({
      agent_type: 'claude_code',
      role: 'slaver',
      specialty: 'backend',
      capabilities: ['nodejs', 'typescript', 'postgresql'],
    });
    console.log('✓ Registered as:', instance_id);

    // Step 2: List available tasks
    console.log('\nStep 2: Listing available tasks...');
    const availableTasks = await client.listTasks({
      status: 'ready',
    });
    console.log(`✓ Found ${availableTasks.length} available tasks`);

    if (availableTasks.length === 0) {
      console.log('ℹ No tasks available. Exiting...');
      await client.deregisterAgent(instance_id);
      return;
    }

    // Pick the first task
    const task = availableTasks[0];
    console.log(`  Selected task: ${task.id} - ${task.title}`);

    // Step 3: Claim the task
    console.log('\nStep 3: Claiming task...');
    const claimedTask = await client.claimTask(task.id, instance_id);
    console.log('✓ Task claimed:', claimedTask.id);
    console.log('  Status:', claimedTask.status);
    console.log('  Assigned to:', claimedTask.assigned_to);

    // Step 4: Send heartbeats while working
    console.log('\nStep 4: Working on task...');
    const workSteps = [
      { progress: 0.25, notes: 'Started implementation' },
      { progress: 0.5, notes: 'Core logic complete' },
      { progress: 0.75, notes: 'Writing tests' },
      { progress: 1.0, notes: 'Testing complete' },
    ];

    for (const step of workSteps) {
      console.log(`  Progress: ${step.progress * 100}% - ${step.notes}`);

      // Send heartbeat
      const heartbeat = await client.sendHeartbeat(instance_id, {
        status: 'busy',
        current_task: task.id,
        progress: step.progress,
      });

      // Check for new messages
      if (heartbeat.messages.length > 0) {
        console.log(`  📧 Received ${heartbeat.messages.length} messages`);
        heartbeat.messages.forEach((msg) => {
          console.log(`    - ${msg.type} from ${msg.from}`);
        });
      }

      // Update task
      await client.updateTask(task.id, {
        progress: step.progress,
        notes: step.notes,
      });

      // Simulate work
      await sleep(1000);
    }

    // Step 5: Mark task as ready for review
    console.log('\nStep 5: Submitting for review...');
    await client.updateTask(task.id, {
      status: 'review',
      progress: 1.0,
      notes: 'Implementation complete, ready for review',
    });
    console.log('✓ Task submitted for review');

    // Step 6: Submit PR
    console.log('\nStep 6: Submitting pull request...');
    const prId = await client.submitPR({
      instance_id,
      task_id: task.id,
      branch: `feature/${task.id}`,
      description: `Implemented ${task.title}`,
      test_status: 'passed',
    });
    console.log('✓ PR submitted:', prId);

    // Send message to master
    console.log('\nStep 7: Notifying master...');
    await client.sendMessage({
      from: instance_id,
      to: 'master',
      type: 'pr_review_request',
      priority: 'normal',
      payload: {
        task_id: task.id,
        branch: `feature/${task.id}`,
        description: `Please review ${task.title}`,
      },
    });
    console.log('✓ Master notified');

    // Cleanup
    console.log('\nCleaning up...');
    await client.sendHeartbeat(instance_id, { status: 'idle' });
    await client.deregisterAgent(instance_id);
    console.log('✓ Agent deregistered');

    console.log('\n✅ Task workflow completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
