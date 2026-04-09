# JS SDK Examples

Runnable TypeScript examples for the EKET JavaScript/TypeScript SDK.

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18 |
| ts-node | 10.x (`npm install -g ts-node`) |
| SDK dependencies | `cd sdk/javascript && npm install` |

An EKET server must be running on `http://localhost:8080` (or set `EKET_SERVER_URL`).

## Running Examples

```bash
# From the repository root
npx ts-node --esm sdk/javascript/examples/<file>.ts

# Or from the sdk/javascript directory
npx ts-node --esm examples/<file>.ts

# Override server URL
EKET_SERVER_URL=http://my-server:8080 npx ts-node --esm examples/register-agent.ts
```

## Examples

### 1. `register-agent.ts` — Agent Registration

Registers a new slaver agent, fetches its details, then deregisters it.

```
Checking server health...
✓ Server is healthy: { status: 'ok', version: '...', uptime: 42 }

Registering agent...
✓ Agent registered successfully!
  Instance ID: slaver_abc123
  ...
✅ Registration example completed successfully!
```

### 2. `claim-task.ts` — Task Workflow

Full slaver lifecycle: register → list tasks → claim → heartbeat loop → update progress → submit PR → notify master → deregister.

```
Step 1: Registering agent...
✓ Registered as: slaver_abc123
Step 2: Listing available tasks...
✓ Found 3 available tasks
...
✅ Task workflow completed successfully!
```

### 3. `submit-pr.ts` — PR Review & Merge (Master Role)

Registers as a master, connects via WebSocket, reviews a PR, merges it, and notifies the assignee.

```
Step 1: Registering as master...
✓ Registered as master: master_xyz789
...
✅ PR review and merge workflow completed!
```

### 4. `auto-heartbeat.ts` — Heartbeat Maintenance

Registers an agent and sends a heartbeat every 30 seconds for 2 minutes, printing any pending messages from the server.

```
Registering agent...
✓ Registered: slaver_abc123
  Server-recommended heartbeat interval: 30s

Starting heartbeat loop (every 30s)...
[2025-01-01T00:00:00.000Z] ✓ Heartbeat #1 sent
  Server time: 2025-01-01T00:00:00Z
...
```

### 5. `complete-workflow.ts` — End-to-End Slaver Workflow

Register → claim a task → heartbeat during each work phase → mark as review → submit PR → notify master → deregister.

```
Step 1: Registering slaver agent...
✓ Registered: slaver_abc123
Step 2: Looking for available tasks...
...
✅ Complete workflow finished!
```

### 6. `error-handling.ts` — Error Handling Patterns

Demonstrates catching `ValidationError`, `AuthenticationError`, `NotFoundError`, `ConflictError`, `NetworkError`, and the `EketError` base class. Works in offline mode if no server is running.

```
=== EKET SDK — Error Handling Examples ===

[1] ValidationError — missing required fields
  [ValidationError] Registration rejected due to missing fields
    code   : VALIDATION_ERROR
    ...
✅ Error handling demo complete!
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EKET_SERVER_URL` | `http://localhost:8080` | EKET server base URL |

## Troubleshooting

**`Cannot find module '../src/index.js'`**
Install SDK dependencies first: `cd sdk/javascript && npm install`

**`Error: connect ECONNREFUSED`**
Start the EKET server (`node dist/index.js gateway:start`) or point `EKET_SERVER_URL` at a running instance.

**`error-handling.ts` — all errors say "Server unreachable"**
That's expected when running without a server. The error-handling example degrades gracefully to offline mode.
