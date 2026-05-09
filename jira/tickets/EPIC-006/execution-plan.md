# EPIC-006 Execution Plan

**创建时间**: 2026-05-08  
**Master**: master-001  
**预计完成**: 2026-05-12（4 days）

---

## Milestone Timeline

```
Day 1 (2026-05-08)
├─ M0-Emergency Part 1: TASK-601/602/603
│  └─ 交付：400 auto-recovery + context tracker + logging
│
Day 2 (2026-05-09)
├─ M0-Emergency Part 2: TASK-608
│  └─ 交付：Slaver 主动风险上报 + Master 拆卡能力
│
Day 3-4 (2026-05-10～11)
├─ M1-Optimization: TASK-604/605/606
│  └─ 交付：smart reader + tool filter + dashboard
│
Day 5 (2026-05-12)
└─ M2-Monitoring: TASK-607
   └─ 交付：alert manager
```

---

## Wave 1: Emergency Defense（Day 1 上午）

### 并行执行

**Slaver A** (backend-engineer):
```bash
eket task:claim TASK-601  # 400 Auto-Recovery
# 预计：4h
# 产出：claude-runner.ts 修改 + 3 种错误处理策略
```

**Slaver B** (backend-engineer):
```bash
# 等待 TASK-601 完成后
eket task:claim TASK-602  # Context Tracker
# 预计：5h
# 产出：context-tracker.ts 新增 + 动态 compact 触发
```

### 同步点
- TASK-601 完成 → Slaver B 开始 TASK-602
- TASK-601/602 都完成 → 任一 Slaver 开始 TASK-603

---

## Wave 2: Logging Infrastructure + Slaver Risk Management（Day 1 下午 + Day 2）

**Wave 2a（Day 1 下午）**:

**Slaver A 或 B**:
```bash
eket task:claim TASK-603  # Error Logging + Snapshot
# 预计：3h
# 产出：context-logger.ts + logs:context-overflow 命令
```

**Wave 2b（Day 2，依赖 TASK-602/603）**:

**Slaver C** (backend-engineer + tech-architect):
```bash
eket task:claim TASK-608  # Slaver 主动风险上报
# 预计：4h
# 产出：slaver-context-monitor.ts + task-split 命令
```

**阻塞**: Wave 3 必须等 TASK-603 完成

---

## Wave 3: Source Optimization（Day 2-3，并行）

### 3 个独立 tasks，可并行执行

**Slaver A** (backend-engineer):
```bash
eket task:claim TASK-604  # Smart File Reader
# 预计：6h
# 产出：smart-reader.ts + file-structure-analyzer.ts
```

**Slaver B** (backend-engineer):
```bash
eket task:claim TASK-605  # Tool Output Filtering
# 预计：4h
# 产出：tool-output-filter.ts
```

**Slaver C** (devops-engineer):
```bash
eket task:claim TASK-606  # Context Health Dashboard
# 预计：5h
# 产出：dashboard.ts 修改 + context-stats.ts
```

---

## Wave 4: Monitoring（Day 4）

**Slaver A** (devops-engineer):
```bash
eket task:claim TASK-607  # Alert Manager
# 预计：3h
# 产出：alert-manager.ts + 告警文件生成逻辑
```

---

## 团队配置

### 所需 Slavers

| Role | 数量 | 任务分配 |
|------|------|---------|
| backend-engineer | 3 | TASK-601/602/603/604/605/608 |
| devops-engineer | 1 | TASK-606/607 |
| tech-architect | 1 | TASK-608（协助拆卡分析） |

**总计**: 4-5 Slavers（backend 可复用）

### 召唤命令

```bash
# Master 执行
eket expert:summon --role backend    # 召唤 3 个
eket expert:summon --role devops     # 召唤 1 个
eket expert:summon --role architect  # 召唤 1 个（TASK-608 专用）

# 或批量
eket expert:compose --skills backend,backend,backend,devops,architect
```

---

## 集成测试计划

### Phase 1 测试（M0 完成后）

**场景**: 模拟 context overflow
```bash
# 1. 启动长对话（50+ 轮）
for i in {1..50}; do
  eket task:analyze --prompt "Analyze iteration $i"
done

# 2. 验证
cat .eket/logs/context-overflow.log
# 预期：至少 1 次 compact_retry_success 或 nuclear_restart
```

### Phase 2 测试（M1 完成后）

**场景**: Slaver 深度分析任务
```bash
# 1. 领取复杂任务
eket task:claim TASK-TEST-DEEP-ANALYSIS

# 2. 触发大量 Read
for file in node/src/**/*.ts; do
  Read "$file"
done

# 3. 对比 context 节省
eket logs:context-overflow --stats
# 预期：savings_ratio > 60%
```

### Phase 3 测试（M2 完成后）

**场景**: 连续错误告警
```bash
# 模拟 3 次 400 错误
# 验证告警文件生成
ls inbox/human_feedback/[ALERT]*
```

---

## 风险监控

### 每日检查

- [ ] 400 错误次数（目标：0）
- [ ] Recovery 成功率（目标：>90%）
- [ ] Slaver 阻塞情况（目标：无 >1h 阻塞）

### 每 Milestone 检查

- [ ] 单元测试通过率（目标：100%）
- [ ] 集成测试通过（目标：全绿）
- [ ] Code review 完成（目标：无 blocker）

---

## Rollback Plan

### 全局 Rollback
```bash
# 如果 EPIC-006 整体失效
git revert <EPIC-006-merge-commit>
```

### 分阶段 Rollback
- **M0 rollback**: 保留 logging（603），revert recovery（601/602）
- **M1 rollback**: 保留 M0，revert optimization（604/605/606）
- **M2 rollback**: 仅 revert alert（607）

---

**状态**: ✅ 计划完成  
**下一步**: Master 召唤 Slaver 团队（3 个）
