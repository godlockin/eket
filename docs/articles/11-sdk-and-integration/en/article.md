# 11 — SDK and Integration: JS / Python / axum / OpenClaw

> **TL;DR** — EKET exposes its protocol through four integration surfaces: a **JavaScript SDK** (`sdk/javascript/`, npm `eket-sdk`), a **Python SDK** (`sdk/python/`, PyPI `eket-sdk`), an **axum HTTP API** (`rust/crates/eket-server/`, default port 9877), and an **OpenClaw bridge** (`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md`) that maps external orchestrators onto the Master-Slaver state machine. Each surface speaks the same protocol (`EKET Protocol v1.0.0`) and uses the same auth model — JWT (HS256) preferred, static Bearer token as fallback, with a `EKET_JWT_SECRET` of ≥32 chars enforced at startup. Picking the right surface is a matter of who is calling: in-process Slaver → SDK, external service → HTTP, cross-framework orchestrator → OpenClaw bridge.

> **Key Takeaways**
> 1. EKET ships **four integration surfaces** that all speak the same protocol — the SDKs and the axum API are siblings, not a stack.
> 2. Auth is **two-mode, server-enforced**: JWT (HS256, exp-checked) via `EKET_JWT_SECRET`, or a static `EKET_AUTH_TOKEN` compared in constant time. Tokens have no scopes today; authorization is by *role* encoded in the state machine.
> 3. The **JS SDK** (`sdk/javascript/src/index.ts:92`) and the **Python SDK** (`sdk/python/eket_sdk/__init__.py:13`) both pin `__version__ = "1.0.0"` and `__protocol_version__ = "1.0.0"`. They are released under **independent semver** from the EKET node core (`sdk/VERSIONING.md:5-11`).
> 4. The **axum HTTP API** at `rust/crates/eket-server/src/lib.rs:461-492` exposes 15 routes under `/api/v1/*`, plus `/sse/events` and `/ws` for real-time; the whitelist `/health /ready /live /sse/events` skips auth (`rust/crates/eket-server/src/auth.rs:40`).
> 5. The **OpenClaw bridge** is a *protocol translator*, not a separate engine: OpenClaw's `Workflow → Task → Agent` maps 1:1 onto EKET's `Epic → Ticket → Slaver` (`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:18-30`).

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Question | Answer |
|---|---|
| Who is this article for? | Teams building *on top of* EKET — agent authors, dashboard authors, cross-framework orchestrators. |
| What surfaces does EKET expose? | JS SDK, Python SDK, axum HTTP API, OpenClaw bridge. All four implement `EKET Protocol v1.0.0`. |
| What auth model do they share? | Two-mode: JWT HS256 (`EKET_JWT_SECRET`, ≥32 chars) or static Bearer (`EKET_AUTH_TOKEN`); constant-time comparison; `/health /ready /live /sse/events` are whitelisted. |
| How are versions managed? | Independent semver. SDKs are `1.x.x`, node core is `2.x.x`. `sdk/VERSIONING.md:5-11` is the policy. |
| When to use which surface? | In-process agent → SDK. Cross-service integration → HTTP. Cross-framework orchestrator (OpenClaw) → bridge gateway. Browser dashboard → HTTP + SSE/WS. |
| What if I need a fifth surface? | The protocol is open. The state machine in `rust/crates/eket-core/src/ticket.rs` and the role-gated transitions in `protocol/state-machines/ticket-status.yml` are the contract — wrap them in any transport. |

The rest of this article is for integrators. Each section ends with a copy-paste-runnable snippet.

---

## Table of Contents

1. Motivation — the integration surface
2. The four integration surfaces at a glance
3. JavaScript SDK — install + first call
4. Python SDK — install + first call
5. axum HTTP API — REST endpoints, auth
6. OpenClaw bridge — what it enables
7. Webhook events — what gets emitted, how to subscribe
8. Building a custom integration — when to use SDK vs raw HTTP
9. Versioning — semantic-versioning policy
10. References

---

## 1. Motivation — the integration surface

The previous ten articles in this series treat EKET as a protocol: a state machine, a three-repo split, a four-level degradation chain, a Saga completion routine. All of that is necessary, but none of it is what *integrators* touch first.

What an integrator touches first is one of four things:

1. `npm install eket-sdk` and an `import { EketClient } from 'eket-sdk'`.
2. `pip install eket-sdk` and a `from eket_sdk import EketClient`.
3. A `curl http://localhost:9877/api/v1/tasks` against the axum server.
4. A request from OpenClaw saying "create workflow EPIC-001, assign FEAT-001 to a frontend Slaver."

This article is the integrator's view of EKET. It does not re-derive the state machine; that is `06-master-slaver-protocol`. It does not re-derive the three-repo split; that is `04-three-repo-arch`. It does not re-derive the four-level degradation; that is `05-four-level-degradation`. **It maps the protocol onto the four surfaces that actually carry traffic**, and answers the practical question: *given my language, my runtime, and my caller, which surface do I use?*

The integrator's time matters. The article is structured so that a reader can copy a snippet, paste it, and have a working agent registered against a running server in under five minutes. The deeper protocol semantics (Saga, CAS, role-gated transitions) are linked but not repeated; the protocol is the contract, the surfaces are how you call it.

> "Every external system that wants to participate in the protocol does so through one of the four surfaces. The surfaces are not a hierarchy; they are siblings. Picking the right one is about who is calling, not about who came first."
> — *EKET integration note, 2026-05*

Three integration failure modes shaped the design of the four surfaces:

1. **The "I just want one task" trap.** Early SDKs (pre-v1.0) shipped with a 14-method facade that forced integrators to know the protocol before they could do anything useful. The current JS SDK's `registerAgent → listTasks → claimTask → sendHeartbeat → submitPR` loop fits in 25 lines of code (`sdk/javascript/README.md:38-80`).
2. **The "I built a custom HTTP client" trap.** Several teams had rolled their own JWT signer, retry policy, and pagination handling before the SDKs existed. The axum API at `rust/crates/eket-server/src/lib.rs:461-492` is still the right choice for cross-service calls; the SDKs exist so that *in-process* code does not have to re-implement them.
3. **The "OpenClaw is a competitor" trap.** OpenClaw is *not* a replacement for EKET. It is an orchestrator that *uses* EKET as its execution layer (`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:11-17`). Treating them as competitors misses the point; they compose.

