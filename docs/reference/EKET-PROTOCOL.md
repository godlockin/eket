# EKET Agent Collaboration Protocol v1.0

**Version**: 1.0.0  
**Date**: 2026-04-07  
**Status**: Draft  
**Author**: EKET Framework Team

---

## Abstract

EKET (Efficient Knowledge-based Execution Toolkit) Protocol defines a universal standard for AI Agent collaboration across different tools and platforms. This protocol enables heterogeneous AI agents (Claude Code, OpenCLAW, Cursor, Windsurf, etc.) to work together on software development projects through a unified communication layer.

---

## 1. Overview

### 1.1 Design Goals

- **Tool Agnostic**: Support any AI tool that can implement the protocol
- **Mode Flexible**: Work in both online (HTTP Server) and offline (File-based) modes
- **Human-Centric**: End users only interact with Master agents
- **Scalable**: Support from single-agent to multi-agent teams
- **Auditable**: All state changes are traceable
- **Fault Tolerant**: Graceful degradation when components fail

### 1.2 Core Concepts

```
┌─────────────────────────────────────────────────────────┐
│  Agent Roles                                            │
│  ┌────────────┐         ┌──────────────────────────┐   │
│  │   Master   │────────→│  Slavers (1-N)           │   │
│  │            │         │  - Frontend Developer    │   │
│  │ Coordinates│         │  - Backend Developer     │   │
│  │ Reviews    │         │  - QA Engineer          │   │
│  │ Merges     │         │  - DevOps Engineer      │   │
│  └────────────┘         └──────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Roles**:
- **Master**: Coordinates work, reviews code, merges changes
- **Slaver**: Executes tasks, develops features, submits PRs

**Modes**:
- **HTTP Mode** (Online): Real-time communication via REST API + WebSocket
- **File Mode** (Offline): Asynchronous communication via Git + File System

---

## 2. Protocol Layers

### 2.1 Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│  Layer 4: Application Layer                        │
│  - Task Management                                  │
│  - PR Review Workflow                               │
│  - Progress Monitoring                              │
├─────────────────────────────────────────────────────┤
│  Layer 3: Message Layer                            │
│  - Message Queue                                    │
│  - Event Bus                                        │
│  - Notification System                              │
├─────────────────────────────────────────────────────┤
│  Layer 2: State Layer                              │
│  - Instance Registry                                │
│  - Task State Machine                               │
│  - Heartbeat Management                             │
├─────────────────────────────────────────────────────┤
│  Layer 1: Transport Layer                          │
│  - HTTP/REST (Online)                               │
│  - File System (Offline)                            │
│  - Git (Version Control)                            │
└─────────────────────────────────────────────────────┘
```

---

## 3. Agent Lifecycle

### 3.1 Agent Registration

#### 3.1.1 HTTP Mode

**Endpoint**: `POST /api/v1/agents/register`

**Request**:
```json
{
  "agent_type": "claude_code | openclaw | cursor | windsurf | custom",
  "agent_version": "1.0.0",
  "role": "master | slaver",
  "specialty": "frontend | backend | fullstack | qa | devops | designer",
  "capabilities": [
    "react",
    "typescript",
    "python"
  ],
  "metadata": {
    "user": "username",
    "machine": "hostname",
    "timezone": "Asia/Shanghai"
  }
}
```

**Response**:
```json
{
  "success": true,
  "instance_id": "slaver_frontend_20260407_143045_12345",
  "server_url": "http://localhost:8080",
  "websocket_url": "ws://localhost:8080/ws",
  "heartbeat_interval": 60,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### 3.1.2 File Mode

**Location**: `.eket/instances/{instance_id}/identity.yml`

**Format**:
```yaml
instance_id: slaver_frontend_20260407_143045_12345
agent_type: claude_code
agent_version: "1.0.0"
role: slaver
specialty: frontend
capabilities:
  - react
  - typescript
  - css
metadata:
  user: username
  machine: hostname
  timezone: Asia/Shanghai
