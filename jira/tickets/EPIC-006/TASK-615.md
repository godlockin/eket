# TASK-615: Heartbeat daemon for Agent health monitoring

**Epic**: EPIC-006 Context Overflow Defense System  
**Priority**: P1  
**Status**: 📋 Backlog  
**Estimate**: 6h  
**Category**: 🔧 Automation  

---

## Goal

Implement daemon to monitor agent execution health and auto-restart stalled sessions.

---

## Requirements

### Core Features
1. **Heartbeat tracking**: Detect agent activity via file system events
2. **Stall detection**: Trigger alert after N minutes of inactivity
3. **Auto-recovery**: Send SIGTERM + restart agent with context snapshot
4. **Logging**: Record all interventions to `logs/heartbeat/`

### Implementation Sketch
```typescript
// node/src/daemons/heartbeat.ts
export class HeartbeatDaemon {
  private lastActivity: Map<string, Date>;
  
  async monitor(agentId: string) {
    // Watch ACTIVE_CONTEXT updates
    // Trigger after 15min timeout
    // Execute recovery protocol
  }
}
```

---

## Acceptance Criteria

- [ ] Daemon detects stalled agent (>15min no activity)
- [ ] Auto-restart preserves context snapshot
- [ ] Logs intervention to structured file
- [ ] Unit tests for timeout logic
- [ ] Integration test: stall → restart → resume

---

## Context

Created during EPIC-006 Option A recovery. Not yet implemented - placeholder for future P1 work.

**Related**:
- TASK-607: Agent time-box (manual intervention)
- TASK-628: PR auto-review

---

**Last Updated**: 2026-05-11  
**Created By**: Master (recovery cleanup)