---

## 2. The four integration surfaces at a glance

| Surface | Path | Transport | Auth | Best for |
|---|---|---|---|---|
| **JavaScript SDK** | `sdk/javascript/` (`npm install eket-sdk`) | HTTP + WebSocket, auto-reconnect | JWT or static Bearer (auto-set from `registerAgent` response) | In-process Node.js / browser agents; Claude Code skill authors |
| **Python SDK** | `sdk/python/` (`pip install eket-sdk`) | HTTP via `requests.Session`; `retry_with_backoff` utility | JWT or static Bearer | In-process Python agents; data-pipeline integrations; ML serving glue |
| **axum HTTP API** | `rust/crates/eket-server/` (default port 9877) | REST + SSE + WebSocket | JWT (HS256) or static Bearer, with `/health /ready /live /sse/events` whitelisted | Cross-service calls; dashboard backend; anything that cannot take an SDK dependency |
| **OpenClaw bridge** | `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md` (Phase 1 gateway, Phase 2 dynamic agent loading, Phase 3 message queue, Phase 4 reinforced Claude Code) | HTTP/REST + Redis Pub/Sub | API Key + JWT (3-layer: OpenClaw→Gateway API key, Gateway→Master JWT, Master→Slaver instance cert) | External AI orchestrators; multi-framework coordination; OpenClaw-native workflows |

A few observations on this table:

- **All four implement `EKET Protocol v1.0.0`.** The protocol is the contract; the surfaces are different bindings to that contract.
- **The SDKs and the HTTP API are siblings, not a stack.** The JS SDK at `sdk/javascript/src/client.ts:88-94` ultimately calls `/api/v1/*` over HTTP — it is a typed wrapper around the axum server, with reconnection logic, exponential backoff, and WebSocket handling bolted on. There is no "protocol server" hiding behind the SDK.
- **The OpenClaw bridge is a protocol translator, not a parallel engine.** It maps OpenClaw's `Workflow → Task → Agent` onto EKET's `Epic → Ticket → Slaver` (`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:18-30`). The execution still happens in EKET.
- **There is no "graphQL" or "gRPC" surface today.** Both have been requested. The decision so far is "REST + SSE + WS is enough; add gRPC when a real consumer appears." `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:90-117` is the gateway plan, not a gRPC plan.

```
                     ┌────────────────────────────┐
                     │   External Orchestrator    │
                     │   (OpenClaw / human team)  │
                     └─────────────┬──────────────┘
                                   │ Phase 1 Gateway (HTTP)
                                   ▼
        ┌──────────────────────────────────────────────────┐
        │              EKET Integration Surfaces            │
        │                                                    │
        │  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
        │  │  JS SDK  │  │  Py SDK  │  │  axum HTTP   │   │
        │  │  (npm)   │  │  (pip)   │  │  (port 9877) │   │
        │  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
        │       │             │               │            │
        │       │   ┌─────────┴────────┐      │            │
        │       │   │  OpenClaw Bridge │      │            │
        │       │   │   (gateway +     │      │            │
        │       │   │   Redis Pub/Sub) │      │            │
        │       │   └─────────┬────────┘      │            │
        │       │             │               │            │
        └───────┼─────────────┼───────────────┼────────────┘
                │             │               │
                └─────────────┴───────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  EKET Core        │
                    │  (SQLite +        │
                    │   State Machine)  │
                    └──────────────────┘
```

---

## 3. JavaScript SDK (`sdk/javascript/`) — install + first call

The JavaScript SDK is published as the npm package `eket-sdk` (see `sdk/javascript/README.md:23-25`). The current version is **`1.0.0`**, exported as a constant in `sdk/javascript/src/index.ts:92` (`export const VERSION = '1.0.0';`). It targets TypeScript-first consumers and ships with full type definitions; the README's "Features" section lists the headline capabilities (`sdk/javascript/README.md:11-20`):

- Full TypeScript support (types in `sdk/javascript/src/types.ts`)
- WebSocket support for real-time agent-to-agent messaging
- Promise-based async/await API
- Type-safe error classes (`sdk/javascript/src/errors.ts`)
- Zero-config install
- Auto-reconnect with exponential backoff for WebSocket
- Well-documented (the README is 450+ lines)
- Unit tests included (`sdk/javascript/tests/`)

### 3.1 Install

```bash
npm install eket-sdk
# or
yarn add eket-sdk
```

(Per `sdk/javascript/README.md:23-31`.)

### 3.2 First call — register, list, claim, heartbeat, PR

The README's Quick Start (`sdk/javascript/README.md:38-80`) compresses the full agent lifecycle into ~25 lines. Here is the minimum you need to get a Slaver registered and a task claimed:

```typescript
import { EketClient } from 'eket-sdk';

// 1. Create a client. The base URL points at the axum server (default port 9877,
//    per rust/crates/eket-server/src/main.rs:28-31).
const client = new EketClient({
  serverUrl: 'http://localhost:9877',
});

// 2. Register. The server returns { instance_id, token, server_url, websocket_url,
//    heartbeat_interval }. The token is auto-applied to subsequent requests.
const { instance_id, token } = await client.registerAgent({
  agent_type: 'claude_code',
  role: 'slaver',
  specialty: 'frontend',
  capabilities: ['react', 'typescript', 'css'],
});
console.log('Registered as:', instance_id);

// 3. List READY tasks.
const tasks = await client.listTasks({ status: 'ready' });

// 4. Claim the first one (atomic CAS, see 06-master-slaver-protocol).
const task = await client.claimTask(tasks[0].id, instance_id);

// 5. Heartbeat — keeps the Slaver alive in the registry and may return messages.
await client.sendHeartbeat(instance_id, {
  status: 'active',
  current_task: task.id,
  progress: 0.5,
});

// Expected log line (stdout):
//   Registered as: claude-code-<uuid>
```