created_at: "2026-04-07T14:30:45+08:00"
pid: 12345
ppid: 12344
```

**Heartbeat**: `.eket/instances/{instance_id}/heartbeat.txt`
```
1712476845
```
(Unix timestamp, updated every 60 seconds)

---

### 3.2 Heartbeat Mechanism

#### 3.2.1 HTTP Mode

**Endpoint**: `POST /api/v1/agents/{instance_id}/heartbeat`

**Request**:
```json
{
  "status": "active | idle | busy",
  "current_task": "FEAT-001",
  "progress": 0.75
}
```

**Response**:
```json
{
  "success": true,
  "server_time": "2026-04-07T14:35:00+08:00",
  "messages": [
    {
      "type": "task_assigned",
      "task_id": "FEAT-002"
    }
  ]
}
```

#### 3.2.2 File Mode

**Update**: Every 60 seconds
```bash
date +%s > .eket/instances/{instance_id}/heartbeat.txt
```

**Check**: Master reads heartbeat files
```bash
now=$(date +%s)
last=$(cat .eket/instances/{instance_id}/heartbeat.txt)
diff=$((now - last))

if [ $diff -lt 60 ]; then
  status="active"
elif [ $diff -lt 300 ]; then
  status="idle"
else
  status="stale"
fi
```

---

### 3.3 Agent Deregistration

#### 3.3.1 HTTP Mode

**Endpoint**: `DELETE /api/v1/agents/{instance_id}`

**Response**:
```json
{
  "success": true,
  "message": "Agent deregistered successfully"
}
```

#### 3.3.2 File Mode

**Action**: Remove instance directory
```bash
rm -rf .eket/instances/{instance_id}
```

**Cleanup**: Automatic cleanup after 24 hours of inactivity

---

## 4. Task Management

### 4.1 Task Structure

**Location**: `jira/tickets/{task_id}.md`

**Format**:
```markdown
# {Task Title}

**ID**: FEAT-001  
**Type**: feature | bugfix | task | test | doc  
**Priority**: P0 | P1 | P2 | P3  
**Status**: backlog | ready | in_progress | review | done  
**Assigned To**: {instance_id}  
**Created At**: 2026-04-07T14:00:00+08:00  
**Updated At**: 2026-04-07T14:30:00+08:00

## Description

Detailed description of the task...

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Technical Details

Implementation notes, API endpoints, database schema, etc.

## Tags

frontend, react, authentication

## Dependencies

- Requires: FEAT-000
- Blocks: FEAT-002

## Metadata

```yaml
estimate: 8h
complexity: medium
tags:
  - frontend
  - react
  - authentication
```
```

---

### 4.2 Task State Machine

```
┌─────────┐
│ backlog │
└────┬────┘
     │
     ▼
┌─────────┐
│  ready  │◄────┐
└────┬────┘     │
     │          │
     ▼          │
┌──────────────┐│
│ in_progress  ││
└────┬─────────┘│
     │          │
     ▼          │
┌─────────┐    │
│ review  │    │
└────┬────┘    │
     │         │
     ├─────────┘ (changes requested)
     │
     ▼
┌─────────┐
│  done   │
└─────────┘
```

**States**:
- `backlog`: Task created, not ready to start
- `ready`: Task ready to be claimed
- `in_progress`: Task being worked on
- `review`: PR submitted, awaiting review
- `done`: Task completed and merged

---

### 4.3 Task Operations

#### 4.3.1 List Available Tasks

**HTTP Mode**:
```http
GET /api/v1/tasks?status=ready&specialty=frontend

Response:
{
  "success": true,
  "tasks": [
    {
      "id": "FEAT-001",
      "title": "Implement user login",
      "priority": "P0",
      "status": "ready",
      "estimate": "8h",
      "tags": ["frontend", "react"]
    }
  ]
}
```

**File Mode**:
```bash
find jira/tickets -name "*.md" -exec grep -l "^status: ready" {} \;
```

---

#### 4.3.2 Claim Task

**HTTP Mode**:
```http
POST /api/v1/tasks/{task_id}/claim

Request:
{
  "instance_id": "slaver_frontend_001"
}

Response:
{
  "success": true,
  "task": { /* full task details */ }
}
```

**File Mode**:
```bash
# Update task file
sed -i 's/^status:.*/status: in_progress/' jira/tickets/{task_id}.md
sed -i 's/^assigned_to:.*/assigned_to: {instance_id}/' jira/tickets/{task_id}.md

