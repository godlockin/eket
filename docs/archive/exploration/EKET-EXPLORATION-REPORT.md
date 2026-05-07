# EKET 项目完整探索报告

**生成时间**: 2026-04-27  
**项目路径**: `/Users/chenchen/working/sourcecode/tools/dev-tools/eket`

---

## 1. Templates 完整内容

### 1.1 Confluence Templates

#### `templates/confluence/architecture-plan.md.hbs`
**用途**: Epic 的架构规划文档模板  
**关键字段**:
- epic_id
- timestamp
- 模块依赖图 (Mermaid graph)
- Ticket 列表
- 关键路径
- 里程碑表

#### `templates/confluence/expert-review.md.hbs`
**用途**: 专家组审议记录  
**关键字段**:
- topic
- date
- 各专家意见 (架构师、后端工程师等)
- 结论与决策

#### `templates/confluence/requirement-analysis.md.hbs`
**用途**: 需求分析文档  
**关键字段**:
- epic_id
- title
- timestamp
- author
- 背景与动机
- 5-Why 问题陈述
- Given-When-Then 验收标准
- 技术约束
- 未知与假设
- 专家组意见

#### `templates/confluence/retrospective.md.hbs`
**用途**: 任务完成后的复盘文档  
**关键字段**:
- ticket_id
- title
- completed_at
- slaver_id (执行者)
- 3Q 复盘 (做了什么/哪些做得好/可以改进/下次怎么做)
- 知识沉淀

### 1.2 Jira Templates

#### `templates/jira/epic.md.hbs`
**用途**: Epic 定义文档  
**关键字段**:
- epic_id
- title
- timestamp
- 目标
- 范围
- 关联需求分析

---

## 2. EXPERT-PANEL-PLAYBOOK.md — 需求分析/任务规划/任务拆解专家组手册

### 触发词与召唤时机

**何时召唤专家组**（§0）:
| 场景 | 最少专家数 | 必要角色 |
|------|-----------|---------|
| 新需求 → PRD | 3 | 产品 / 架构 / QA |
| 架构变更 | 4 | 架构 / 安全 / 性能 / DevOps |
| 重构/迁移 | 4 | 架构 / 并发 / 回滚策略 / QA |
| 生产事故根因分析 | 5 | SRE / 安全 / 性能 / 架构 / 数据 |
| 日常 ticket 拆解 | 可跳过 | —— |

**不召唤**: 单一已知模式的实现任务（CRUD / 文案修改 / 配置项）

### §1 需求分析 (Requirement Analysis)

**1.1 输入闸门** — 5-Why + 4-W 检查清单:
- **Who** — 受益人是谁（不得仅"用户"）
- **What** — 要交付什么 artifact（不得仅动词）
- **Why** — 当前状态问题是什么（需证据）
- **When** — 成功的判据（必须可测量）
- **Why-5** — 连问 5 次根因

**红线**: Master 不得在任何 Why 未澄清的情况下直接开始拆任务

**1.2 结构化输出** — 强制模板包含 6 节:
1. 原始诉求（原文引用）
2. 受益人 × 场景矩阵
3. 验收标准（Given-When-Then）
4. 非目标（Out of Scope）
5. 未知与假设（表格含阻塞级别）
6. 风险与缓解

**1.3 专家组角色**:
| 专家 | 关注点 | 典型发问 |
|------|--------|---------|
| **产品经理** | 受益人 / 业务价值 | "如果这个不做会死吗？" |
| **架构师** | 技术可行性 / 耦合度 | "现有哪些模块必须动？" |
| **QA** | 验收可测性 | "你怎么证明它对？" |
| **安全/合规** | 数据边界 / 权限 | "谁能读/写哪些字段？" |
| **运维/SRE** | 上线可观测性 | "坏了怎么发现？怎么回滚？" |

### §2 任务规划 (Task Planning)

