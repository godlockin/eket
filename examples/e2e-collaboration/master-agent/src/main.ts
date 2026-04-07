#!/usr/bin/env node
/**
 * EKET Master Agent - E2E Collaboration Demo
 *
 * This Master Agent demonstrates:
 * - Agent registration
 * - Task creation
 * - WebSocket communication
 * - PR review and merge
 * - Automatic heartbeat
 */

import { EketClient } from 'eket-sdk';

const SERVER_URL = process.env.EKET_SERVER_URL || 'http://localhost:8080';
const TASK_ID = 'FEAT-001';

async function main() {
  console.log('=== EKET Master Agent Demo ===\n');

  // Initialize client
  const client = new EketClient({
    serverUrl: SERVER_URL,
    autoReconnect: true,
  });

  console.log('🚀 Starting Master Agent...');

  try {
    // 1. Register as Master
    console.log('📝 Registering as Master...');
    const agent = await client.registerAgent({
      agent_type: 'claude_code',
      role: 'master',
      capabilities: ['task_management', 'code_review', 'pr_merge'],
      metadata: {
        demo: 'e2e-collaboration',
        language: 'typescript',
      },
    });

    console.log(`✅ Registered as ${agent.instance_id}`);
    console.log(`   Token: ${client.token?.substring(0, 20)}...`);

    // 2. Connect WebSocket for real-time messages
    console.log('\n🔌 Connecting WebSocket...');
    await client.connectWebSocket();
    console.log('✅ WebSocket connected');

    // Set up message handler
    client.onMessage((message) => {
      console.log(`\n📬 Received message:`);
      console.log(`   From: ${message.from_instance_id}`);
      console.log(`   Type: ${message.type}`);
      console.log(`   Payload:`, JSON.stringify(message.payload, null, 2));

      // Handle PR review request
      if (message.type === 'pr_review_request') {
        handlePRReview(client, message.payload);
      }
    });

    // 3. Create a sample task
    console.log('\n📋 Creating task...');
    // Note: In real scenario, tasks would be created via API
    // For demo, we assume task exists or create it manually
    console.log(`   Task ID: ${TASK_ID}`);
    console.log('   Description: Implement user login functionality');
    console.log('   Status: ready');
    console.log('✅ Task created (simulated)');

    // 4. Start heartbeat
    console.log('\n💓 Starting heartbeat (every 30s)...');
    const heartbeatInterval = setInterval(async () => {
      try {
        await client.sendHeartbeat(agent.instance_id, {
          status: 'active',
          current_task: TASK_ID,
        });
        console.log(`💓 Heartbeat sent (${new Date().toLocaleTimeString()})`);
      } catch (error) {
        console.error('❌ Heartbeat failed:', error);
      }
    }, 30000);

    // 5. Wait for messages
    console.log('\n👂 Listening for messages...');
    console.log('   (Waiting for Slaver to claim and complete task)\n');

    // Keep process alive
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down...');
      clearInterval(heartbeatInterval);

      try {
        await client.deregisterAgent(agent.instance_id);
        console.log('✅ Deregistered successfully');
      } catch (error) {
        console.error('❌ Deregistration failed:', error);
      }

      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

async function handlePRReview(client: EketClient, payload: any) {
  const { pr_id, task_id, branch, description } = payload;

  console.log(`\n🔍 Reviewing PR ${pr_id}...`);
  console.log(`   Task: ${task_id}`);
  console.log(`   Branch: ${branch}`);
  console.log(`   Description: ${description}`);

  try {
    // Simulate review process
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Approve PR
    console.log('✅ PR looks good! Approving...');
    await client.reviewPR(pr_id, {
      status: 'approved',
      reviewer_id: client.token!, // Use current agent's token/ID
      comments: ['LGTM! Code looks clean and follows standards.'],
    });

    // Merge PR
    console.log('🔀 Merging PR...');
    const mergeResult = await client.mergePR(pr_id, {
      merge_method: 'squash',
      delete_branch: true,
    });

    console.log('✅ PR merged successfully!');
    console.log(`   Commit: ${mergeResult.commit_sha || 'N/A'}`);

    // Send completion message
    console.log('📨 Notifying Slaver of merge completion...');
    // Note: In real scenario, this would be sent via message API

    console.log('\n🎉 Task completed! Demo finished successfully.');

  } catch (error) {
    console.error('❌ PR review/merge failed:', error);
  }
}

// Run the demo
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
