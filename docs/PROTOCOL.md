# EKET Protocol Specification v1.0

> Language-agnostic. Any process (Bash script, Node.js daemon, Python agent, human-operated terminal) that implements this spec is a valid EKET participant.

---

## Overview

| Field | Value |
|-------|-------|
| Protocol Version | 1.0 |
| Framework Version | EKET 2.9.x |
| State persistence | File system (Git-tracked) |
| Optional acceleration | Redis pub/sub, SQLite |

### Repository Roles

| Repo alias | Default dir name | Contains |
|------------|-----------------|---------|
| `repo-confluence` | `repo-confluence/` | Team knowledge base, architecture docs, ADRs, retrospectives, Skills library |
| `repo-jira` | `repo-jira/` | Ticket files, EPIC directories, task state machine |
| `repo-code` | `repo-code/` | All code deliverables, branches, CI config |

The three repos are **physically separate Git repositories** with independent permissions and independent clone URLs. The monorepo you cloned to read this file is the **framework template** — see [THREE-REPO-DEPLOYMENT.md](THREE-REPO-DEPLOYMENT.md) for real deployment.

---

## 1. Repository Layout (Three-Repo Model)

### 1.1 repo-confluence layout

```
repo-confluence/
├── architecture/          # System design, C4 diagrams, ADRs
├── memory/                # Shared persistent knowledge (cross-ticket learnings)
│   ├── global/            # Language/framework-agnostic lessons
│   └── project/           # Project-specific patterns, gotchas
├── skills/                # Reusable agent skill definitions
├── retrospectives/        # Sprint/EPIC retros
└── team/                  # Agent profiles, onboarding docs
```

### 1.2 repo-jira layout

```
repo-jira/
├── epics/
│   └── EPIC-001/
│       ├── EPIC-001.md          # EPIC metadata + acceptance criteria
│       └── tickets/
│           ├── TICKET-001.md
│           └── TICKET-002.md
├── backlog/                     # Unassigned tickets
├── inbox/
│   ├── human_feedback/          # P0/P1 messages from humans
│   └── agent_feedback/          # Agent-to-agent messages (fallback if no Redis)
└── .eket/
    ├── config.yml               # Repo path config
    ├── heartbeat/               # One file per agent
    ├── mailbox/                 # One file per agent
    └── queue/                   # File-based message queue channels
```

### 1.3 repo-code layout

```
repo-code/
├── src/                   # Application source
├── tests/                 # Test suites
├── .github/               # CI/CD workflows
└── (project-specific)
```

### 1.4 Initialization

```bash
bash scripts/init-three-repos.sh \
  --confluence /path/to/repo-confluence \
  --jira       /path/to/repo-jira \
  --code       /path/to/repo-code
```

Cross-repo paths are resolved via `.eket/config.yml` (see §1 of [THREE-REPO-DEPLOYMENT.md](THREE-REPO-DEPLOYMENT.md)).

---

## 2. Participant Roles

### 2.1 Master

**Can be**: human operator or AI agent (e.g., Claude, GPT-4o, Gemini)

**Responsibilities**:
- Ingest raw requirements; run Expert Panel analysis for complex changes
- Decompose EPICs into tickets with fully-specified acceptance criteria
- Initialize Slaver agents (write `IDENTITY.md`, seed mailbox)
- Review PRs and merge to protected branches
- Triage blocked tickets; escalate cross-Slaver dependencies
- Write EPIC retro after all tickets close

**Hard constraints**:
- NEVER write code, config, or tests directly
- NEVER self-review a PR (a different agent or human must approve)
- NEVER merge without CI green
- NEVER leave tasks sitting in backlog after decomposition — initialize Slavers immediately
- NEVER skip the Expert Panel step on: new requirements, architectural changes, refactors, production incidents

**Identity file** (`.eket/IDENTITY.md`):
```yaml
agent_id: master-001
role: master
model: claude-opus-4-5          # or "human"
started_at: 2026-04-21T09:00:00Z
confluence_root: /abs/path/to/repo-confluence
jira_root: /abs/path/to/repo-jira
code_root: /abs/path/to/repo-code
```

