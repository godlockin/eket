# Master 等待 PR 期间的主动工作指南

**版本**: v2.1.4  
**创建日期**: 2026-04-11  
**目的**: 定义 Master 在等待 PR 反馈期间的主动工作清单和流程

---

## 核心原则

**Master 在等待 PR 反馈期间不是被动等待，而是主动执行项目管理和规划工作。**

```
传统模式（错误）:
PR 提交 → Master 等待反馈 → 空闲/低效

EKET 模式（正确）:
PR 提交 → Master 主动工作 → 反馈到达时立即响应
           ├── 同步 roadmap
           ├── 规划下阶段
           ├── 拆解新需求
           ├── 标记优先级
           └── 预初始化团队
```

---

## 等待期间的五大工作任务

### 任务 1：同步和修正 Roadmap

**目的**：确保路线图反映当前实际进度，识别风险项。

**检查位置**：
- `confluence/projects/{project}/roadmap.md` — 产品路线图
- `jira/state/project-status.yml` — 当前项目状态
- `jira/tickets/*/status: done` — 已完成任务

**工作流程**：
```
1. 读取已完成任务列表
   ↓
2. 计算各 Milestone 完成率
   ↓
3. 对比计划日期和实际进度
   ↓
4. 识别延期风险
   ↓
5. 更新 roadmap.md
```

**Roadmap 同步模板**：
```markdown
## 当前进度（更新于：YYYY-MM-DD HH:mm）

| Milestone | 计划完成 | 预计完成 | 完成率 | 状态 |
|-----------|----------|----------|--------|------|
| MILESTONE-001 | 2026-04-15 | 2026-04-15 | 80% | 🟢 正常 |
| MILESTONE-002 | 2026-04-30 | 2026-05-05 | 30% | 🟡 风险 |
| MILESTONE-003 | 2026-05-15 | 2026-05-15 | 10% | 🟢 正常 |

## 本周完成
- [x] FEAT-001: 用户登录功能
- [x] FEAT-002: 用户注册功能
- [ ] FEAT-003: 个人资料页 (进行中，预计延期 1 天)

## 风险项
| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 后端 API 延期 | 前端开发阻塞 | 协调 backend_dev 优先处理 |
| 测试人力不足 | 发布延迟风险 | 准备临时增加 tester |

## 下周计划
- [ ] FEAT-004: 密码重置
- [ ] FEAT-005: 邮箱验证
- [ ] FEAT-006: 个人中心
```

**检查清单**：
- [ ] 所有已完成任务已标记
- [ ] Milestone 完成率准确
- [ ] 延期任务已识别
- [ ] 风险项已记录
- [ ] 缓解措施已制定

---

### 任务 2：规划下阶段任务

**目的**：确保 Slaver 团队始终保持充足的可领取任务。

**检查位置**：
- `confluence/projects/{project}/requirements/prd.md` — 产品需求文档
- `jira/sprints/` — 当前和下一 Sprint
- `jira/tickets/backlog/` — 待拆解需求

**工作流程**：
```
1. 阅读 PRD 识别未实现功能
   ↓
2. 确定下一 Sprint 主题
   ↓
3. 创建 Sprint 草案文档
   ↓
4. 预估任务工时和角色
   ↓
5. 标记关键路径任务
```

**Sprint 规划模板**：
```markdown
# Sprint {N+1} 规划草案

**主题**: {Sprint 主题，如"用户系统完善"}
**日期**: YYYY-MM-DD ~ YYYY-MM-DD (2 周)
**目标**:
1. 完成用户相关功能（密码重置、邮箱验证）
2. 完善个人资料管理
3. 实现基础权限控制

**预估任务**:
| 功能 | Ticket ID | 优先级 | 预估工时 | 适配角色 | 依赖 |
|------|-----------|--------|----------|----------|------|
| 密码重置 | FEAT-004 | P1 | 8h | fullstack | - |
| 邮箱验证 | FEAT-005 | P1 | 6h | backend_dev | FEAT-004 |
| 个人资料 | FEAT-006 | P2 | 12h | frontend_dev | - |
| 权限控制 | FEAT-007 | P1 | 16h | backend_dev | FEAT-001 |

**Sprint 容量**:
- 总工时：42h
- frontend_dev: 12h × 1 = 12h
- backend_dev: 22h × 1 = 22h
- fullstack: 8h × 1 = 8h

**关键路径**:
FEAT-004 → FEAT-005 → FEAT-007
```

**检查清单**：
- [ ] Sprint 主题明确
- [ ] 目标可衡量
- [ ] 任务估时合理（单任务 4-16h）
- [ ] 角色分配均衡
- [ ] 依赖关系清晰
- [ ] 关键路径已识别

---

### 任务 3：拆解新需求到 Ticket 级别