# Record in instance
echo "{task_id}" >> .eket/instances/{instance_id}/claimed_tasks.txt
```

---

#### 4.3.3 Update Task Status

**HTTP Mode**:
```http
PATCH /api/v1/tasks/{task_id}

Request:
{
  "status": "review",
  "progress": 1.0,
  "notes": "PR submitted"
}

Response:
{
  "success": true,
  "task": { /* updated task */ }
}
```

**File Mode**:
```bash
sed -i 's/^status:.*/status: review/' jira/tickets/{task_id}.md
sed -i 's/^updated_at:.*/updated_at: '$(date -Iseconds)'/' jira/tickets/{task_id}.md
```

---

## 5. Message Protocol

### 5.1 Message Structure

```json
{
  "id": "msg_20260407_143045_12345",
  "from": "slaver_frontend_001",
  "to": "master",
  "type": "pr_review_request | task_claimed | help_request | status_update",
  "priority": "low | normal | high | critical",
  "timestamp": "2026-04-07T14:30:45+08:00",
  "payload": {
    // Type-specific data
  },
  "correlation_id": "msg_20260407_140000_11111",  // Optional: reply to
  "ttl": 3600  // Time to live in seconds
}
```

---

### 5.2 Message Types

#### 5.2.1 PR Review Request

**Type**: `pr_review_request`

**Payload**:
```json
{
  "task_id": "FEAT-001",
  "branch": "feature/FEAT-001-user-login",
  "pr_url": "https://github.com/org/repo/pull/42",
  "description": "Implemented user login with email/password",
  "changes_summary": {
    "files_changed": 12,
    "insertions": 450,
    "deletions": 23
  },
  "test_status": "passed",
  "test_coverage": 0.85
}
```

---

#### 5.2.2 Task Claimed

**Type**: `task_claimed`

**Payload**:
```json
{
  "task_id": "FEAT-001",
  "estimated_completion": "2026-04-08T18:00:00+08:00"
}
```

---

#### 5.2.3 Help Request

**Type**: `help_request`

**Payload**:
```json
{
  "task_id": "FEAT-001",
  "issue": "blocked | clarification_needed | conflict",
  "description": "Need clarification on authentication flow",
  "urgency": "blocking | non-blocking"
}
```

---

#### 5.2.4 Status Update

**Type**: `status_update`

**Payload**:
```json
{
  "task_id": "FEAT-001",
  "status": "in_progress",
  "progress": 0.65,
  "eta": "2026-04-08T18:00:00+08:00",
  "notes": "Completed login UI, working on API integration"
}
```

---

### 5.3 Message Delivery

#### 5.3.1 HTTP Mode

**Send Message**:
```http
POST /api/v1/messages

Request:
{
  "from": "slaver_001",
  "to": "master",
  "type": "pr_review_request",
  "payload": { /* ... */ }
}

Response:
{
  "success": true,
  "message_id": "msg_20260407_143045_12345",
  "delivered_at": "2026-04-07T14:30:45+08:00"
}
```

**Receive Messages**:
```http
GET /api/v1/agents/{instance_id}/messages?since=1712476845