### 2.2 Slaver

**Can be**: human engineer or AI agent — the protocol is identical for both

**Responsibilities**:
- Claim a ticket (transition status `ready` → `in_progress`, write `assignee`)
- Write Analysis Report before writing any code
- Implement, write tests, commit to feature branch in `repo-code`
- Open PR, pass CI, request review via mailbox `TaskCompleted`
- After merge: write retro notes in ticket + promote learnings to `repo-confluence/memory/`

**Hard constraints**:
- NEVER modify acceptance criteria or priority after claiming
- NEVER help another Slaver directly — escalate to Master
- NEVER review your own PR
- Reading 5+ files with no write operation = analysis paralysis → write code or send `BLOCKED` message
- NEVER mark ticket `done` before CI is green and PR is merged

**Identity file** (`.eket/IDENTITY.md`):
```yaml
agent_id: slaver-backend-001
role: slaver
profile: backend_dev
model: gemini-2.0-flash          # or "human"
master_id: master-001
started_at: 2026-04-21T09:05:00Z
confluence_root: /abs/path/to/repo-confluence
jira_root: /abs/path/to/repo-jira
code_root: /abs/path/to/repo-code
```

---

## 3. Ticket Schema

Tickets are Markdown files with YAML frontmatter. Stored in `repo-jira/`.

### 3.1 Frontmatter (YAML)

```yaml
---
id: TICKET-042
type: feature          # feature | bug | chore | spike | refactor
priority: P1           # P0 | P1 | P2 | P3
status: ready          # backlog | ready | in_progress | review | done | blocked | cancelled
created: 2026-04-21T10:00:00Z
updated: 2026-04-21T14:23:00Z
assignee: slaver-backend-001   # empty string if unassigned
blocked_by:
  - TICKET-040
  - TICKET-041
epic: EPIC-007
estimated_hours: 4
actual_hours: ~        # filled on completion
---
```

### 3.2 Status Enum

| Status | Meaning | Who transitions |
|--------|---------|----------------|
| `backlog` | Created, not yet ready for pickup | Master |
| `ready` | Acceptance criteria complete, dependencies met | Master |
| `in_progress` | Slaver claimed and working | Slaver (on claim) |
| `review` | PR open, awaiting review | Slaver (on PR open) |
| `done` | PR merged, CI green | Master (on merge) |
| `blocked` | Slaver hit unresolvable dependency | Slaver |
| `cancelled` | Scope cut or superseded | Master |

### 3.3 Required Sections

Every ticket MUST contain all six sections:

```markdown
## Background
<!-- Why this work exists. Context, user impact, link to EPIC. -->

## Acceptance Criteria
<!-- Filled by Master. Immutable after Slaver claims ticket. -->
- [ ] Criterion 1 (testable, specific)
- [ ] Criterion 2

## Dependencies
<!-- Other tickets, external services, environment requirements. -->

## Implementation Notes
<!-- Filled by Slaver. Analysis report, design decisions, file list. -->

## Test Results
<!-- Filled by Slaver. CI run URL, test coverage delta, manual test steps. -->

## Retro
<!-- Filled by Slaver post-merge. What went well, what to improve, lessons for confluence/memory/. -->
```

---

## 4. Mailbox Message Schema

Location: `repo-jira/.eket/mailbox/<agent_id>.json`

Each file is a JSON array of message objects. Append-only by sender; reader marks `read: true`.

```json
{
  "id": "msg-550e8400-e29b-41d4-a716-446655440000",
  "from": "master-001",
  "to": "slaver-backend-001",
  "type": "TaskAssigned",
  "payload": {
    "ticket_id": "TICKET-042",
    "ticket_path": "epics/EPIC-007/tickets/TICKET-042.md",
    "priority": "P1",
    "deadline_hint": "2026-04-22T18:00:00Z"
  },
  "timestamp": "2026-04-21T10:01:00Z",
  "read": false
}
```

