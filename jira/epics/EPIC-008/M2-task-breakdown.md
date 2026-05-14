# M2 Task Breakdown: Git 集成 + 恢复流程

**Epic**: EPIC-008  
**Milestone**: M2  
**创建时间**: 2026-05-14 17:00  
**拆解人**: Master (Expert Panel)

---

## 任务列表

| Task ID | 标题 | 依赖 | 预估 | 类型 | 优先级 |
|---------|------|------|------|------|--------|
| **TASK-X04** | Checkpoint 分支自动创建与推送 | None | 6-8h | backend | P0 |
| **TASK-X05** | Master 读取 Checkpoint 分支状态 | X04 | 4h | backend | P0 |
| **TASK-X06** | Slaver Resume 恢复机制 | X04, X05 | 6h | backend | P0 |
| **TASK-X07** | Checkpoint 分支自动清理（GC） | None | 4h | devops | P1 |

**总工时**: 20-22h (约 2.5-3 个工作日)

---

## 依赖关系图

```
┌─────────────┐
│  TASK-X04   │ ← 核心：Git 集成
│  Git Sync   │
└──────┬──────┘
       │
       ├─────────────┐
       ▼             ▼
┌─────────────┐  ┌─────────────┐
│  TASK-X05   │  │  TASK-X07   │ ← 独立（可并行）
│ Read Status │  │  GC Cleanup │
└──────┬──────┘  └─────────────┘
       │
       ▼
┌─────────────┐
│  TASK-X06   │ ← 依赖 X04+X05
│   Resume    │
└─────────────┘
```

**执行策略**:
1. **Week 2 Day 1-2**: TASK-X04 (6-8h) — 阻塞其他任务，优先完成
2. **Week 2 Day 2**: TASK-X05 (4h) + TASK-X07 (4h) — 并行执行
3. **Week 2 Day 3**: TASK-X06 (6h) — 集成测试 + 验收

---

## 关键交付物

### TASK-X04: Git Sync 核心
**输出**:
- `ProgressTracker` 扩展（git commit + push 逻辑）
- Checkpoint 分支自动创建（`checkpoint/<task-id>`）
- 结构化 commit message（包含 metadata）
- 错误容错（push 失败不阻塞）

**验收标准**:
- [x] AC-1: 关键节点自动 git commit
- [x] AC-2: Push checkpoint 分支到 remote
- [x] AC-3: Commit message 包含结构化元数据
- [x] AC-4: Git 操作失败不阻塞任务

---

### TASK-X05: Master 监控能力
**输出**:
- `eket task:status` 命令扩展
- 读取 remote checkpoint 分支
- 显示进度（phase / 时间 / Slaver ID）
- 对比 local vs remote 状态

**验收标准**:
- [x] AC-1: 检测 checkpoint 分支存在性
- [x] AC-2: 显示最后 commit 时间与 message
- [x] AC-3: 对比 local vs remote checkpoint
- [x] AC-4: 彩色输出增强可读性

---

### TASK-X06: Slaver 恢复流程
**输出**:
- `eket task:claim --resume` 命令
- Checkout checkpoint 分支
- 显示已完成 AC + 剩余 AC
- ProgressTracker resume 初始化

**验收标准**:
- [x] AC-1: `--resume` flag checkout checkpoint 分支
- [x] AC-2: 读取并显示已完成 AC 列表
- [x] AC-3: 交互询问继续 or 重新分析
- [x] AC-4: ProgressTracker 初始化跳过已完成阶段

---

### TASK-X07: 仓库健康维护
**输出删除）

**验收标准**:
- [x] AC-1: 检测并列出可清理分支
- [x] AC-2: 执行删除操作
- [x] AC-3: 保护未合并 PR 的分支
- [x] AC-4: 自定义清理规则（`--older-than`）

---

## 技术决策摘要

### 1. Git 分支策略
**选型**: 独立 `checkpoint/<task-id>` 分支  
**理由**:
- 避免污染 feature 分支 PR diff
- 方便 GC 清理（不影响主分支 history）
- 支持多 Slaver 并行（未来扩展）

**替代方案（已驳回）**:
- ❌ 每次 commit 到 feature 分支 → PR diff 过长
- ❌ Squash 合并 → 丢失中间 checkpoint 信息

---

### 2. Commit Message 格式
**格式**:
```
Checkpoint: <task-id> - <phase> [<slaver-id>]

Timestamp: 2026-05-14T15:30:00+08:00
Phase: ac_1_done
Metadata:
  - AC: AC-1
  - Files: src/auth.rs, src/auth.test.ts
  - Tests: ✅ passed
```

