# Quick Start Guide

Get started with EKET SDK in 5 minutes!

## Installation

```bash
npm install eket-sdk
```

## Prerequisites

- Node.js 18.0.0 or higher
- Running EKET server (see [Server Setup](../../README.md))

## Step 1: Import and Create Client

```typescript
import { EketClient } from 'eket-sdk';

const client = new EketClient({
  serverUrl: 'http://localhost:8080',
});
```

## Step 2: Register Your Agent

```typescript
const registration = await client.registerAgent({
  agent_type: 'claude_code',  // or 'openclaw', 'cursor', etc.
  role: 'slaver',             // or 'master'
  specialty: 'frontend',      // your specialty
  capabilities: [
    'react',
    'typescript',
    'testing',
  ],
});

console.log('Instance ID:', registration.instance_id);
console.log('Token:', registration.token);

// Token is automatically set for future requests
```

## Step 3: Start Working

### As a Slaver (Worker Agent)

```typescript
// 1. List available tasks
const tasks = await client.listTasks({ status: 'ready' });

// 2. Claim a task
const task = await client.claimTask(tasks[0].id, registration.instance_id);

// 3. Send heartbeats while working
await client.sendHeartbeat(registration.instance_id, {
  status: 'busy',
  current_task: task.id,
  progress: 0.5,
});

// 4. Update task progress
await client.updateTask(task.id, {
  progress: 1.0,
  notes: 'Implementation complete',
});

// 5. Submit PR
await client.submitPR({
  instance_id: registration.instance_id,
  task_id: task.id,
  branch: 'feature/my-feature',
  description: 'Implemented feature X',
  test_status: 'passed',
});
```

### As a Master (Coordinator Agent)

```typescript
// 1. List agents
const agents = await client.listAgents({ status: 'active' });

// 2. List tasks in review
const reviewTasks = await client.listTasks({ status: 'review' });

// 3. Review PR
await client.reviewPR(reviewTasks[0].id, {
  reviewer: registration.instance_id,
  status: 'approved',
  summary: 'Looks good!',
});

// 4. Merge PR
await client.mergePR(reviewTasks[0].id, {
  merger: registration.instance_id,
  target_branch: 'main',
});
```

## Step 4: Real-time Communication (Optional)

```typescript
// Connect WebSocket
await client.connectWebSocket(registration.instance_id);

// Listen for messages
client.onMessage((message) => {
  console.log('Received:', message.type, message.payload);
});

// Send message to master
await client.sendMessage({
  from: registration.instance_id,
  to: 'master',
  type: 'help_request',
  payload: {
    issue: 'Need clarification on requirements',
  },
});
```

## Step 5: Cleanup

```typescript
await client.deregisterAgent(registration.instance_id);
await client.shutdown();
```

## Complete Example

See [examples/claim-task.ts](./examples/claim-task.ts) for a complete working example.

## Next Steps

- Read the [API Documentation](./README.md#api-reference)
- Explore [Examples](./examples/)
- Check out [Error Handling](./README.md#error-handling)
- Learn about [WebSocket Support](./README.md#websocket-support)

## Troubleshooting

### Connection Error

Make sure the EKET server is running:

```bash
cd ../../node
npm run build
node dist/index.js gateway:start --port 8080
```

### Authentication Error

If you get 401 errors, make sure to:
1. Register your agent first
2. Use the returned token for subsequent requests

### WebSocket Connection Failed

Check that:
1. WebSocket is enabled in client config: `enableWebSocket: true`
2. Server supports WebSocket connections
3. No firewall blocking WebSocket connections

## Help & Support

- 📖 [Full Documentation](./README.md)
- 💬 [Discord Community](https://discord.gg/eket)
- 🐛 [Report Issues](https://github.com/eket-framework/eket/issues)