### 4.1 Message Type Enum

| Type | Direction | Payload fields |
|------|-----------|---------------|
| `TaskAssigned` | Master → Slaver | `ticket_id`, `ticket_path`, `priority`, `deadline_hint?` |
| `TaskCompleted` | Slaver → Master | `ticket_id`, `pr_url`, `ci_status`, `notes?` |
| `AgentIdle` | Slaver → Master | `agent_id`, `available_profiles` |
| `Blocked` | Slaver → Master | `ticket_id`, `blocker_description`, `blocked_by_tickets?` |
| `Shutdown` | Master → Any | `reason`, `save_state: bool` |
| `PermissionRequest` | Slaver → Master | `ticket_id`, `resource`, `justification` |
| `Custom` | Any → Any | `(arbitrary object)` |

---

## 5. Heartbeat Schema

Location: `repo-jira/.eket/heartbeat/<agent_id>.json`

Written by each agent every 30 seconds. Master uses staleness (>90s) to detect dead agents.

```json
{
  "agent_id": "slaver-backend-001",
  "role": "slaver",
  "status": "busy",
  "current_task_id": "TICKET-042",
  "last_seen": "2026-04-21T14:23:45Z",
  "skills": ["nodejs", "typescript", "postgresql", "docker"],
  "uptime_seconds": 5421,
  "tickets_completed_session": 3
}
```

### 5.1 Status Enum

| Status | Meaning |
|--------|---------|
| `idle` | No current task, ready to receive |
| `busy` | Working on `current_task_id` |
| `offline` | Graceful shutdown (last heartbeat before exit) |

---

## 6. Queue Message Schema

Location: `repo-jira/.eket/queue/<channel>/<id>.json`

Used for broadcast events and async pipelines. Channel examples: `task-events`, `review-requests`, `ci-results`.

```json
{
  "id": "q-7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "channel": "task-events",
  "payload": {
    "event": "ticket_status_changed",
    "ticket_id": "TICKET-042",
    "from_status": "in_progress",
    "to_status": "review",
    "agent_id": "slaver-backend-001"
  },
  "created_at": "2026-04-21T14:20:00Z",
  "processed": false,
  "processed_by": null,
  "processed_at": null
}
```

Queue consumers set `processed: true` and write `processed_by` (their `agent_id`) and `processed_at` (ISO 8601) atomically via file rename.

---

## 7. Communication Patterns

### 7.1 Master → Slaver: Task Assignment

```
Master writes TaskAssigned to repo-jira/.eket/mailbox/slaver-backend-001.json
Slaver polls mailbox every 5s (file watch or cron)
Slaver reads message, sets read: true, transitions ticket to in_progress
Slaver writes heartbeat with status: busy, current_task_id: TICKET-042
```

### 7.2 Slaver → Master: Task Completion

```
Slaver opens PR in repo-code
Slaver transitions ticket to review
Slaver writes TaskCompleted to repo-jira/.eket/mailbox/master-001.json
Master reviews PR, merges, transitions ticket to done
Master writes next TaskAssigned or leaves Slaver idle
```

### 7.3 Broadcast: File Queue

```
Any agent writes to repo-jira/.eket/queue/<channel>/<uuid>.json
Interested consumers poll channel directory
Consumer claims message by atomically renaming to <uuid>.processing.json
Consumer processes, then writes processed: true
```

### 7.4 Redis pub/sub (Level 3)

When `EKET_REDIS_HOST` is set, agents additionally publish to Redis channel `eket:<channel>` for real-time delivery. File queue remains the authoritative store — Redis is acceleration only.

### 7.5 Real-Time Dashboard: SSE

Node.js gateway exposes `GET /api/v1/events` as Server-Sent Events. Clients receive ticket status changes, agent heartbeats, and queue events streamed in real time. Falls back to polling `/.eket/heartbeat/` if gateway is not running.

---

## 8. State Machine: Ticket Lifecycle

