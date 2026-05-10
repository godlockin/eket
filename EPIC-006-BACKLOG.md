# EPIC-006: Context Overflow 防御系统 - Backlog

**EPIC 状态**: 🟡 进行中（22% 完成）  
**最后更新**: 2026-05-10  
**Master**: master-001

---

## 📊 进度概览

| 状态 | 数量 | 占比 |
|------|------|------|
| ✅ done | 3 | 33% |
| 📋 ready | 6 | 67% |
| **总计** | **9** | **100%** |

**完成**: TASK-601, 602, 609  
**待办**: TASK-603, 604, 605, 606, 607, 608

---

## ✅ 已完成任务（3 个）

### TASK-601: 400 Auto-Recovery 机制
- **状态**: done
- **完成时间**: 2026-05-09
- **交付**: error-identifier.ts, recovery-logger.ts, claude-runner.ts 修改
- **效果**: 400 错误自动 compact + retry，Nuclear Option 保存 context

### TASK-602: Context Tracker + 动态 Compact
- **状态**: done
- **完成时间**: 2026-05-09 (PR #184)
- **交付**: context-tracker.ts, 集成到 claude-runner
- **效果**: 150k 阈值自动 compact，cooldown 5min
- **问题**: 仅统计输出，未触发（见 TASK-604 根因）

### TASK-609: Context Config Optimization
- **状态**: done
- **完成时间**: 2026-05-10
- **交付**: CLAUDE.md 精简（124 → 50 行），SKILL.md 索引化（4.3KB → 2.7KB）
- **效果**: SessionStart -4.6k tokens (-20%)

---

## 📋 待完成任务（6 个）

### M0-Emergency (P0) - 2 个

#### TASK-603: Error Logging + Session Snapshot
- **优先级**: P0
- **工时**: 3h
- **依赖**: TASK-601
- **状态**: ready
- **需求**: 400 错误日志 + session 快照
- **交付**: 
  - `.eket/logs/context-overflow.log`
  - `.eket/debug/session-<id>-overflow.json`
  - `eket logs:context-overflow` 命令

#### TASK-604: ContextTracker 增强
- **优先级**: P1（实际 P0，修复 overflow 根因）
- **工时**: 8h
- **依赖**: TASK-602
- **状态**: ready
- **需求**: 双向统计 + 降低阈值（150k → 120k）+ 改进估算
- **交付**:
  - trackInput + trackOutput
  - 中英文分别估算
  - `eket context:status` 命令

---

### M1-Optimization (P1) - 2 个

#### TASK-605: Tool Output Filtering（结果分页）
- **优先级**: P1
- **工时**: 4h
- **依赖**: TASK-603
- **状态**: ready
- **需求**: 大文件自动分页，单次读取 < 5k tokens
- **交付**: 
  - Read/Grep 工具自动截断
  - 提示用户使用 offset/limit

#### TASK-606: Context Health Dashboard
- **优先级**: P1
- **工时**: 6h
- **依赖**: TASK-604
- **状态**: ready
- **需求**: `eket context:dashboard` 可视化监控
- **交付**:
  - 实时 token 趋势图（ASCII）
  - 历史 compact 记录
  - 预测超限时间

---

### M2-Monitoring (P2) - 2 个

#### TASK-607: 连续错误告警机制
- **优先级**: P2
- **工时**: 4h
- **依赖**: TASK-603
- **状态**: ready
- **需求**: 5 分钟内 3 次 400 → Slack 告警
- **交付**: Slack webhook 集成 + 告警规则

#### TASK-608: Slaver 主动 Context 风险上报
- **优先级**: P2
- **工时**: 5h
- **依赖**: TASK-602, 603
- **状态**: ready
- **需求**: Slaver 任务超 100k tokens → 请求 Master 拆卡
- **交付**: 
  - Slaver 风险检测
  - 自动上报消息
  - Master 响应机制

---

## 🎯 推荐执行顺序

### Phase 1: 核心修复（本周）
1. **TASK-604** - 修复 ContextTracker 根因（⚠️ 最高优先级）
2. **TASK-603** - 添加 Error Logging（可观测性）

### Phase 2: 优化增强（下周）
3. **TASK-605** - Tool Output 分页（减少单次开销）
4. **TASK-606** - Context Dashboard（可视化）

### Phase 3: 监控告警（下下周）
5. **TASK-607** - 连续错误告警
6. **TASK-608** - Slaver 风险上报

---

## 📈 EPIC-006 里程碑

| Milestone | 任务 | 完成 | 状态 |
|-----------|------|------|------|
| M0-Emergency | 601, 602, 603, 604 | 2/4 | 🟡 50% |
| M1-Optimization | 605, 606, 609 | 1/3 | 🟡 33% |
| M2-Monitoring | 607, 608 | 0/2 | 🔴 0% |

**总进度**: 3/9 = 33%

---

## 🔥 当前紧急度

**立即处理**: TASK-604（本次 overflow 直接触发）  
**本周完成**: TASK-603（日志可观测性）  
**可延后**: TASK-605-608（优化增强类）

---

**更新时间**: 2026-05-10  
**下次检查**: TASK-604 完成后
