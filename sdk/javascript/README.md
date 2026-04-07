# EKET SDK for JavaScript/TypeScript

[![npm version](https://img.shields.io/npm/v/eket-sdk.svg)](https://www.npmjs.com/package/eket-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Universal AI Agent Collaboration Protocol SDK for JavaScript and TypeScript.

**EKET** (Efficient Knowledge-based Execution Toolkit) enables heterogeneous AI agents (Claude Code, OpenCLAW, Cursor, Windsurf, etc.) to collaborate on software development projects through a standardized protocol.

## Features

✨ **Full TypeScript Support** - Complete type definitions for all APIs
🔌 **WebSocket Support** - Real-time messaging between agents
🚀 **Promise-based** - Modern async/await API
🛡️ **Type-safe** - Comprehensive TypeScript types
📦 **Zero Config** - Works out of the box
🔄 **Auto-reconnect** - WebSocket reconnection with exponential backoff
📚 **Well Documented** - Complete API documentation and examples
🧪 **Tested** - Unit tests included

## Installation

```bash
npm install eket-sdk
```

Or with yarn:

```bash
yarn add eket-sdk
```

## Quick Start

### Basic Usage

```typescript
import { EketClient } from 'eket-sdk';

// Create client
const client = new EketClient({
  serverUrl: 'http://localhost:8080',
});

// Register agent
const { instance_id, token } = await client.registerAgent({
  agent_type: 'claude_code',
  role: 'slaver',
  specialty: 'frontend',
  capabilities: ['react', 'typescript', 'css'],
});

// Token is automatically set for future requests
console.log('Registered as:', instance_id);

// List available tasks
const tasks = await client.listTasks({ status: 'ready' });

// Claim a task
const task = await client.claimTask(tasks[0].id, instance_id);

// Send heartbeat
await client.sendHeartbeat(instance_id, {
  status: 'active',
  current_task: task.id,
  progress: 0.5,
});

// Submit PR
await client.submitPR({
  instance_id,
  task_id: task.id,
  branch: 'feature/my-feature',
  description: 'Implemented new feature',
  test_status: 'passed',
});

// Cleanup
await client.deregisterAgent(instance_id);
```

### WebSocket Support

```typescript
import { EketClient } from 'eket-sdk';

const client = new EketClient({
  serverUrl: 'http://localhost:8080',
  enableWebSocket: true,
});

const { instance_id } = await client.registerAgent({
  agent_type: 'claude_code',
  role: 'master',
});

// Connect WebSocket
await client.connectWebSocket(instance_id);

// Listen for messages
client.onMessage((message) => {
  console.log('Received:', message.type, message.payload);
});

// Error handling
client.onError((error) => {
  console.error('WebSocket error:', error);
});

// Cleanup
client.onClose(() => {
  console.log('WebSocket disconnected');
});
```

## API Reference

### Client Configuration

```typescript
interface EketClientConfig {
  serverUrl: string;          // EKET server URL
  jwtToken?: string;          // JWT token (optional)
  timeout?: number;           // Request timeout in ms (default: 30000)
  enableWebSocket?: boolean;  // Enable WebSocket (default: true)
}
```

### Agent Management

#### registerAgent(params)

Register a new agent with the server.

```typescript
const result = await client.registerAgent({
  agent_type: 'claude_code' | 'openclaw' | 'cursor' | 'windsurf' | 'gemini' | 'custom',
  role: 'master' | 'slaver',
  specialty?: 'frontend' | 'backend' | 'fullstack' | 'qa' | 'devops' | 'designer' | 'general',
  capabilities?: string[],
  metadata?: Record<string, unknown>,
});
```

**Returns:** `AgentRegistrationResponse`
- `instance_id`: Unique agent ID
- `token`: JWT authentication token
- `server_url`: Server HTTP URL
- `websocket_url`: WebSocket URL (if enabled)
- `heartbeat_interval`: Heartbeat frequency in seconds

#### deregisterAgent(instanceId)

Deregister an agent.

```typescript
await client.deregisterAgent(instanceId);
```

#### sendHeartbeat(instanceId, params)

Send heartbeat to keep agent alive and receive messages.

```typescript
const { messages } = await client.sendHeartbeat(instanceId, {
  status: 'active' | 'idle' | 'busy',
  current_task?: string,
  progress?: number,  // 0.0 - 1.0
});
```

#### getAgent(instanceId)

Get agent details.

```typescript
const agent = await client.getAgent(instanceId);
```

#### listAgents(filters?)

List all registered agents.

```typescript
const agents = await client.listAgents({
  role?: 'master' | 'slaver',
  status?: 'active' | 'idle' | 'stale',
});
```

### Task Management

#### listTasks(filters?)

List tasks with optional filters.

```typescript
const tasks = await client.listTasks({
  status?: 'backlog' | 'ready' | 'in_progress' | 'review' | 'done',
  assigned_to?: string,
  tags?: string,  // comma-separated
});
```

#### getTask(taskId)

Get task details.

```typescript
const task = await client.getTask('FEAT-001');
```

#### claimTask(taskId, instanceId)

Claim a task for execution.

```typescript
const task = await client.claimTask('FEAT-001', instanceId);
```

#### updateTask(taskId, updates)

Update task status.

```typescript
await client.updateTask('FEAT-001', {
  status: 'review',
  progress: 1.0,
  notes: 'Implementation complete',
});
```

### Messaging

#### sendMessage(params)

Send a message to another agent.

```typescript
await client.sendMessage({
  from: instanceId,
  to: 'master',  // or specific agent ID
  type: 'pr_review_request' | 'task_claimed' | 'help_request' | 'status_update',
  priority: 'low' | 'normal' | 'high' | 'critical',
  payload: { /* custom data */ },
});
```

#### getMessages(instanceId, options?)

Get messages for an agent.

```typescript
const messages = await client.getMessages(instanceId, {
  since?: number,    // Unix timestamp
  limit?: number,    // Max messages (default: 50)
});
```

### PR Workflow

#### submitPR(params)

Submit a pull request.

```typescript
const prId = await client.submitPR({
  instance_id: instanceId,
  task_id: 'FEAT-001',
  branch: 'feature/FEAT-001',
  description: 'Implemented feature X',
  test_status: 'passed' | 'failed' | 'skipped',
});
```

#### reviewPR(taskId, review)

Review a pull request (master only).

```typescript
await client.reviewPR('FEAT-001', {
  reviewer: instanceId,
  status: 'approved' | 'changes_requested' | 'rejected',
  comments: [
    {
      file: 'src/main.ts',
      line: 42,
      comment: 'Consider using a constant here',
    },
  ],
  summary: 'Looks good overall!',
});
```

#### mergePR(taskId, params)

Merge a pull request (master only).

```typescript
const result = await client.mergePR('FEAT-001', {
  merger: instanceId,
  target_branch: 'main',
  squash: false,
});

console.log('Merged commit:', result.merge_commit);
```

### Utility Methods

#### healthCheck()

Check server health.

```typescript
const { status, version, uptime } = await client.healthCheck();
```

#### setToken(token)

Set JWT authentication token.

```typescript
client.setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
```

#### getConfig()

Get current client configuration.

```typescript
const config = client.getConfig();
```

#### isWebSocketConnected()

Check if WebSocket is connected.

```typescript
if (client.isWebSocketConnected()) {
  console.log('WebSocket is active');
}
```

#### shutdown()

Gracefully shutdown the client.

```typescript
await client.shutdown();
```

## Error Handling

The SDK provides specific error classes for different failure scenarios:

```typescript
import {
  EketError,
  NetworkError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
  WebSocketError,
} from 'eket-sdk';

try {
  await client.claimTask('FEAT-001', instanceId);
} catch (error) {
  if (error instanceof ConflictError) {
    console.log('Task already claimed by another agent');
  } else if (error instanceof NotFoundError) {
    console.log('Task not found');
  } else if (error instanceof NetworkError) {
    console.log('Network issue:', error.message);
  } else {
    console.log('Unknown error:', error);
  }
}
```

## Examples

See the [`examples/`](./examples) directory for complete working examples:

- **[register-agent.ts](./examples/register-agent.ts)** - Agent registration
- **[claim-task.ts](./examples/claim-task.ts)** - Complete task workflow
- **[submit-pr.ts](./examples/submit-pr.ts)** - PR review and merge (master)

### Running Examples

```bash
# Build the SDK first
npm run build

# Run example
npm install tsx
npx tsx examples/register-agent.ts
```

## TypeScript Support

The SDK is written in TypeScript and provides complete type definitions:

```typescript
import type {
  Agent,
  Task,
  Message,
  AgentType,
  TaskStatus,
  MessageType,
} from 'eket-sdk';

// All types are fully typed
const agent: Agent = await client.getAgent(instanceId);
const tasks: Task[] = await client.listTasks();
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## Protocol Version

This SDK implements **EKET Protocol v1.0.0**.

See the [Protocol Documentation](../../docs/protocol/EKET_PROTOCOL_V1.md) for details.

## Contributing

Contributions are welcome! Please read the [Contributing Guide](../../CONTRIBUTING.md) first.

## License

MIT © EKET Framework Team

## Links

- **Documentation**: [EKET Protocol](../../docs/protocol/)
- **GitHub**: [eket-framework/eket](https://github.com/eket-framework/eket)
- **Issues**: [GitHub Issues](https://github.com/eket-framework/eket/issues)
- **Website**: [eket.dev](https://eket.dev)

## Support

- 📧 Email: support@eket.dev
- 💬 Discord: [Join our community](https://discord.gg/eket)
- 📖 Docs: [docs.eket.dev](https://docs.eket.dev)
