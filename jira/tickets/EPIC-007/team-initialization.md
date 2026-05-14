# EPIC-007 Slaver Team Initialization

**Epic**: EPIC-007 Context Overflow Defense System v2  
**Created**: 2026-05-14  
**Master**: Current session  

---

## Team Configuration

**Total Tickets**: 7  
**Total Estimate**: 23h  
**Team Size**: 4 agents  

### Agent Allocation

| Agent ID | Role | Assigned Tasks | Total Hours |
|----------|------|----------------|-------------|
| slaver-001 | devops | TASK-631, TASK-637 | 5h |
| slaver-002 | backend | TASK-632, TASK-633 | 7h |
| slaver-003 | backend | TASK-636 | 6h |
| slaver-004 | qa + fullstack | TASK-634, TASK-635 | 5h |

### Execution Order

**Phase 1**: Foundation (P0)  
```
slaver-001: TASK-631 (Shell Hook) [2h]
  └─> slaver-002: TASK-632 (Node Estimator) [4h]
```

**Phase 2**: Enhancement (P1)  
```
slaver-002: TASK-633 (Snapshot) [3h]  // parallel with 634
slaver-004: TASK-634 (Alert) [2h]     // parallel with 633
  └─> slaver-004: TASK-635 (Tests) [3h]
```

**Phase 3**: Optimization (P2)  
```
slaver-003: TASK-636 (Rust) [6h]
  └─> slaver-001: TASK-637 (Rust CI) [3h]
```

---

## Initialization Protocol

### For Each Slaver

1. **Read Identity**: `.eket/IDENTITY.md`
2. **Read Rules**: `template/docs/SLAVER-RULES.md`
3. **Claim Task**: `eket task:claim TASK-XXX`
4. **Analysis First**: Submit analysis report before coding
5. **Wait Approval**: Master reviews analysis → approved/rejected
6. **Implement**: Follow approved plan
7. **Submit PR**: Complete with tests
8. **Wait Review**: Master code review
9. **Iterate**: Fix review comments if any
10. **Done**: Move to next task

### Critical Instructions

**🔴 Red Lines**:
- ❌ No direct commit to main/testing/miao
- ❌ No skip analysis report
- ❌ No skip tests
- ❌ No amend commits (create new)

**✅ Best Practices**:
- ✅ All work in `feature/TASK-XXX` branch
- ✅ Test locally before PR
- ✅ Follow existing code style
- ✅ Update docs if needed

---

## Master Monitoring Plan

**Heart Beat**: Every 2h check progress  
**Intervention**: If Slaver stalled > 30min  
**Daily Sync**: Review all PRs at end of day  

---

## Context Defense (EPIC-006 Learning)

**Each Slaver Auto-Protected**:
- ✅ Layer 1: Auto-compact at 120K
- ✅ Layer 2: Tool filtering (Grep/Glob)
- ✅ Layer 3: Alert system (3 errors → report)
- ✅ Layer 4: Auto-report Master at risk
- ✅ Layer 5: Logging + snapshot

**Master Standby**:
- Monitor `.eket/inbox/context-risk-*.md`
- Ready to split task if overflow

---

## Success Criteria

**Milestone 1** (P0+P1, 14h):  
- ✅ All 5 tickets (631-635) merged to testing
- ✅ All tests passing
- ✅ System functional (monitor + alert + snapshot)

**Milestone 2** (P2, 9h):  
- ✅ Rust binary compiled (4 platforms)
- ✅ CI pipeline green
- ✅ Performance benchmark > 10x improvement

---

**Ready to Deploy Agents**: YES  
**Estimated Completion**: Milestone 1 in 2-3 days, Milestone 2 in +1 day