**理由**:
- 结构化 → 易解析（TASK-X05 读取）
- 包含时间戳 → GC 清理依据
- 包含 metadata → Master 快速了解进度

---

### 3. 容错设计
**原则**: Checkpoint 失败不阻塞 Slaver  
**实现**:
- `try-catch` 捕获 git 错误
- 记录到 `.eket/logs/checkpoint-git-failures.log`
- 继续执行任务（AC 完成仍有效）

**理由**:
- 网络抖动不应导致任务失败
- Master 可异步监控日志，发现问题

---

### 4. GC 清理规则
**规则**:
1. Task status = `done` AND 分支 > 7d → 删除
2. Task status = `cancelled` AND 分支 > 3d → 删除
3. 无活动 > 30d → 删除
4. **保护**: PR 未合并 → 不删除

**理由**:
- 平衡存储成本 vs 恢复能力
- 7d 足够 Master review + 新 Slaver resume
- PR 未合并可能需要 resume（保护关键数据）

---

## 风险跟踪

| 风险 ID | 描述 | 缓解措施 | 状态 |
|---------|------|---------|------|
| **R-1** | Git push 频繁失败（网络问题） | 容错设计 + 日志监控 | ✅ 已缓解 |
| **R-2** | Checkpoint 分支过多（> 100 个） | GC 自动清理 + 监控告警 | ✅ 已缓解 |
| **R-3** | Resume 逻辑复杂（边界 case 多） | 充分测试（10+ case） + 交互确认 | 🟡 待测试 |
| **R-4** | M2 工时超预期（22h → 30h） | X07 可延后到 M3（P1 优先级） | 🟢 低风险 |

---

## 测试策略

### 单元测试（每个 task）
- ProgressTracker git 集成测试（X04）
- task:status 命令测试（X05）
- task:claim resume 逻辑测试（X06）
- checkpoint:gc 清理规则测试（X07）

### 集成测试（E2E）
```bash
# Scenario 1: Slaver 完成 AC-1 后超时，新 Slaver resume
eket task:claim TASK-INT-001  # Slaver-A
# (simulate timeout)
eket task:claim TASK-INT-001 --resume  # Slaver-B
# Verify: Slaver-B 跳过 AC-1，继续 AC-2

# Scenario 2: Master 监控多个任务进度
eket task:status TASK-INT-001
eket task:status TASK-INT-002
# Verify: 显示 checkpoint 状态

# Scenario 3: GC 清理过期分支
eket checkpoint:gc --dry-run
eket checkpoint:gc --execute
# Verify: 已完成 task 的 checkpoint 分支被删除
```

### 边界 Case 覆盖
| Case | TASK | 测试方法 |
|------|------|---------|
| Git push 权限拒绝 | X04 | Mock git error |
| Checkpoint 分支不存在 | X05 | 测试新任务 |
| Progress.md 损坏 | X06 | Mock 解析失败 |
| PR API 超时 | X07 | Mock gh CLI 超时 |

---

## 验收标准（M2 级别）

**Demo 场景**:
```bash
# 1. Slaver-A 开始任务
eket task:claim TASK-DEMO-001
# (完成 analysis + AC-1)

# 2. Master 查看进度
eket task:status TASK-DEMO-001
# 输出:
#   ✅ Checkpoint: origin/checkpoint/TASK-DEMO-001
#   Last Update: 5m ago
#   Phase: ac_1_done

# 3. 模拟 Slaver-A 超时，新 Slaver-B resume
eket task:claim TASK-DEMO-001 --resume
# 输出:
#   ✅ Completed:
#      - analysis (30m ago)
#      - ac_1 (5m ago)
#   ⏳ Remaining:
#      - AC-2: ...
#   [1] Continue from checkpoint

# 4. GC 清理（7d 后）
eket checkpoint:gc --dry-run
# 输出:
#   ✅ checkpoint/TASK-DEMO-001 (merged 8d ago)
```

**通过条件**:
- [ ] 4 个 task 全部通过单元测试
- [ ] E2E 测试场景成功执行
- [ ] Code review 无阻塞问题
- [ ] 文档更新（SLAVER-RULES.md 添加 resume 说明）

---

## 后续工作（M3）

**优化项**:
- 非交互 resume 模式（`--resume --auto-continue`）
- Checkpoint 历史回放（查看所有 checkpoint）
- 并发 Slaver 冲突检测（文件锁）
- CI 集成（自动 GC）

**技术债**:
- 当前未处理多 remote 场景（仅 origin）
- 未实现 checkpoint merge conflict 解决
- GC 无 dry-run history（未记录删除历史）

---

**版本**: 1.0  
**状态**: `breakdown_complete`  
**下一步**: 创建 4 个 ticket，设置状态为 `ready`