This snippet uses the public API defined in `sdk/javascript/src/index.ts:10-89` and the method signatures in `sdk/javascript/README.md:135-170`. The exact field names (`agent_type`, `role`, `specialty`, `capabilities`) and the union types are enforced at compile time. Error handling uses the typed exception classes exported from `sdk/javascript/src/errors.ts` (lines 61-71 of `index.ts`); for example, `ConflictError` fires when another Slaver wins the race for the same task.

### 3.3 WebSocket — real-time channel

`EketClient` ships with an opt-in WebSocket. Enable it with `enableWebSocket: true` (the default). The connect/listen/disconnect cycle is in `sdk/javascript/README.md:84-114`:

```typescript
await client.connectWebSocket(instance_id);

client.onMessage((message) => {
  console.log('Received:', message.type, message.payload);
});

client.onError((error) => {
  console.error('WebSocket error:', error);
});

client.onClose(() => {
  console.log('WebSocket disconnected');
});
```

The WebSocket endpoint on the server side is `rust/crates/eket-server/src/lib.rs:467` (`/ws`). Auto-reconnect is bounded — `wsMaxReconnectAttempts = 5` with `wsReconnectDelay = 1000` ms initial, per `sdk/javascript/src/client.ts:69-70`. The handler is in `rust/crates/eket-server/src/ws.rs`.

### 3.4 Error model

The SDK exports eight error classes from `sdk/javascript/src/index.ts:61-71`: `EketError`, `NetworkError`, `AuthenticationError`, `ValidationError`, `NotFoundError`, `ConflictError`, `ServiceUnavailableError`, `WebSocketError`. The catch-block pattern is in `sdk/javascript/README.md:357-382`:

```typescript
import {
  EketError,
  ConflictError,
  NotFoundError,
  NetworkError,
} from 'eket-sdk';

try {
  await client.claimTask('FEAT-001', instance_id);
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

---

## 4. Python SDK (`sdk/python/`) — install + first call

The Python SDK is published as the PyPI package `eket-sdk` (per `sdk/python/README.md:25-27`). The current version is **`1.0.0`**, exported as `__version__ = "1.0.0"` in `sdk/python/eket_sdk/__init__.py:13`. It targets Python 3.8+ and depends on `requests >= 2.31.0` (`sdk/python/README.md:472-475`). The "Features" section (`sdk/python/README.md:13-19`) lists the headline capabilities:

- Complete protocol support
- JWT authentication with automatic token management
- Auto retry with exponential backoff (`utils.retry_with_backoff`)
- Full type annotations
- Comprehensive unit tests
- Pythonic, intuitive interface

### 4.1 Install

```bash
pip install eket-sdk          # from PyPI (future)
# or, for now:
cd sdk/python && pip install -e .
```

(Per `sdk/python/README.md:23-39`.)

### 4.2 First call — register, list, claim, update

The README's Quick Start (`sdk/python/README.md:46-82`) compresses the lifecycle into ~30 lines. Here is the minimum you need:

```python
from eket_sdk import (
    EketClient, AgentType, AgentRole, AgentSpecialty,
    TaskStatus, MessageType, TestStatus,
)

# 1. Create a client. server_url points at the axum server (default port 9877).
client = EketClient(server_url="http://localhost:9877")

# 2. Register. The Agent dataclass carries instance_id, role, capabilities, etc.
agent = client.register_agent(
    agent_type=AgentType.CUSTOM,
    role=AgentRole.SLAVER,
    specialty=AgentSpecialty.BACKEND,
    capabilities=["python", "fastapi", "postgresql"],
)
print(f"Registered as {agent.instance_id}")

# 3. List READY tasks.
tasks = client.list_tasks(status=TaskStatus.READY)

# 4. Claim the first one.
task = client.claim_task(tasks[0].id)
print(f"Claimed task: {task.id}")

# 5. Update progress and submit a PR.
client.update_task(
    task.id,
    status=TaskStatus.REVIEW,
    progress=1.0,
    notes="Implementation completed",
)

pr_id = client.submit_pr(
    instance_id=agent.instance_id,
    task_id=task.id,
    branch=f"feature/{task.id}-impl",
    description="Implemented feature",
    test_status=TestStatus.PASSED,
)

# 6. Notify Master.
masters = client.list_agents(role=AgentRole.MASTER)
client.send_message(
    from_id=agent.instance_id,
    to_id=masters[0].instance_id,
    msg_type=MessageType.PR_REVIEW_REQUEST,
    payload={"task_id": task.id, "pr_id": pr_id},
)

# Expected log line (stdout):
#   Registered as <instance_id>
```

This uses the public surface exported in `sdk/python/eket_sdk/__init__.py:16-29` and the method signatures in `sdk/python/eket_sdk/client.py:174-202` (`register_agent`), `client.py:375-422` (`list_tasks`, `claim_task`), and `client.py:598-...` (`submit_pr`).

### 4.3 Context manager

The Python SDK supports `with`-syntax for automatic session teardown (`sdk/python/README.md:110-120`):

```python
with EketClient(server_url="http://localhost:9877") as client:
    agent = client.register_agent(
        agent_type=AgentType.CUSTOM,
        role=AgentRole.SLAVER,
    )
    # ... work ...
    client.deregister_agent()
# Session auto-closed; instance unregistered.
```

### 4.4 Error model

The SDK exports six exception classes from `sdk/python/eket_sdk/__init__.py:22-29` (and `exceptions.py`): `EketError` (base), `AuthenticationError` (401), `ValidationError` (400), `NotFoundError` (404), `ConflictError` (409 — e.g. "already claimed"), `ServerError` (500). The catch-block pattern is in `sdk/python/README.md:319-337`:

```python
from eket_sdk import EketError, ConflictError, NotFoundError

try:
    task = client.claim_task("FEAT-001")
except ConflictError as e:
    print(f"Task already claimed: {e.message}")
    print(f"Claimed by: {e.details.get('assigned_to')}")
except NotFoundError:
    print("Task not found")
except EketError as e:
    print(f"Error {e.code}: {e.message}")