Response:
{
  "success": true,
  "messages": [ /* array of messages */ ],
  "has_more": false
}
```

**WebSocket** (Real-time):
```javascript
ws.send(JSON.stringify({
  type: "message",
  data: { /* message object */ }
}));

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  handleMessage(message);
};
```

---

#### 5.3.2 File Mode

**Send Message**:
```bash
cat > .eket/messages/inbox/msg_$(date +%s)_$$.json <<EOF
{
  "id": "msg_$(date +%s)_$$",
  "from": "slaver_001",
  "to": "master",
  "type": "pr_review_request",
  "timestamp": "$(date -Iseconds)",
  "payload": { /* ... */ }
}
EOF
```

**Receive Messages**:
```bash
# Master polls inbox
for msg in .eket/messages/inbox/*.json; do
  [ ! -f "$msg" ] && continue
  
  # Process message
  process_message "$msg"
  
  # Move to processed
  mv "$msg" .eket/messages/processed/
done
```

---

## 6. PR Review Workflow

### 6.1 PR Submission

#### 6.1.1 Create PR Request

**File**: `outbox/review_requests/pr-{task_id}.md`

```markdown
# PR 请求：{task_id}

**提交者**: {instance_id}  
**分支**: feature/{task_id}-{description}  
**目标分支**: main  
**状态**: pending_review  
**创建时间**: 2026-04-07T14:30:00+08:00

---

## 变更摘要

- Added login page component
- Implemented authentication API
- Added unit tests

## 变更详情

\`\`\`
 src/components/Login.tsx       | 150 +++++++++++
 src/api/auth.ts                |  80 ++++++
 tests/Login.test.tsx           | 120 +++++++++
 3 files changed, 350 insertions(+)
\`\`\`

## 测试情况

- [x] 单元测试通过
- [x] 集成测试通过
- [x] 手动测试完成

## 验收标准检查

- [x] 用户可以使用邮箱密码登录
- [x] 错误提示正确显示
- [x] Token 正确存储

---

**状态**: pending_review
```

---

### 6.2 PR Review Process

#### 6.2.1 Master Reviews PR

**HTTP Mode**:
```http
POST /api/v1/prs/{task_id}/review

Request:
{
  "reviewer": "master_001",
  "status": "approved | changes_requested | rejected",
  "comments": [
    {
      "file": "src/components/Login.tsx",
      "line": 42,
      "comment": "Consider extracting this to a custom hook"
    }
  ],
  "summary": "Overall looks good, minor improvements needed"
}

Response:
{
  "success": true,
  "pr": { /* updated PR */ }
}
```

**File Mode**:
```markdown
# Append to PR file

---

## Master Review (2026-04-07T15:00:00+08:00)

**Reviewer**: master_001  
**Status**: changes_requested

### Comments

1. **src/components/Login.tsx:42**
   Consider extracting this to a custom hook

2. **src/api/auth.ts:25**
   Add error handling for network failures

### Summary

Overall looks good, minor improvements needed.

---

**Updated Status**: changes_requested
```

---

### 6.3 PR Merge

**HTTP Mode**:
```http
POST /api/v1/prs/{task_id}/merge

Request:
{
  "merger": "master_001",
  "target_branch": "main",
  "squash": false
}

Response:
{
  "success": true,
  "merge_commit": "abc123def456",
  "merged_at": "2026-04-07T16:00:00+08:00"
}
```

**File Mode**:
```bash
# Master performs git merge
git checkout main
git merge --no-ff feature/FEAT-001-user-login
git push origin main

# Update task status
sed -i 's/^status:.*/status: done/' jira/tickets/FEAT-001.md

# Archive PR request
mv outbox/review_requests/pr-FEAT-001.md \
   outbox/review_requests/archived/
```

---

## 7. Data Formats

### 7.1 YAML Format

Used for:
- Instance identity
- Configuration files
- Task metadata

**Example**:
```yaml
instance_id: slaver_frontend_001
role: slaver
specialty: frontend
capabilities:
  - react
  - typescript
created_at: "2026-04-07T14:30:00+08:00"
```

---

### 7.2 JSON Format

Used for:
- HTTP API requests/responses
- Messages
- Runtime state

**Example**:
```json
{
  "instance_id": "slaver_frontend_001",
  "status": "active",
  "current_task": "FEAT-001",
  "progress": 0.75
}
```

---

### 7.3 Markdown Format

Used for:
- Tasks (Jira tickets)
- PR requests
- Documentation

**Example**: See Task Structure section

---

## 8. Error Handling

### 8.1 HTTP Error Codes

```
200 OK                  - Success
201 Created             - Resource created
400 Bad Request         - Invalid request
401 Unauthorized        - Missing/invalid authentication
403 Forbidden           - Insufficient permissions
404 Not Found           - Resource not found
409 Conflict            - Resource conflict (e.g., task already claimed)
429 Too Many Requests   - Rate limit exceeded
500 Internal Server Error - Server error
503 Service Unavailable - Server temporarily unavailable
```

---

### 8.2 Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "TASK_ALREADY_CLAIMED",
    "message": "Task FEAT-001 is already claimed by another agent",
    "details": {
      "task_id": "FEAT-001",
      "claimed_by": "slaver_backend_002",
      "claimed_at": "2026-04-07T14:00:00+08:00"
    }
  }
}
```

---

### 8.3 Retry Policy