**目的**：将宏观需求转化为可执行的原子任务。

**检查位置**：
- `inbox/human_input.md` — 新需求
- `confluence/projects/{project}/requirements/user_stories.md` — 用户故事
- `jira/epics/` — Epic 列表

**拆解流程**：
```
1. 阅读需求/用户故事
   ↓
2. 识别功能模块（创建 Epic）
   ↓
3. 拆解为 Ticket（4-16 小时/个）
   ↓
4. 定义验收标准（可测试）
   ↓
5. 标记优先级和依赖
   ↓
6. 状态设为 ready
```

**Ticket 模板**：
```markdown
# {TICKET-ID}: {功能名称}

## 元数据
- **类型**: feature | bugfix | task | test | doc
- **优先级**: P0 | P1 | P2 | P3
- **重要性**: critical | high | medium | low
- **状态**: ready
- **适配角色**: frontend_dev | backend_dev | fullstack | tester | devops
- **预估工时**: Xh
- **所属 Epic**: {EPIC-ID}
- **所属 Sprint**: {SPRINT-ID}
- **所属 Milestone**: {MILESTONE-ID}

## 依赖关系
- **blocks**: [本任务阻塞哪些任务]
- **blocked_by**: [本任务被哪些任务阻塞]
- **related**: [相关任务，可并行开发]

## 需求描述
{清晰描述功能需求}

## 验收标准
- [ ] 标准 1（可测试）
- [ ] 标准 2（可测试）
- [ ] 标准 3（可测试）

## 技术提示（可选）
{技术实现的提示或约束}

## 参考资料（可选）
{相关文档、API 规范等}
```

**拆解原则**：
| 原则 | 说明 |
|------|------|
| 原子性 | 每个 Ticket 不可再分 |
| 独立性 | 尽量减少依赖关系 |
| 可测试 | 验收标准必须可验证 |
| 估时准确 | 单任务 4-16 小时（不超过 2 天） |
| 角色匹配 | 明确适配的 Slaver 角色 |

**检查清单**：
- [ ] Ticket 标题清晰
- [ ] 优先级正确
- [ ] 适配角色明确
- [ ] 预估工时合理
- [ ] 验收标准可测试
- [ ] 依赖关系正确
- [ ] 关联 Epic/Sprint/Milestone

---

### 任务 4：标记 Ticket 优先级和依赖

**目的**：确保 Slaver 领取任务时的决策质量，避免关键路径延误。

**优先级判定标准**：
| 优先级 | 判定标准 | 响应时间 | 示例 |
|--------|----------|----------|------|
| P0 | 生产事故、阻塞关键路径 | 立即 | 系统宕机、数据丢失 |
| P1 | 高优先级功能、影响核心体验 | 24 小时 | 核心功能开发 |
| P2 | 正常功能、按顺序开发 | 3 天 | 一般功能增强 |
| P3 | 优化类、技术债务 | 1 周 | 代码重构、文档补充 |

**依赖关系类型**：
```markdown
## 依赖关系

### 阻塞关系（硬依赖）
**blocks**: 本任务完成后，其他任务才能开始
**blocked_by**: 本任务需要等待其他任务完成

### 相关关系（软依赖）
**related**: 功能相关，可并行开发，但最好协调
```

**关键路径识别**：
```
关键路径 = 最长依赖链

示例：
FEAT-001 (登录) → FEAT-004 (密码重置) → FEAT-005 (邮箱验证) → FEAT-007 (权限控制)
     4h                    8h                    6h                    16h

关键路径工时：4 + 8 + 6 + 16 = 34h
关键路径工期：至少需要 34 小时（单 Slaver）
```

**行动清单**：
- [ ] 扫描所有 `ready` 状态 Ticket
- [ ] 确认优先级与业务目标一致
- [ ] 标记所有依赖关系
- [ ] 识别关键路径任务（P0/P1 优先）
- [ ] 调整非关键任务优先级

---

### 任务 5：预初始化 Slaver 团队

**目的**：确保有足够的 Slaver 容量处理 ready 状态的任务。

**检查位置**：
- `jira/state/ticket-index.yml` — ready 状态任务列表
- `.eket/state/profiles/` — Slaver 角色配置
- `jira/state/project-status.yml` — Slaver 状态