**2.1 垂直切片优先** (Vertical Slicing):
- 反模式: 按技术层切（先写所有 API → 再写 UI）
- 正模式: 每个 ticket 能独立交付一小片完整用户价值
- 判据: **任一 ticket 合并后都能部署上线展示给用户**

**2.2 INVEST 自检** (每个 ticket):
- **I**ndependent — 可独立开发与合并
- **N**egotiable — 粒度可在 analysis 阶段调整
- **V**aluable — 单独具备用户/运维价值
- **E**stimable — 可给出 hours 估算
- **S**mall — ≤ 2 工作日（超标必须继续拆）
- **T**estable — 有明确 AC

**2.3 依赖图与关键路径**:
- 在 `confluence/architecture/<EPIC>-plan.md` 产出
- 关键路径 = 最长依赖链（Master 优先派发）
- 可并行块 = 无互相依赖的 ticket

**2.4 Milestone 拆分**:
- 每 5-7 个 ticket 设一个 Milestone
- 交付物必须对应**一个可演示的 Demo**
- Demo 不通过 = Milestone 不 done

### §3 任务拆解 (Task Decomposition)

**3.1 拆解启发式** (按优先级):
1. **风险优先** — 最大未知/最大回滚代价的部分
2. **边界优先** — 进程/网络/权限边界
3. **数据写入优先** — 写操作永远排在读操作之前
4. **可观测性内嵌** — 每个 ticket AC 必须包含"如何观察它在跑"

**3.2 Ticket 最小字段集**:
```yaml
id: FEAT-NNN
title: "<动词开头，动作+对象>"
parent_epic: EPIC-NNN
agent_type: frontend_dev | backend_dev | fullstack | qa | devops
priority: P0 | P1 | P2 | P3
estimate_hours: <number>  # ≤ 16；超标重拆
blocked_by: [TICKET-ID, ...]
acceptance_criteria:
  - AC-1: Given/When/Then
observability:  # 必填
  logs: ["event_name"]
  metrics: ["metric_name"]
rollback_plan: "<一句话>"
test_strategy:
  unit: "<覆盖哪些函数>"
  integration: "<哪条端到端流>"
  regression: "<dual-engine 场景号>"
```

**3.3 不可继续拆解的判据**:
1. **Slaver 能否 1 小时内读完全文并开始写代码？**
2. **AC 能否一句话描述？**
3. **是否触碰 3+ 模块？**

全 "是" 才停。

### §4 专家组运行协议

**4.1 召唤模板**:
```markdown
## 专家组召唤：<主题>

**背景**：<3 句话>
**目标**：<期望专家组产出什么决策>
**参与角色**：产品 / 架构 / QA / SRE / 安全

### 发言规则
1. 每位专家**先独立给出分析**（防群体偏见）
2. 发言结构固定：**观察 → 担忧 → 建议**
3. 分歧必须留在文档里（不得私下协商）
4. Master 汇总 + 给出最终决策
```

**4.2 防伪造**:
- 专家组输出必须落文件：`docs/reviews/<YYYY-MM-DD>-<topic>.md`
- **严禁**仅口头/对话中讨论后直接行动

**4.3 分歧解决**:
| 分歧类型 | 解决方式 |
|---------|---------|
| 事实分歧 | 写最小复现脚本 |
| 价值分歧 | 回到 §1.1 的 Why-5 |
| 方案分歧 | 决策矩阵（风险/成本/可回滚性/延展性）|

### §5 交付物 Checklist

Master 完成需求分析阶段的硬性标准:
- [ ] `jira/tickets/<EPIC>/requirement-analysis.md` 六节全填
- [ ] `confluence/architecture/<EPIC>-plan.md` 含依赖图 + 关键路径标注
- [ ] 所有 ticket 通过 INVEST 自检
- [ ] 至少一个 ticket 已在 ready 状态
- [ ] 风险表每一项有缓解策略
- [ ] 专家组记录文件存在于 `docs/reviews/`
- [ ] 下发消息到 `shared/message_queue/inbox/`

---

## 3. Confluence Architecture 现有文件

