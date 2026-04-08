/**
 * Example: Register an Agent
 *
 * This example demonstrates how to register a new AI agent with the EKET server.
 */

import { EketClient } from '../src/index.js';

async function main() {
  // Create client
  const client = new EketClient({
    serverUrl: 'http://localhost:8080',
    timeout: 30000,
  });

  try {
    // Check server health
    console.log('Checking server health...');
    const health = await client.healthCheck();
    console.log('✓ Server is healthy:', health);

    // Register agent
    console.log('\nRegistering agent...');
    const registration = await client.registerAgent({
      agent_type: 'claude_code',
      agent_version: '1.0.0',
      role: 'slaver',
      specialty: 'frontend',
      capabilities: ['react', 'typescript', 'css', 'testing'],
      metadata: {
        user: 'developer',
        machine: 'macbook-pro',
        timezone: 'America/Los_Angeles',
      },
    });

    console.log('✓ Agent registered successfully!');
    console.log('  Instance ID:', registration.instance_id);
    console.log('  Server URL:', registration.server_url);
    console.log('  WebSocket URL:', registration.websocket_url);
    console.log('  Heartbeat Interval:', registration.heartbeat_interval, 'seconds');
    console.log('  Token:', registration.token.substring(0, 20) + '...');

    // Token is automatically set in the client
    console.log('\n✓ Token automatically configured for future requests');

    // Get agent details
    console.log('\nFetching agent details...');
    const agent = await client.getAgent(registration.instance_id);
    console.log('✓ Agent details:', {
      instance_id: agent.instance_id,
      role: agent.role,
      specialty: agent.specialty,
      status: agent.status,
      registered_at: agent.registered_at,
    });

    // Cleanup
    console.log('\nDeregistering agent...');
    await client.deregisterAgent(registration.instance_id);
    console.log('✓ Agent deregistered');

    console.log('\n✅ Registration example completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
