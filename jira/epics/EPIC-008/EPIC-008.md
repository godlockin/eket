# EPIC-008: EKET 团队容错机制增强

**优先级**: P1  
**状态**: `planning`  
**创建时间**: 2026-05-14 15:00  
**负责人**: Master

---

## Epic 概述

**目标**: 使 Slaver 异常中断后能从 ticket/文档快速恢复 80% 工作进度（< 5min 上下文恢复）

**核心价值**:
- Master 无需读 41831 tokens transcript 查 Slaver 进度
- 新 Slaver 接手任务时自动显示已完成 AC + 剩余工作
- Slaver 超时后可从 checkpoint 恢复，避免重做

**关联文档**:
- [需求分析](requirement-analysis.md)
- [技术评审](expert-review-architecture.md)

---

## Milestone 划分

### M1: 核心 Checkpoint 机制（Week 1）
**交付物**: Slaver 能写 progress.md，Master 能读进度

- TASK-X01: ProgressTracker 类实现
- TASK-X02: Slaver 集成 checkpoint 调用
- TASK-X03: `eket task:verify` 命令

**Demo**: 运行一个 Slaver 完成任务，实时查看 `progress.md` 更新

---

### M2: Git 集成 + 恢复流程（Week 2）
**交付物**: Checkpoint 进 git，新 Slaver 能 resume

- TASK-X04: Checkpoint 分支自动创建/推送
- TASK-X05: Master 读 checkpoint 分支
- TASK-X06: `eket task:claim --resume` 实现
- TASK-X07: GC 清理过期 checkpoint 分支

**Demo**: 模拟 Slaver 超时，新 Slaver resume 继续完成任务

---

### M3: 测试 + 文档 + 边界处理（Week 3）
**交付物**: 生产就绪 + 完整测试覆盖

- TASK-X08: 单元测试套件
- TASK-X09: 集成测试（Slaver 崩溃恢复场景）
- TASK-X10: 边界 case 处理（文件损坏/伪造检测/并发冲突）
- TASK-X11: 文档更新（SLAVER-RULES / 用户指南）

**Demo**: 运行自动化测试，展示 10+ 边界 case 均通过

---

## 技术架构图

```
┌─────────────────────────────────────────────────────────┐
│                 Slaver 执行流程                          │
├─────────────────────────────────────────────────────────┤
│  claim → analyze → implement AC-1 → implement AC-2 → PR │
│    ↓        ↓           ↓                ↓          ↓   │
│  [chk]    [chk]       [chk]            [chk]      [chk] │
│    │        │           │                │          │   │
│    └────────┴───────────┴────────────────┴──────────┘   │
│                         ↓                                │
│              ProgressTracker.checkpoint()                │
│                         ↓                                │
│        ┌────────────────┴────────────────┐              │
│        │                                 │              │
│   内存缓存（30s flush）          关键节点同步写          │
│        │                                 │              │
│        ↓                                 ↓              │
│  progress.md                    checkpoints/*.done      │
│        │                                                 │
│        └─────────→ git commit & push                    │
│                    checkpoint/<task-id> 分支             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              Master / 新 Slaver 读取流程                 │
├─────────────────────────────────────────────────────────┤
│  eket task:status TASK-XXX                              │
│         ↓                                               │
│  读 jira/tickets/TASK-XXX/progress.md                   │
│         ↓                                               │
│  显示: 当前阶段 / 已完成 AC / 最后更新时间               │
│                                                         │
│  eket task:claim TASK-XXX --resume                      │
│         ↓                                               │
│  1. 读 progress.md 获取已完成 AC 列表                   │
│  2. git checkout checkpoint/TASK-XXX                    │
│  3. 显示恢复上下文 + 下一步建议                          │
│  4. Slaver 继续执行（跳过已完成部分）                    │
└─────────────────────────────────────────────────────────┘
```

---

## 验收标准（Epic 级别）

- [ ] **AC-1**: Slaver 超时后，`eket task:status` 显示最后完成阶段（无需读 transcript）
- [ ] **AC-2**: 新 Slaver `claim --resume` 后 < 5min 能继续工作（自动跳过已完成 AC）
- [ ] **AC-3**: `eket task:verify` 能检测伪造进度（文件不存在/commit 不存在）
- [ ] **AC-4**: 自动化测试覆盖 10+ 边界 case（文件损坏/并发冲突/网络失败）
- [ ] **AC-5**: 文档完整（Slaver/Master 使用指南 + API 文档）

---

## 风险跟踪

| 风险 ID | 描述 | 缓解措施 | 状态 |
|---------|------|---------|------|
| R-1 | Git history 膨胀（checkpoint 分支过多） | GC 清理 7 天前已合并分支 | ⚠️ 监控中 |
| R-2 | Slaver 伪造进度（声称完成但未 commit） | `eket task:verify` 交叉验证 | ✅ 已缓解 |
| R-3 | Progress 文件损坏（写一半崩溃） | 原子写（.tmp → rename） | ✅ 已缓解 |
| R-4 | 实现工时超预期（3 天 → 5 天） | Milestone 1 先验证核心流程，若超时砍 M3 非核心 | 🟡 待观察 |

---

## 非功能需求

| 指标 | 目标 | 验证方式 |
|------|------|---------|
| **恢复速度** | 新 Slaver resume < 5min 上手 | 计时测试（从 `claim --resume` 到首次有效代码提交） |
| **进度更新延迟** | 30s 内 Master 可见最新进度 | 监控 `progress.md` 最后修改时间 |
| **文件大小** | 每个 task 目录 < 50KB | CI 检查，超标告警 |
| **测试覆盖率** | checkpoint 模块 > 90% | Jest coverage report |

---

## 依赖项

| 外部依赖 | 影响 | 解除方式 |
|---------|------|---------|
| Git 分支权限配置 | Slaver 需能 push `checkpoint/*` | DevOps 配置 GitHub branch rules |
| CI 配置更新 | 避免 checkpoint 分支触发 CI | 修改 `.github/workflows/ci.yml` |

---

## 相关链接

- [MASTER-RULES.md](../../template/docs/MASTER-RULES.md) §3 PR 审核流程
- [SLAVER-RULES.md](../../template/docs/SLAVER-RULES.md) §5 进度报告机制
- [EXPERT-PANEL-PLAYBOOK.md](../../template/docs/EXPERT-PANEL-PLAYBOOK.md) §2 任务拆解方法

---

**状态历史**:
- 2026-05-14 15:00 — 创建 Epic，状态 `planning`
- （待更新）

**下一步**: Master 拆解 Milestone 1 的 3 个 tickets 并设为 `ready`