**目录**: `/confluence/`（非 `/confluence/architecture/`）

**现有文件结构**:
```
confluence/
├── memory/                    # 知识库
│   ├── glossary/              # 术语表
│   ├── lessons/               # 教训
│   ├── patterns/              # 最佳实践模式
│   ├── pitfalls/              # 常见陷阱
│   ├── research/              # 研究记录
│   └── retrospectives/        # 复盘文档
├── 2026/                      # 按年份组织
├── INBOX/                     # 待处理
├── memory-index.md            # 知识索引
├── progress-tracker.md        # 进度追踪
├── terms.md                   # 词汇定义
├── codebase-maintenance.md    # 代码库维护
├── eket-project-hygiene.md    # 项目卫生指南
├── multi-agent-collab-lessons.md
├── red-team-bug-patterns.md
├── rule-retention-lessons.md
├── knowledge-system.md
├── master-slaver-coordination.md
└── borrowed-wisdom.md
```

**重要发现**: 
- **没有 `/confluence/architecture/` 目录** — 模板中指定的位置不存在
- **有 `/confluence/memory/retrospectives/` 目录** — 复盘文档存储位置
- **没有 roadmap 或 spike 相关文件** — 这是待创建的部分

---

## 4. Jira Epics 结构

**现有 EPIC**:
- `jira/epics/EPIC-001.md` — 唯一已有 Epic

**Ticket 编号规则**:
| 类型 | 前缀 | 示例 |
|------|------|------|
| 功能需求卡 | `FEAT` | `FEAT-001` |
| 任务卡 | `TASK` | `TASK-001` |
| 缺陷修复卡 | `FIX` | `FIX-001` |
| 测试卡 | `TEST` | `TEST-001` |
| 产品需求卡 | `PRD` | `PRD-001` |
| UI/UX设计卡 | `U-DESIGN` | `U-DESIGN-001` |
| 技术设计卡 | `T-DESIGN` | `T-DESIGN-001` |
| 部署卡 | `DEPL` | `DEPL-001` |
| 文档卡 | `DOC` | `DOC-001` |
| 用户调研卡 | `USER-RES` | `USER-RES-001` |
| 数据分析卡 | `DATA-ANALYSIS` | `DATA-ANALYSIS-001` |
| 合规审查卡 | `COMPLIANCE` | `COMPLIANCE-001` |

**已生成 TASK 数量**: TASK-001 ~ TASK-056（含跳号）

---

## 5. doc_lifecycle.rs DocEvent 完整列表

**文件**: `rust/crates/eket-core/src/doc_lifecycle.rs`

### DocEvent 枚举定义

```rust
pub enum DocEvent {
    EpicCreated { 
        epic_id: String, 
        title: String, 
        project_root: PathBuf 
    },
    
    EpicPlanned { 
        epic_id: String, 
        project_root: PathBuf 
    },
    
    TaskClaimed { 
        ticket_id: String, 
        slaver_id: String, 
        project_root: PathBuf 
    },
    
    TaskCompleted {
        ticket_id: String,
        title: String,
        slaver_id: String,
        project_root: PathBuf,
    },
    
    TaskTested {
        ticket_id: String,
        status: String,
        coverage: Option<u8>,
        project_root: PathBuf,
    },
    
    ExpertReviewed { 
        topic: String, 
        project_root: PathBuf 
    },
}
```

### 事件处理映射

| DocEvent | 触发文件写入 | 目标路径 | 模板 |
|----------|-----------|---------|------|
| **EpicCreated** | 2 个文件 | `jira/epics/<EPIC>/epic.md`<br>`confluence/requirements/<EPIC>-analysis.md` | `jira/epic.md.hbs`<br>`confluence/requirement-analysis.md.hbs` |
| **EpicPlanned** | 1 个文件 | `confluence/architecture/<EPIC>-plan.md` | `confluence/architecture-plan.md.hbs` |
| **TaskClaimed** | 追加到 Ticket | `jira/tickets/<TICKET>.md` | 追加 "## 分析记录" 小节 |
| **TaskCompleted** | 1 个新文件 | `confluence/memory/retrospectives/<DATE>-<TICKET>.md` | `confluence/retrospective.md.hbs` |
| **TaskTested** | 追加到 Ticket | `jira/tickets/<TICKET>.md` | 追加 "## 测试记录" 小节 |
| **ExpertReviewed** | 1 个新文件 | `docs/reviews/<DATE>-<slugified-topic>.md` | `confluence/expert-review.md.hbs` |