```

### 4.5 Auto-retry

For long-running claim loops, the SDK ships a retry decorator in `sdk/python/eket_sdk/utils.py`, used in `sdk/python/README.md:373-385`:

```python
from eket_sdk.utils import retry_with_backoff

@retry_with_backoff(max_retries=5, initial_delay=1.0)
def claim_task_with_retry(client, task_id):
    return client.claim_task(task_id)
```

---

## 5. axum HTTP API (`rust/crates/eket-server/`) — REST endpoints, auth

The axum HTTP server is the canonical wire protocol. The SDKs are typed wrappers around it. If you cannot take an SDK dependency — for example, your integration is a cross-service call from a Java or Go service, a serverless function, or a shell script — the HTTP API is what you call.

### 5.1 The router

The full router is defined in `rust/crates/eket-server/src/lib.rs:461-492` (`build_router` function). The route table:

| Method | Path | Handler | Purpose |
|---|---|---|---|
| GET | `/health` | `health_handler` | Liveness + uptime seconds |
| GET | `/live` | `live_handler` | Liveness only |
| GET | `/ready` | `ready_handler` | Readiness — checks SQLite |
| GET | `/sse/events` | `sse_handler` | Server-Sent Events for real-time |
| GET | `/ws` | `ws::ws_handler` | WebSocket upgrade |
| GET | `/api/v1/tasks` | `list_tasks` | List tasks, filter by status / assignee / priority |
| GET | `/api/v1/tasks/:id` | `get_task` | Get one task |
| PATCH | `/api/v1/tasks/:id/status` | `update_task_status` | Update task status (Saga step 5) |
| GET | `/api/v1/agents` | `list_agents` | List agents, filter by role |
| POST | `/api/v1/agents/register` | `register_agent_handler` | Register an agent |
| GET | `/api/v1/agents/:id` | `get_agent` | Get one agent |
| DELETE | `/api/v1/agents/:id` | `delete_agent_handler` | Mark agent offline |
| POST | `/api/v1/agents/:id/heartbeat` | `agent_heartbeat_handler` | Heartbeat (also returns last_seen) |
| POST | `/api/v1/tasks/:id/claim` | `claim_task_handler` | Atomic claim (SQLite CAS) |
| GET | `/api/v1/dag` | `get_dag` | Ticket DAG with edges |
| POST | `/hooks/pre-tool-use` | `hooks::pre_tool_use` | Claude Code hook |
| POST | `/hooks/post-tool-use` | `hooks::post_tool_use` | Claude Code hook |
| POST | `/hooks/teammate-idle` | `hooks::teammate_idle` | Claude Code hook |
| POST | `/hooks/task-completed` | `hooks::task_completed` | Claude Code hook |
| POST | `/hooks/permission-request` | `hooks::permission_request` | Claude Code hook |

(Source: `rust/crates/eket-server/src/lib.rs:468-486`.)

The default port is **9877**, set in `rust/crates/eket-core/src/config.rs:49` and read at startup in `rust/crates/eket-server/src/main.rs:28-31` (overridable via `EKET_SERVER_PORT` env var). CORS is permissive (`CorsLayer::permissive()` in `lib.rs:490`) — tighten this for production deployments.

### 5.2 Auth model — two-mode, server-enforced

The auth model is the **same** for the HTTP API, the SDKs, and (modulo one layer up) the OpenClaw bridge. It is implemented in `rust/crates/eket-server/src/auth.rs:1-93` and explained in the source comments (lines 1-3):

> "TASK-184: Unified auth — supports both JWT (HS256) and static Bearer token.
> - JWT: verified via `EKET_JWT_SECRET` (HS256, exp checked)
> - Static token: compared constant-time via `EKET_AUTH_TOKEN` (backward compat)"

The rules, in order of precedence:

1. **Both methods disabled** → request passes through unauthenticated. (See `auth.rs:47-50`.) This is the dev / single-tenant default. **Production deployments must set one.**
2. **Whitelist paths** (`/health`, `/ready`, `/live`, `/sse/events`) skip auth entirely, regardless of configuration. (See `auth.rs:40` and `54-56`.) The `/sse/events` whitelist is intentional — SSE consumers (dashboards, OpenClaw) should be able to subscribe without managing a JWT.
3. **Authorization header** is read (`auth.rs:59-63`). If `Bearer <token>` is missing, the response is `401 {"error": "missing_token"}` (lines 65-70).
4. **JWT mode** (`EKET_JWT_SECRET` set, ≥32 chars enforced at startup — see `lib.rs:511-521`): the token is decoded as HS256 with `validate_exp = true` (lines 73-79). An expired or wrong-secret token falls through to the static check.
5. **Static mode** (`EKET_AUTH_TOKEN` set): the supplied token is compared **in constant time** against the configured value using `constant_time_eq` (lines 83-86). This prevents timing side-channels.
6. **All checks fail** → `401 {"error": "invalid_token"}` (lines 89-92).

The JWT secret length is enforced at startup by the validator in `lib.rs:512-519`:

```rust
let jwt_secret = std::env::var("EKET_JWT_SECRET").ok();
if let Some(ref secret) = jwt_secret {
    if secret.len() < 32 {
        return Err(anyhow::anyhow!(
            "EKET_JWT_SECRET must be ≥32 chars (256-bit entropy), got {} chars",
            secret.len()
        ));
    }
    info!("JWT auth enabled via EKET_JWT_SECRET");
}
```

The unit test `weak_jwt_secret_rejected` in `lib.rs:744-760` asserts that a 5-character secret causes `start()` to return an error containing `≥32 chars`.

**There are no scopes today.** The `Claims` struct in `auth.rs:16-20` has only `sub` and `exp`:

```rust
struct Claims {
    sub: String,
    exp: usize,
}
```

Authorization is by *role* encoded in the state machine (`who_can_transition: [slaver]` etc., per `06-master-slaver-protocol:284-292`), not by token scope. If you need multi-tenant scope isolation, file a ticket; the design intent is to add it as a third Claims field without breaking the v1.0.0 protocol.

### 5.3 First call — curl

```bash
# Health check (whitelisted, no auth needed).
curl -s http://localhost:9877/health
# {"status":"ok","uptime_secs":42}