```
                  ┌─────────┐
          create  │ backlog  │
  ──────────────► │         │
                  └────┬────┘
               ready   │  (Master sets ACs complete)
                  ┌────▼────┐
                  │  ready  │◄──── unblock (Master)
                  └────┬────┘
               claim   │  (Slaver claims, writes assignee)
                  ┌────▼────────┐
                  │ in_progress │
                  └────┬──┬─────┘
          PR open  │   │  │ hit blocker
                   │   │  └──────────────► blocked ──► ready (on unblock)
                   │   │ cancelled
                   │   └──────────────────► cancelled
              ┌────▼────┐
              │ review  │
              └────┬────┘
        CI+merge   │  (Master merges)
              ┌────▼────┐
              │  done   │
              └─────────┘
```

**Transition rules**:
- Only Master may set: `backlog→ready`, `review→done`, `*→cancelled`, `blocked→ready`
- Only Slaver may set: `ready→in_progress`, `in_progress→review`, `in_progress→blocked`
- Tickets in `done` are immutable

---

## 9. Implementing a Slaver in Any Language

A minimal valid EKET Slaver must:

### Step 1 — Read identity
```bash
# Bash
AGENT_ID=$(grep 'agent_id:' .eket/IDENTITY.md | awk '{print $2}')
JIRA_ROOT=$(grep 'jira_root:' .eket/IDENTITY.md | awk '{print $2}')
MASTER_ID=$(grep 'master_id:' .eket/IDENTITY.md | awk '{print $2}')
```

### Step 2 — Poll mailbox for TaskAssigned
```python
# Python example
import json, time, os

mailbox_path = f"{jira_root}/.eket/mailbox/{agent_id}.json"

def poll_mailbox():
    if not os.path.exists(mailbox_path):
        return []
    with open(mailbox_path) as f:
        messages = json.load(f)
    return [m for m in messages if not m["read"] and m["type"] == "TaskAssigned"]
```

### Step 3 — Transition ticket to `in_progress`
Open the ticket file, update YAML frontmatter: `status: in_progress`, `assignee: <agent_id>`, `updated: <now>`.

### Step 4 — Do work, write to repo-code
Implement on a feature branch: `feature/<ticket-id>-<short-description>`. Run tests. Commit.

### Step 5 — Transition to `review`, send TaskCompleted
```python
# Update ticket status to review
update_ticket_status(ticket_id, "review")

# Send message to master
send_mailbox_message(master_id, {
    "type": "TaskCompleted",
    "payload": {
        "ticket_id": ticket_id,
        "pr_url": "https://github.com/org/repo-code/pull/42",
        "ci_status": "passing"
    }
})
```

### Step 6 — Send heartbeat every 30 seconds
```bash
# Bash heartbeat loop (run in background)
while true; do
  cat > "$JIRA_ROOT/.eket/heartbeat/$AGENT_ID.json" << EOF
{
  "agent_id": "$AGENT_ID",
  "role": "slaver",
  "status": "$CURRENT_STATUS",
  "current_task_id": "$CURRENT_TICKET",
  "last_seen": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "skills": ["bash", "git"]
}
EOF
  sleep 30
done
```

That's the complete minimal implementation. Any language, any runtime — these six steps make you a valid EKET participant.

## §10 Submodule 版本指针协议

**原则**：Slaver 只推自己所在的子仓库；主项目指针由 Master 统一更新。

### Slaver 工作流
1. 在子仓库（通常 jira 或 code）完成提交并 push
2. **不需要**回到主项目更新指针

### Master 工作流
1. 定期（每个 sprint 末 或 重要里程碑后）更新主项目指针
2. 操作：
   ```bash
   cd {project}
   git submodule update --remote --merge
   git add {project}-confluence {project}-jira {project}-code
   git commit -m "chore: 更新 submodule 指针至最新"
   git push origin main
   ```

### 为何不让 Slaver 更新指针
- 主项目指针更新若与其他 Slaver 并发，容易产生冲突
- Master 作为中央协调者，统一决定"当前稳定版本"指向哪个 commit