### 内置模板查找顺序

1. `<project_root>/templates/` — 项目自定义
2. `~/.eket/templates/` — 全局自定义
3. 编译时内置字符串（via `include_str!`）

---

## 6. Node Skills 目录完整结构

**路径**: `node/src/skills/`

### 核心文件

- `index.ts` — 主入口
- `types.ts` — TypeScript 类型定义
- `loader.ts` — Skill 加载器
- `index-loader.ts` — 索引加载器
- `unified-interface.ts` — 统一接口
- `auto-registry.ts` — 自动注册器
- `registry.ts` — Skill 注册表

### Skill 分类目录

#### `/design` — 设计 Skills
```
design/
├── database-schema.json       # 数据库架构设计
├── system-architecture.json   # 系统架构设计
└── api-design.json            # API 设计
```

#### `/development` — 开发 Skills
```
development/
├── code-review-checklist.json  # Code Review 检查清单
├── refactoring-guide.json      # 重构指南
├── frontend_development.json   # 前端开发
└── performance-optimization.json # 性能优化
```

#### `/planning` — 规划 Skills
```
planning/
├── risk-assessment.json        # 风险评估
├── sprint-planning.json        # Sprint 规划
├── ticket-breakdown.json       # Ticket 拆分
└── roadmap-prioritization.json # Roadmap 优先级划分
```

#### `/requirements` — 需求 Skills
```
requirements/
├── use-case-writing.json       # 用例编写
├── requirement_decomposition.json # 需求分解
├── acceptance-criteria.json    # 验收标准
└── user-story-mapping.json     # 用户故事映射
```

#### `/testing` — 测试 Skills
```
testing/
├── test-strategy.json          # 测试策略
├── e2e-testing.json            # E2E 测试
├── unit_test.json              # 单元测试
└── performance-testing.json    # 性能测试
```

#### `/review` — 审查 Skills
```
review/
├── pr-review-checklist.json    # PR Review 检查清单
├── code-smell-detection.json   # 代码坏味道检测
├── performance-review.json     # 性能审查
└── security-review.json        # 安全审查
```

#### `/adapters` — 适配器
```
adapters/
├── mod.ts                       # 模块入口
├── types.ts                     # 类型定义
├── factory.ts                   # 工厂模式
├── claude-code-adapter.ts       # Claude Code 适配器
├── codex-adapter.ts             # Codex 适配器
└── openclaw-adapter.ts          # OpenClaw 适配器
```

---

## 7. Roadmap & Spike 相关触发词分析

### 在 EXPERT-PANEL-PLAYBOOK.md 中

**搜索结果**: 0 次出现 "spike" 或 "roadmap" 字样

### 在其他文档中

**Roadmap 出现位置**:
- `MASTER-PR-WAIT-WORK.md` — 任务 1 "同步和修正 Roadmap"
- `MASTER-WORKFLOW.md` — 路线图相关字段
- `MASTER-HEARTBEAT-CHECKLIST.md` — Master 定期同步 roadmap
- `POLL-SCRIPTS-GUIDE.md` — roadmap 同步

**Roadmap 工作流**:
1. 文件位置: `confluence/projects/{project}/roadmap.md` 或 `confluence/projects/{project}/requirements/roadmap.md`
2. 同步频率: 每 10 分钟检查一次
3. Master 职责: 对齐当前进度，识别风险项
4. 包含内容: Milestone 计划、进度百分比、关键路径

**Spike 出现位置**: 
- **零出现** — 框架中未定义 spike 的具体流程