# Register an agent (auth required if EKET_AUTH_TOKEN or EKET_JWT_SECRET is set).
curl -X POST http://localhost:9877/api/v1/agents/register \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${EKET_AUTH_TOKEN}" \
  -d '{
    "agent_id": "claude-frontend-001",
    "role": "slaver",
    "type": "claude_code",
    "skills": ["react", "typescript"]
  }'
# {"ok":true,"agent_id":"claude-frontend-001"}

# Heartbeat.
curl -X POST http://localhost:9877/api/v1/agents/claude-frontend-001/heartbeat \
  -H "Authorization: Bearer ${EKET_AUTH_TOKEN}"
# {"ok":true,"last_seen":"2026-06-04T11:23:55Z"}

# Claim a task (atomic CAS).
curl -X POST http://localhost:9877/api/v1/tasks/FEAT-001/claim \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${EKET_AUTH_TOKEN}" \
  -d '{"agent_id":"claude-frontend-001"}'
# {"ok":true,"ticket_id":"FEAT-001","assignee":"claude-frontend-001","claimed_at":"..."}
# OR on race-loss:
# 409 {"error":"already_claimed"}

# List tasks.
curl -s 'http://localhost:9877/api/v1/tasks?status=ready' \
  -H "Authorization: Bearer ${EKET_AUTH_TOKEN}"
# {"tasks":[...],"total":N}
```

These four calls exercise four of the axum handler functions: `register_agent_handler` (`lib.rs:326-336`), `agent_heartbeat_handler` (`lib.rs:353-367`), `claim_task_handler` (`lib.rs:374-403`), and `list_tasks` (`lib.rs:188-233`). The claim handler is the most interesting — it issues a single SQL `UPDATE` that flips `status='in_progress'` and `assignee=?` only when the row is still in `('todo', 'ready', 'backlog')` (see `lib.rs:381-387`). On `info.changes === 0`, the handler returns `409 Conflict` with `{"error":"already_claimed"}` (`lib.rs:392-395`). This is the CAS primitive that prevents double-claim.

### 5.4 Real-time — SSE and WebSocket

The `/sse/events` endpoint (`lib.rs:407-440`) streams `EventType` values from the `EventBus`. The event union is defined in `lib.rs:35-72`:

```rust
pub enum EventType {
    TaskStarted, TaskCompleted, TaskFailed, TaskBlocked,
    AgentRegistered, AgentHeartbeat, AgentOffline,
    MasterElected, MasterFailover,
    QueueOverflow, QueueDrained,
    ReviewRequested, ReviewApproved, ReviewRejected,
}
```

Each event name serializes to snake_case (`task_started`, `agent_offline`, etc.) via the `as_str()` method in `lib.rs:54-72`. The handler accepts an optional `?filter=task_*` query parameter to subscribe to a subset (line 411, lines 418-422).

A `lagged` event is emitted when a slow subscriber falls behind the broadcast channel's 4096-slot buffer (`lib.rs:427-431`); the event payload is `{"missed": N}`. This is a feature, not a bug — the alternative is silent data loss.

The WebSocket endpoint (`/ws`, `lib.rs:467`) is implemented in `rust/crates/eket-server/src/ws.rs`. A subscriber receives `WorkflowEvent` objects whenever a ticket transitions state (verified by the test `ws_event_on_transition` in `lib.rs:692-740`).

---

## 6. OpenClaw bridge (`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md`) — what it enables

OpenClaw is an external AI orchestrator. EKET is the execution layer. The bridge is the protocol translator between them. The design is in `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:1-517` (517 lines, 9 sections); the dataflow is in `docs/architecture/OPENCLAW-DATAFLOW-DESIGN.md:1-777` (777 lines, 6 sections).

### 6.1 Concept mapping (verbatim)

`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:18-30` defines the 1:1 mapping:

| OpenClaw concept | EKET counterpart | Notes |
|---|---|---|
| Workflow | Epic | Workflow = epic-scale work |
| Task | Ticket | Task = Jira ticket |
| Agent Instance | Slaver Instance | Execution instance |
| Orchestrator | Master Instance | Coordinator instance |
| Tool | Skill | Tool = skill |
| Memory | `.eket/memory/` | Memory storage |

The mapping is structural, not nominal. An OpenClaw `Task` of `type=feature, priority=P1` becomes an EKET `FEAT-001` ticket with the same `type` and `importance` (`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:139-155`). The `Workflow → Epic` mapping is enforced by the gateway at `POST /api/v1/workflow` (`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:106-117`).

### 6.2 The four-phase rollout

The bridge ships in four phases (`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:90-275`):

| Phase | Version | Adds | Source |
|---|---|---|---|
| **Phase 1: API Gateway** | v1.0.0 | REST API under `/api/v1/workflow`, `/api/v1/task`, `/api/v1/agent`, `/api/v1/memory`; protocol translator `openCLAWToEKET(task)` | `OPENCLAW-INTEGRATION-DESIGN.md:92-155` |
| **Phase 2: Dynamic agent loading** | v1.1.0 | `scripts/openclaw-load-agent.sh`, `scripts/openclaw-exec.sh`, Agent Profile template at `.eket/profiles/openclaw_managed.yml` | `OPENCLAW-INTEGRATION-DESIGN.md:157-207` |
| **Phase 3: Message queue integration** | v1.2.0 | Bidirectional message channel via Redis Pub/Sub; channels `openclaw:tasks:assign`, `openclaw:tasks:status`, `openclaw:agents:lifecycle` | `OPENCLAW-INTEGRATION-DESIGN.md:209-242` |
| **Phase 4: Reinforced Claude Code** | v1.3.0 | Multi-instance Claude Code team (master + 4 specialty Slavers) orchestrated by OpenClaw | `OPENCLAW-INTEGRATION-DESIGN.md:243-285` |

**As of mid-2026, Phases 1 and 2 are stable; Phases 3 and 4 are reference designs being implemented.** Check the bridge status before planning a deployment.

### 6.3 Data flow — what crosses the boundary

The end-to-end data flow is in `docs/architecture/OPENCLAW-DATAFLOW-DESIGN.md:9-99`. The 9-step flow:

| Step | Direction | Type | Protocol | Content |
|---|---|---|---|---|
| 1 | OpenClaw → Gateway | Workflow create | HTTP/REST | `{name, description, priority, deadline}` |
| 2 | Gateway → Master | Epic create | Internal event | Epic metadata |
| 3 | Master → Jira | Ticket create | Git commit | Markdown ticket file |
| 4 | Master → Redis | Task publish | Redis Pub/Sub | `{type: task_assignment, payload: {...}}` |
| 5 | Slaver → Redis | Task claim | Redis Pub/Sub | `{type: task_claimed, ticket_id: ...}` |
| 6 | Slaver → Code repo | Code commit | Git push | Feature branch + PR |
| 7 | Slaver → Redis | Status update | Redis Pub/Sub | `{type: task_status_update, status: review}` |
| 8 | Master → Redis | Review complete | Redis Pub/Sub | `{type: task_status_update, status: done}` |
| 9 | Gateway → OpenClaw | Webhook | HTTP POST | Workflow progress |

(Source: `docs/architecture/OPENCLAW-DATAFLOW-DESIGN.md:86-96`.)

Step 9 is the important one for integrators: **the bridge calls back to OpenClaw with status updates** (not the other way around). The callback URL is registered as part of the bridge configuration (`.eket/config.yml` at `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:322-360`).

### 6.4 Example — OpenClaw creates and dispatches a task

`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:387-410` is the canonical worked example. Compressed:

```bash
# OpenClaw creates and assigns a Task.
curl -X POST http://eket.local:8080/api/v1/task \
  -H "Authorization: Bearer ${OPENCLAW_API_KEY}" \
  -d '{
    "workflow_id": "EPIC-001",
    "type": "feature",
    "title": "User login flow",
    "description": "Implement JWT-auth login",
    "priority": "P1",
    "assignee_role": "frontend_dev",
    "skills_required": ["react", "typescript"]
  }'