**容量规划流程**：
```
1. 统计 ready 任务的工时和角色分布
   ↓
   frontend_dev: 24h (3 个任务)
   backend_dev: 20h (2 个任务)
   tester: 8h (1 个任务)

2. 检查现有 Slaver 工作负载
   ↓
   frontend_dev × 1: 16h in_progress (剩余容量 8h/周)
   backend_dev × 1: 8h in_progress (剩余容量 24h/周)
   tester × 1: 0h in_progress (剩余容量 32h/周)

3. 识别人力缺口
   ↓
   frontend_dev: 24h - 8h = 16h 缺口 → 需要增加 1 个 frontend_dev
   backend_dev: 20h - 24h = -4h → 容量充足
   tester: 8h - 32h = -24h → 容量充足

4. 预初始化新 Slaver 配置
   ↓
   创建 .eket/state/profiles/frontend_dev_2.yml
   写入角色配置和技能要求
   状态设为 standby
```

**Slaver 容量计算公式**：
```
单 Slaver 周容量 = 40h (全时) 或 20h (半时)
剩余容量 = 周容量 - in_progress 工时

需要的 Slaver 数量 = ceil(总工时 / 单 Slaver 剩余容量)
```

**预初始化配置模板**：
```yaml
# .eket/state/profiles/frontend_dev_2.yml
role: "slaver"
agent_type: "frontend_dev"
status: "standby"  # standby | active | idle

skills:
  - react
  - typescript
  - tailwindcss
  - unit_testing

capacity:
  weekly_hours: 40
  current_load: 0
  available_from: "2026-04-11"

assignment_policy:
  priority_roles:
    - frontend_dev
  secondary_roles:
    - fullstack
  max_concurrent_tasks: 2
```

**检查清单**：
- [ ] ready 任务工时统计准确
- [ ] 现有 Slaver 工作负载已检查
- [ ] 人力缺口已识别
- [ ] 新 Slaver 配置已创建（如需要）
- [ ] 任务通知已准备（Slaver 激活后发送）

---

## 工作优先级决策树

```
等待 PR Review 反馈
│
├── 1. 检查 inbox/human_input.md 是否有新需求？
│   ├── 是 → 启动需求分析流程（最高优先级）
│   └── 否 → 继续往下
│
├── 2. Roadmap 是否 > 10 分钟未更新？
│   ├── 是 → 同步 roadmap 进度
│   └── 否 → 继续往下
│
├── 3. 下阶段规划是否清晰？
│   ├── 否 → 创建下一 Sprint 规划草案
│   └── 是 → 继续往下
│
├── 4. 是否有未拆解的需求？
│   ├── 是 → 拆解需求到 Ticket 级别
│   └── 否 → 继续往下
│
├── 5. ready 任务是否充足（≥ 2 个任务/Slaver）？
│   ├── 否 → 创建更多 ready 任务
│   └── 是 → 继续往下
│
└── 6. Slaver 工作负载是否均衡？
    ├── 否 → 预初始化 Slaver 团队
    └── 是 → 检查 PR 反馈，准备响应
```

---

## 时间分配建议

| 工作任务 | 建议时间占比 | 说明 |
|----------|-------------|------|
| Roadmap 同步 | 10% | 每 10 分钟更新一次 |
| 下阶段规划 | 25% | Sprint 草案、Epic 定义 |
| 需求拆解 | 35% | Ticket 创建和细化 |
| 优先级标记 | 15% | 依赖分析、关键路径 |
| 团队预初始化 | 15% | 容量规划、Slaver 配置 |

**典型等待周期（30 分钟 PR Review）的时间分配**：
```
0-5 分钟:   同步 roadmap（检查已完成任务）
5-12 分钟:  下阶段规划（创建 Sprint 草案）
12-22 分钟: 需求拆解（2-3 个新 Ticket）
22-27 分钟: 优先级标记（依赖关系分析）
27-30 分钟: 团队预初始化（检查容量）
```

---

## 与心跳检查的集成

**每 5 分钟检查一次 PR 反馈**，然后继续主动工作：
```
检查 PR 反馈
│
├── 有反馈，需要修改 → 暂停主动工作，立即处理反馈
├── 有反馈，批准 → 暂停主动工作，准备合并
└── 无反馈 → 继续主动工作
```

**心跳检查频率**：
| Master 状态 | PR 检查频率 | 主动工作 |
|------------|-------------|----------|
| 等待 PR 反馈 | 每 5 分钟 | 持续进行 |
| 等待人类决策 | 每 10 秒 | 持续进行 |
| 空闲 | 每 10 秒 | N/A |
| 工作中（Review） | N/A | N/A |

---

## 相关文档

- [`MASTER-HEARTBEAT-CHECKLIST.md`](./MASTER-HEARTBEAT-CHECKLIST.md) — Master 心跳检查完整清单
- [`MASTER-WORKFLOW.md`](./MASTER-WORKFLOW.md) — Master 完整工作流程
- [`TICKET-RESPONSIBILITIES.md`](./TICKET-RESPONSIBILITIES.md) — Ticket 职责边界

---

**维护者**: EKET Framework Team  
**版本**: v2.1.4  
**最后更新**: 2026-04-11