---

## 8. 现有 Confluence 文档类型分类

### 按功能分类

**知识管理**:
- `memory/glossary/` — 术语表
- `memory/patterns/` — 最佳实践
- `memory/pitfalls/` — 常见陷阱
- `memory/lessons/` — 教训
- `memory/research/` — 研究记录
- `memory/retrospectives/` — 复盘

**项目管理**:
- `progress-tracker.md` — 进度追踪
- `2026/` — 按年份组织的文档

**指南文档**:
- `eket-project-hygiene.md` — 项目卫生
- `codebase-maintenance.md` — 代码库维护
- `multi-agent-collab-lessons.md` — 多智能体协作
- `red-team-bug-patterns.md` — 红队 Bug 模式
- `rule-retention-lessons.md` — 规则保持教训
- `research-methodology.md` — 研究方法论
- `borrowed-wisdom.md` — 借用的智慧

**协调文档**:
- `master-slaver-coordination.md` — Master/Slaver 协调
- `knowledge-system.md` — 知识体系
- `async-test-leak.md` — 异步测试泄漏

---

## 9. 总结对照表

| 项目 | 现状 | 位置 | 模板 | 状态 |
|------|------|------|------|------|
| **Architecture Plan** | 待创建 | `confluence/architecture/<EPIC>-plan.md` | ✅ 已有 | 准备就绪 |
| **Requirement Analysis** | 待创建 | `confluence/requirements/<EPIC>-analysis.md` | ✅ 已有 | 准备就绪 |
| **Retrospective** | 已有部分 | `confluence/memory/retrospectives/<DATE>-<TICKET>.md` | ✅ 已有 | 准备就绪 |
| **Expert Review** | 待创建 | `docs/reviews/<DATE>-<topic>.md` | ✅ 已有 | 准备就绪 |
| **Epic Definition** | 只有 1 个 | `jira/epics/<EPIC>/epic.md` | ✅ 已有 | 准备就绪 |
| **Roadmap** | ❌ 缺失 | `confluence/projects/{project}/roadmap.md` | ❌ 无模板 | **待补充** |
| **Spike Plan** | ❌ 缺失 | `confluence/spikes/<SPIKE-ID>/plan.md` | ❌ 无模板 | **待补充** |

---

## 10. 建议的后续工作

### 紧急任务
1. **创建 roadmap 模板** — `templates/confluence/roadmap.md.hbs`
2. **创建 spike 模板** — `templates/confluence/spike-plan.md.hbs`
3. **创建 confluence/architecture 目录** — 准备存放架构规划
4. **完善 doc_lifecycle.rs** — 补充 Roadmap/Spike 事件处理

### 可选优化
1. 在 EXPERT-PANEL-PLAYBOOK.md 中明确 Spike 的召唤时机
2. 补充 Roadmap 的同步算法细节
3. 创建 spike-retrospective 模板用于复盘

---

## 附录：完整文件清单

### Templates 文件
```
templates/
├── confluence/
│   ├── architecture-plan.md.hbs (342B) ✅
│   ├── expert-review.md.hbs (209B) ✅
│   ├── requirement-analysis.md.hbs (535B) ✅
│   └── retrospective.md.hbs (372B) ✅
└── jira/
    └── epic.md.hbs (210B) ✅
```

### Doc Lifecycle Templates (built-in)
```
✅ confluence/requirement-analysis.md.hbs
✅ confluence/architecture-plan.md.hbs
✅ confluence/retrospective.md.hbs
✅ confluence/expert-review.md.hbs
✅ jira/epic.md.hbs
❌ confluence/roadmap.md.hbs (MISSING)
❌ confluence/spike-plan.md.hbs (MISSING)
```

### Node Skills (29 个 JSON + 6 个 TS)
```
planning/            roadmap-prioritization.json ⭐
├── risk-assessment.json
├── sprint-planning.json
├── ticket-breakdown.json
└── roadmap-prioritization.json
```