# Response:
# {
#   "task_id": "FEAT-001",
#   "ticket_id": "FEAT-001",
#   "status": "ready",
#   "assigned_to": "agent_frontend_dev_001"
# }
```

A Slaver (front-end) detects `FEAT-001` is `ready`, claims it via the SDK, and the bridge posts a callback when the ticket transitions to `done` (step 9 above).

### 6.5 Why the bridge matters for integrators

For most teams, the bridge is *invisible*: you write against the SDK or the HTTP API and the protocol semantics are the same. The bridge matters if you are:

- **A different orchestrator** that wants to use EKET as the execution layer (e.g. n8n, Temporal, in-house).
- **A team that already runs OpenClaw** and wants to add EKET's audit trail, role-gated transitions, and Saga 5-step completion.
- **A dashboard author** who wants to surface EKET state through an existing OpenClaw-aware UI.

The bridge is also the place where **multi-framework coordination** lives: the YAML at `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:248-274` shows a master + 4 specialty Slavers (frontend, backend, QA, devops) all under one OpenClaw orchestrator.

---

## 7. Webhook events — what gets emitted, how to subscribe

Webhooks are **outbound** HTTP POSTs sent by the EKET core to URLs you register. The implementation is in `rust/crates/eket-core/src/webhook.rs:1-118`. Two tables back the system (`webhook.rs:3-5`):

- `webhook_urls` — registered endpoints (URL + secret encrypted at rest)
- `webhook_event_records` — delivery log with retry state

### 7.1 Event union (8 events, snake_case)

`webhook.rs:24-40` defines the `WebhookEvent` enum; the wire format is snake_case (`webhook.rs:25-40`):

```rust
pub enum WebhookEvent {
    #[serde(rename = "task.created")]    TaskCreated,
    #[serde(rename = "task.claimed")]    TaskClaimed,
    #[serde(rename = "task.completed")]  TaskCompleted,
    #[serde(rename = "task.declined")]   TaskDeclined,
    #[serde(rename = "epic.completed")]  EpicCompleted,
    #[serde(rename = "slaver.registered")] SlaverRegistered,
    #[serde(rename = "slaver.offline")]  SlaverOffline,
}
```

These are the *integration* events (separate from the `EventType` SSE events in `lib.rs:35-72`; the SSE events are in-process broadcasts, the webhook events are HTTP POSTs to external URLs).

### 7.2 Subscription and delivery

URLs are added via `WebhookStore::add_url(url, events, secret)` (`webhook.rs:379-411`). The signature:

```rust
pub fn add_url(
    &self,
    url: &str,
    events: &[String],   // e.g. ["task.created", "task.completed"] or ["*"]
    secret: Option<&str>, // HMAC signing secret
) -> Result<WebhookUrl>
```

The store validates the URL for SSRF risk before persisting it (`webhook.rs:282-324`): must be `http`/`https`, must not target `localhost`, must not be in `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` (cloud metadata), or `::1`. The unit tests at `webhook.rs:1101-1140` cover these cases.

**Delivery is best-effort with retry.** The `retry_delay` function (`webhook.rs:620-625`) computes `2^attempt` minutes, capped at `MAX_ATTEMPTS - 1`. The retry poller runs every 60 seconds (`webhook.rs:711-719`):

```rust
pub fn start_retry_poller(store: Arc<WebhookStore>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            poll_due_retries(&store).await;
        }
    });
}
```

The store is started in `lib.rs:499`: `start_retry_poller(Arc::new(WebhookStore::new(pool.clone())));` — every server startup spins up a retry poller.

**Failures warn; they do not abort.** From `webhook.rs:8`: "Fail → warn only, never abort caller." This is the right design for an audit-grade system: a webhook delivery failure should not roll back a state transition.

### 7.3 Dispatcher

`webhook.rs:627-708` is the public dispatcher. The signature is fire-and-forget:

```rust
pub async fn dispatch_event(
    pool: DbPool,
    event: WebhookEvent,
    payload: serde_json::Value,
)
```

It reads registered URLs, filters by event name (or `*` for all), creates a record in `webhook_event_records` per matching URL, and spawns a Tokio task per delivery. The HTTP client has a 30-second timeout (`webhook.rs:651-660`).

### 7.4 Subscribing from the SDK or HTTP

The Python SDK and the JS SDK do not (yet) ship a typed wrapper around `add_url`. The current path is:

1. Use the `WebhookStore::add_url` API in a custom Rust binary, **or**
2. Insert directly into the `webhook_urls` table, **or**
3. Wait for the `api/v1/webhooks` REST route that is planned in the bridge design (not yet shipped as of mid-2026).

A future article (12-multi-tool-support) will cover webhook author ergonomics; for now, the surface is intentionally narrow.

---

## 8. Building a custom integration — when to use SDK vs raw HTTP

The four surfaces compose by need, not by hierarchy. Here is a decision matrix:

| You are building… | Use | Why |
|---|---|---|
| A Node.js / TypeScript agent that runs in-process with the EKET server | **JS SDK** | Auto-reconnect, typed errors, WebSocket built-in, no HTTP plumbing |
| A Python agent, data-pipeline glue, or ML serving handler | **Python SDK** | Connection pooling, retry decorator, `requests.Session`, type hints |
| A cross-service call from a Go / Java / Rust service that cannot take an SDK dependency | **axum HTTP** | First-class REST; same auth as the SDKs; whitelisted health/ready for k8s probes |
| A serverless function (Lambda, Cloud Functions) that times out after a few seconds | **axum HTTP** | Cold-start friendly; SDKs add a connection pool that a single request never reuses |
| An external orchestrator (n8n, Temporal, in-house) | **OpenClaw bridge** | Concept mapping (Workflow/Task/Agent → Epic/Ticket/Slaver) is built-in |
| A web dashboard that subscribes to live state | **HTTP + `/sse/events` or `/ws`** | Whitelisted; no auth header required for the SSE stream |
| A CI runner that does `git push` and then signals completion | **HTTP `PATCH /api/v1/tasks/:id/status`** | One call, no SDK needed |
| An agent that needs to react to inbound `task.claimed` events from peers | **SDK WebSocket** | Real-time, auto-reconnect, typed message handlers |
| A backup / disaster-recovery tool that re-reads the audit log | **Direct SQLite read** | The `tickets`, `task_checkpoints`, `webhook_event_records` tables are the source of truth |

### 8.1 Three rules of thumb

1. **If you can take a dependency, take the SDK.** Both SDKs are < 50 KB of code, no native deps, and they handle the boring 80% (auth, retry, error types) so you do not have to.
2. **If you cannot take a dependency, use the HTTP API with `Authorization: Bearer <token>`.** The static-token path is supported in `auth.rs:82-86` and is the simplest auth to plumb through shell scripts.
3. **If you need cross-framework coordination, use the OpenClaw bridge.** Do not roll your own orchestrator on top of the SDK — the bridge already has the 1:1 concept mapping, the three-phase rollout plan, and the Redis Pub/Sub channels defined.

### 8.2 The "I just need one endpoint" anti-pattern

A common failure mode is reaching for a SDK when the real need is a single curl. Both SDKs are *integrations*, not frameworks; using one for a single HTTP call adds 50 KB of code to your bundle. The auth model is identical; the HTTP API is the wire. **Pick the simplest surface that gets the call through.**

### 8.3 The "I rolled my own client" anti-pattern

The opposite failure mode is writing a custom HTTP client in your own codebase. The auth header format is the same, the retry policy is the same, the error class hierarchy is the same — and it changes when the protocol versions. Use the SDK where possible; pin to `1.0.0`; upgrade deliberately (see §9).

---

## 9. Versioning (`sdk/VERSIONING.md`) — semantic-versioning policy

The SDKs and the EKET node core are released under **independent semver tracks**. The policy is in `sdk/VERSIONING.md:1-82`; the key passage is the version table at `VERSIONING.md:7-11`:

```
node core:    2.x.x  (框架核心，独立演进)
EKET SDK:     1.x.x  (SDK，独立演进)
EKET Protocol: 1.x.x (协议规范，SDK 实现的标准)
```

Both SDKs currently pin to `1.0.0` (`sdk/javascript/src/index.ts:92` for JS; `sdk/python/eket_sdk/__init__.py:13` for Python), and both advertise `__protocol_version__ = "1.0.0"` (the Python SDK's docstring at `__init__.py:14` is explicit; the JS SDK's protocol version is in `sdk/javascript/README.md:440-442`).

### 9.1 The three semver tiers (verbatim)

`VERSIONING.md:27-51` defines the upgrade rules:

**MAJOR (incompatible):** "remove or rename public APIs (methods, classes, parameters); change existing parameter types or return types; upgrade corresponding EKET Protocol major version." Example: `1.x.x → 2.0.0`.

**MINOR (backward-compatible features):** "add new public APIs, methods, parameters (optional); add support for new EKET Protocol minor features; performance optimizations (no interface change)." Example: `1.0.x → 1.1.0`.

**PATCH (backward-compatible bug fixes):** "Bug fix, no public interface change; doc / comment fix; internal implementation optimization (interface unchanged)." Example: `1.0.0 → 1.0.1`.

### 9.2 Protocol / SDK coupling

`VERSIONING.md:15-25` defines the SDK-to-protocol version table:

| SDK version | EKET Protocol | Notes |
|---|---|---|
| 1.0.0 | 1.0.0 | Initial stable, full v1 protocol support |
| 1.1.0 | 1.0.x | New features, backward compatible |
| 2.0.0 | 2.0.0 | Protocol major upgrade, breaking |

The takeaway: **an SDK minor bump never requires a protocol change; an SDK major bump implies a protocol major bump.** The protocol version is what the SDK *implements*; the SDK version is what the user *depends on*.

### 9.3 Decoupling from node core (verbatim)

`VERSIONING.md:55-61` is explicit about the decoupling:

> - node core (`node/`) version is `2.x.x`, follows the framework's own evolution cadence
> - SDK (`sdk/python/`, `sdk/javascript/`) version is `1.x.x`, follows the protocol's evolution cadence
> - The two **do not depend on each other's version numbers** and can be released independently
> - The SDK communicates with the EKET Gateway over HTTP / WebSocket and does not depend on node core code

This is why a `eket-cli` bump to `2.6.0` does not require any SDK release, and why a `eket-sdk` bump to `1.0.1` does not require a node-core release.

### 9.4 Release tag convention (verbatim)

`VERSIONING.md:65-70`:

```
sdk-python-v1.0.0    # Python SDK release tag
sdk-js-v1.0.0        # JavaScript SDK release tag
v2.6.0               # node core release tag (does not affect SDK)
```

### 9.5 Current version matrix (verbatim)

`VERSIONING.md:76-82`:

| Component | Version | Status |
|---|---|---|
| Python SDK | 1.0.0 | Stable |
| JavaScript SDK | 1.0.0 | Stable |
| EKET Protocol | 1.0.0 | Stable |
| node core | 2.x.x | Independent evolution |

### 9.6 Practical advice for integrators

- **Pin to `1.0.0` (or the latest `1.x`) and upgrade deliberately.** Each `1.x.y` release is guaranteed not to break your code; check the CHANGELOG before bumping.
- **Watch the protocol version, not just the SDK version.** A protocol major bump is what triggers a SDK major bump; the protocol's release notes (`docs/protocol/EKET_PROTOCOL_V1.md`) are the upstream signal.
- **If you take both SDKs, you may be on different patch versions.** That is fine — the protocol is the contract, the SDKs are bindings.

---

## 10. References

- **SDK source:**
  - `sdk/javascript/src/index.ts:1-93` — public exports, `VERSION = '1.0.0'`
  - `sdk/javascript/src/client.ts:64-110` — `EketClient` class + `EketClientConfig`
  - `sdk/javascript/src/types.ts:1-9.9K` — TypeScript types
  - `sdk/javascript/src/errors.ts:1-3.5K` — error class hierarchy
  - `sdk/javascript/README.md:38-114` — Quick Start + WebSocket
  - `sdk/javascript/README.md:135-307` — full API reference
  - `sdk/python/eket_sdk/__init__.py:1-55` — `__version__ = "1.0.0"`, public exports
  - `sdk/python/eket_sdk/client.py:48-202` — `EketClient` class + `register_agent`
  - `sdk/python/eket_sdk/client.py:174-202` — `register_agent` method
  - `sdk/python/eket_sdk/exceptions.py:1-2.2K` — error class hierarchy
  - `sdk/python/README.md:46-120` — Quick Start + context manager
- **Versioning:**
  - `sdk/VERSIONING.md:1-82` — full policy, semver tiers, decoupled tracks
  - `sdk/VERSIONING.md:5-11` — version map (node core / SDK / protocol)
  - `sdk/VERSIONING.md:27-51` — MAJOR / MINOR / PATCH rules
  - `sdk/VERSIONING.md:76-82` — current version matrix
- **axum server:**
  - `rust/crates/eket-server/src/lib.rs:1-538` — server module
  - `rust/crates/eket-server/src/lib.rs:35-72` — `EventType` enum
  - `rust/crates/eket-server/src/lib.rs:461-492` — `build_router` (full route table)
  - `rust/crates/eket-server/src/lib.rs:496-537` — `start()` (port, env, JWT secret check)
  - `rust/crates/eket-server/src/lib.rs:511-521` — JWT secret ≥32 char enforcement
  - `rust/crates/eket-server/src/main.rs:1-42` — binary entry point, `EKET_SERVER_PORT` env
  - `rust/crates/eket-core/src/config.rs:49` — `api_port` default `9877`
  - `rust/crates/eket-server/src/auth.rs:1-93` — `AuthConfig` + `auth_middleware`
  - `rust/crates/eket-server/src/auth.rs:16-20` — `Claims` (no scopes, just `sub` + `exp`)
  - `rust/crates/eket-server/src/auth.rs:40` — whitelist (`/health /ready /live /sse/events`)
  - `rust/crates/eket-server/src/hooks.rs:1-80` — Claude Code hook endpoints
  - `rust/crates/eket-server/src/ws.rs:1-2.3K` — WebSocket handler
- **Webhooks:**
  - `rust/crates/eket-core/src/webhook.rs:1-118` — module header + event enum
  - `rust/crates/eket-core/src/webhook.rs:24-67` — `WebhookEvent` union + as_str + parse_event
  - `rust/crates/eket-core/src/webhook.rs:117-150` — `ensure_webhook_tables`
  - `rust/crates/eket-core/src/webhook.rs:282-324` — SSRF URL validation
  - `rust/crates/eket-core/src/webhook.rs:379-411` — `add_url`
  - `rust/crates/eket-core/src/webhook.rs:620-625` — `retry_delay` (2^attempt min)
  - `rust/crates/eket-core/src/webhook.rs:627-708` — `dispatch_event` (fire-and-forget)
  - `rust/crates/eket-core/src/webhook.rs:711-719` — `start_retry_poller` (60s tick)
- **OpenClaw bridge:**
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:1-517` — 9-section design
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:18-30` — concept mapping table
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:90-117` — Phase 1 API gateway
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:139-155` — `openCLAWToEKET` translator
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:157-207` — Phase 2 dynamic agent loading
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:209-242` — Phase 3 message queue
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:243-285` — Phase 4 reinforced Claude Code
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:366-410` — worked example (create + assign)
  - `docs/architecture/OPENCLAW-DATAFLOW-DESIGN.md:1-777` — 6-section dataflow
  - `docs/architecture/OPENCLAW-DATAFLOW-DESIGN.md:9-99` — end-to-end 9-step data flow
- **State machine (for context):**
  - `docs/articles/06-master-slaver-protocol/en/article.md:1-535` — the protocol this article integrates against
- **Glossary:** `docs/articles/GLOSSARY.md:1-43`
- **Index:** `docs/articles/INDEX.md:1-70`
- **Next article in series:** [`12-multi-tool-support`](../../12-multi-tool-support/en/article.md) — the SDK-as-multi-tool-bridge story