**Recommended**:
- Exponential backoff: 1s, 2s, 4s, 8s, 16s
- Max retries: 5
- Timeout: 30s for normal requests, 300s for long operations

**Example**:
```python
def retry_with_backoff(func, max_retries=5):
    for i in range(max_retries):
        try:
            return func()
        except Exception as e:
            if i == max_retries - 1:
                raise
            wait_time = 2 ** i
            time.sleep(wait_time)
```

---

## 9. Security

### 9.1 Authentication

**HTTP Mode**:
- JWT tokens returned on registration
- Include in `Authorization: Bearer {token}` header
- Tokens expire after 24 hours
- Refresh endpoint: `POST /api/v1/auth/refresh`

**File Mode**:
- File system permissions (chmod 600 for sensitive files)
- Git authentication (SSH keys or HTTPS tokens)

---

### 9.2 Authorization

**Role-based**:
- Master: Can review PRs, merge code, assign tasks
- Slaver: Can claim tasks, submit PRs, update own status

**Validation**:
```json
{
  "instance_id": "slaver_001",
  "role": "slaver",
  "action": "merge_pr",
  "allowed": false,
  "reason": "Slaver role cannot merge PRs"
}
```

---

### 9.3 Data Integrity

- **Checksums**: SHA-256 for file integrity
- **Signatures**: Optional GPG signing for commits
- **Validation**: JSON Schema validation for all messages

---

## 10. Performance Considerations

### 10.1 Heartbeat Frequency

- Default: 60 seconds
- Active work: 30 seconds
- Idle: 120 seconds
- Max allowed: 300 seconds (5 minutes)

---

### 10.2 Message Queue Limits

- Max message size: 1 MB
- Max queue depth: 1000 messages
- Message TTL: 1 hour (default)
- Batch size: 50 messages per request

---

### 10.3 File Mode Optimization

- **Git**: Commit batches instead of per-file
- **Polling**: Exponential backoff when no changes
- **Caching**: Cache task list, update on interval

---

## 11. Versioning

### 11.1 Protocol Version

**Format**: `MAJOR.MINOR.PATCH`

- `MAJOR`: Incompatible changes
- `MINOR`: Backward-compatible features
- `PATCH`: Backward-compatible bug fixes

**Current**: `1.0.0`

---

### 11.2 Version Negotiation

**Request**:
```http
POST /api/v1/agents/register

{
  "protocol_version": "1.0.0"
}
```

**Response**:
```json
{
  "server_protocol_version": "1.0.0",
  "compatible": true
}
```

If incompatible:
```json
{
  "server_protocol_version": "2.0.0",
  "compatible": false,
  "message": "Please upgrade to protocol v2.0.0"
}
```

---

## 12. Extensions

### 12.1 Custom Agent Types

Agents can define custom types:
```json
{
  "agent_type": "custom_ai_tool",
  "agent_version": "1.0.0",
  "custom_fields": {
    "model": "gpt-4",
    "provider": "openai"
  }
}
```

---

### 12.2 Custom Message Types

Agents can define custom message types:
```json
{
  "type": "custom:model_training_complete",
  "payload": {
    "model_id": "model_001",
    "accuracy": 0.95
  }
}
```

---

## 13. Compliance and Standards

### 13.1 JSON Schema

All JSON messages must validate against provided schemas:
- Agent registration schema
- Message schema
- Task schema
- PR schema

**Available**: `docs/protocol/schemas/`

---

### 13.2 OpenAPI Specification

Full OpenAPI 3.0 specification available at:
- `docs/protocol/openapi.yaml`
- Live docs: `http://localhost:8080/api/docs`

---

## Appendices

### A. Complete HTTP API Reference

See: `docs/protocol/HTTP_API.md`

### B. File Structure Reference

See: `docs/protocol/FILE_STRUCTURE.md`

### C. Example Implementations

See: `docs/protocol/examples/`

### D. Migration Guide

See: `docs/protocol/MIGRATION.md`

---

## Changelog

### v1.0.0 (2026-04-07)
- Initial protocol specification
- HTTP and File modes defined
- Core workflows documented

---

**Maintainers**: EKET Framework Team  
**License**: MIT  
**Repository**: https://github.com/eket-framework/protocol
