/**
 * Example: PR Review and Merge (Master Role)
 *
 * This example demonstrates the master workflow:
 * 1. Register as master
 * 2. Connect to WebSocket for real-time notifications
 * 3. List agents and tasks
 * 4. Review a pull request
 * 5. Merge approved PR
 */

import { EketClient, Message } from '../src/index.js';

async function main() {
  const client = new EketClient({
    serverUrl: 'http://localhost:8080',
    enableWebSocket: true,
  });

  try {
    // Step 1: Register as master
    console.log('Step 1: Registering as master...');
    const { instance_id } = await client.registerAgent({
      agent_type: 'claude_code',
      role: 'master',
      capabilities: ['code_review', 'architecture', 'coordination'],
    });
    console.log('✓ Registered as master:', instance_id);

    // Step 2: Connect WebSocket for real-time notifications
    console.log('\nStep 2: Connecting to WebSocket...');
    await client.connectWebSocket(instance_id);
    console.log('✓ WebSocket connected');

    // Set up message handler
    client.onMessage((message: Message) => {
      console.log(`\n📧 Received message: ${message.type} from ${message.from}`);
      if (message.type === 'pr_review_request') {
        const { task_id, description } = message.payload as any;
        console.log(`  PR review requested for task: ${task_id}`);
        console.log(`  Description: ${description}`);
      }
    });

    // Step 3: List agents and tasks
    console.log('\nStep 3: Checking system status...');
    const agents = await client.listAgents({ status: 'active' });
    console.log(`✓ Active agents: ${agents.length}`);
    agents.forEach((agent) => {
      console.log(`  - ${agent.instance_id} (${agent.role}/${agent.specialty})`);
    });

    const reviewTasks = await client.listTasks({ status: 'review' });
    console.log(`\n✓ Tasks in review: ${reviewTasks.length}`);

    if (reviewTasks.length === 0) {
      console.log('ℹ No tasks to review. Exiting...');
      await client.shutdown();
      return;
    }

    // Step 4: Review a PR
    const taskToReview = reviewTasks[0];
    console.log(`\nStep 4: Reviewing PR for task: ${taskToReview.id}`);
    console.log(`  Title: ${taskToReview.title}`);
    console.log(`  Assigned to: ${taskToReview.assigned_to}`);

    // Fetch task details
    const task = await client.getTask(taskToReview.id);
    console.log('  Description:', task.description);

    // Submit review
    console.log('\n  Submitting review...');
    await client.reviewPR(task.id, {
      reviewer: instance_id,
      status: 'approved',
      comments: [
        {
          file: 'src/main.ts',
          line: 42,
          comment: 'Great implementation!',
        },
      ],
      summary: 'Code looks good. Approving for merge.',
    });
    console.log('  ✓ Review submitted: APPROVED');

    // Step 5: Merge PR
    console.log('\nStep 5: Merging PR...');
    const mergeResult = await client.mergePR(task.id, {
      merger: instance_id,
      target_branch: 'main',
      squash: false,
    });
    console.log('✓ PR merged successfully');
    console.log('  Merge commit:', mergeResult.merge_commit);
    console.log('  Merged at:', mergeResult.merged_at);

    // Update task to done
    console.log('\nStep 6: Marking task as done...');
    await client.updateTask(task.id, {
      status: 'done',
    });
    console.log('✓ Task marked as done');

    // Send notification to assignee
    if (task.assigned_to) {
      console.log('\nStep 7: Notifying assignee...');
      await client.sendMessage({
        from: instance_id,
        to: task.assigned_to,
        type: 'pr_approved',
        priority: 'normal',
        payload: {
          task_id: task.id,
          message: `Your PR for ${task.title} has been approved and merged!`,
          merge_commit: mergeResult.merge_commit,
        },
      });
      console.log('✓ Assignee notified');
    }

    // Keep connection alive for a bit to receive any messages
    console.log('\nListening for messages (5 seconds)...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Cleanup
    console.log('\nCleaning up...');
    await client.shutdown();
    console.log('✓ Shutdown complete');

    console.log('\n✅ PR review and merge workflow completed!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
