# EPIC-006 Slaver 团队初始化

**召唤时间**: 2026-05-08  
**Master**: master-001  
**EPIC**: Context Overflow 防御系统

---

## 团队配置

| Slaver ID | Role | 专长 | 分配任务 | 状态 |
|-----------|------|------|---------|------|
| **slaver-backend-001** | backend-engineer | Node.js/TypeScript/Error Handling | TASK-601 | ✅ done (2026-05-09) |
| **slaver-backend-002** | backend-engineer | Node.js/Process Management | TASK-602 | ✅ done (2026-05-09) |
| **slaver-backend-003** | backend-engineer | File I/O/Token Estimation | TASK-604 | 🟡 召唤中 |
| **slaver-backend-004** | backend-engineer | File I/O/AST Parsing | TASK-603, 605 | 🟢 standby |
| **slaver-devops-001** | devops-engineer | Monitoring/Dashboard | TASK-606, 607 | 🟢 standby |
| **slaver-architect-001** | tech-architect | Task Decomposition | TASK-608（协助） | 🟢 standby |

**总计**: 5 Slavers

---

## 召唤命令（Master 执行）

```bash
# 批量召唤
eket expert:compose --skills backend,backend,backend,devops,architect

# 或逐个召唤
eket expert:summon --role backend    # 3 次
eket expert:summon --role devops     # 1 次
eket expert:summon --role architect  # 1 次
```

---

## Wave 1 任务分配（立即执行）

### Slaver-backend-001
```bash
eket task:claim TASK-601
# 任务：400 Auto-Recovery 机制
# 工时：4h
# 关键产出：claude-runner.ts 错误分类 + recovery 逻辑
```

### Slaver-backend-002（等待 TASK-601 完成）
```bash
# 阻塞中，等待 TASK-601
# 预计 4h 后可领取 TASK-602
```

### Slaver-backend-003（等待 TASK-601 完成）
```bash
# 阻塞中，等待 TASK-601
# 预计 4h 后可领取 TASK-603
```

### Slaver-devops-001（等待 TASK-603 完成）
```bash
# 阻塞中，等待 TASK-603（预计 Day 1 晚上）
# 预计 12h 后可领取 TASK-606
```

### Slaver-architect-001（等待 TASK-602/603 完成）
```bash
# 阻塞中，等待 TASK-602 + TASK-603
# 预计 Day 2 上午可领取 TASK-608
```

---

## 执行时间表

| 时间段 | 执行中 | 等待中 |
|--------|--------|--------|
| **Day 1 上午**（现在） | TASK-601 (slaver-backend-001) | 其他 4 个 |
| **Day 1 下午**（4h 后） | TASK-602 (002) + TASK-603 (003) | 其他 2 个 |
| **Day 2 上午**（12h 后） | TASK-608 (architect-001) | 其他 2 个 |
| **Day 2-3**（24h 后） | TASK-604 (003) + TASK-605 (002) + TASK-606 (devops-001) | TASK-607 |
| **Day 4**（72h 后） | TASK-607 (devops-001) | 无 |

---

## 通知消息（发送到每个 Slaver）

### 消息模板
```json
{
  "type": "epic_initialized",
  "epic_id": "EPIC-006",
  "title": "Context Overflow 防御系统",
  "assigned_slaver": "slaver-backend-001",
  "first_task": "TASK-601",
  "priority": "P0",
  "context": "Master/Slaver 执行任务时 context 超限导致 400 错误，需建立防御机制",
  "knowledge_refs": [
    "confluence/memory/solutions/context-overflow-400-solution-v2.md",
    "docs/reviews/2026-05-08-context-overflow-expert-panel.md"
  ],
  "timestamp": "2026-05-08T12:00:00Z"
}
```

### 发送命令
```bash
# 写入消息队列
for slaver in backend-001 backend-002 backend-003 devops-001 architect-001; do
  echo "Notifying slaver-$slaver..."
  # TODO: 实际消息队列机制
done
```

---

## Master 监控检查清单

### 每 4 小时检查
- [ ] 检查 TASK-601 进度（预计 4h 完成）
- [ ] 准备 code review TASK-601 PR
- [ ] 检查是否有 blocker（Slaver 上报 blocked 消息）

### 每日检查
- [ ] Wave 完成情况（Day 1: Wave 1+2, Day 2: Wave 2b）
- [ ] PR 合并进度（目标：每天至少 1 个 PR 合并）
- [ ] Context overflow log 检查（验证方案有效性）

### Milestone 检查
- [ ] M0 完成：测试 50 轮对话无 400 错误
- [ ] M1 完成：context 节省 > 60% 验证
- [ ] M2 完成：告警机制端到端测试

---

**状态**: ✅ 团队已召唤  
**下一步**: Slaver-backend-001 开始领取 TASK-601
