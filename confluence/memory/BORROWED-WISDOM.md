# EKET 借鉴知识库 — Borrowed Wisdom

**创建时间**: 2026-04-14
**最后更新**: 2026-04-16（Round 23）
**维护者**: Master Agent
**目的**: 沉淀从外部项目借鉴的思想和规则，避免"遗忘再重发明"

---

## 新增条目格式

每个借鉴来源作为一个顶级 Section（`## N. 来源名称`），内部子节统一结构：

```markdown
## N. 来源名称 — 核心主题 {#anchor}

**来源**: [项目名](URL)（star 数，年份）
**借鉴时间**: Round XX (YYYY-MM-DD)
**核心价值观**: "一句话总结最重要的思想"

### N.1 规则名称 — 副标题

**原则**: 规则是什么（一句话）。

**为什么重要**: 不遵守会有什么后果？

**EKET 落地**:
\`\`\`markdown
<!-- 在 EKET 中如何具体使用这条规则的示例 -->
\`\`\`

**关键规则**:（可选，列出 2~4 条具体约束）
- 约束 1
- 约束 2
```

条目字段说明：
- **来源**：必填，带链接
- **借鉴时间**：必填，方便追溯是哪轮引入的
- **核心价值观**：必填，引号格式，不超过 30 字
- **EKET 落地**：必填，抽象原则必须有落地示例，否则会被遗忘
- **关键规则**：可选，适合有具体约束条款的规则

---

## 目录

1. [GSD（get-shit-done）— 工程纪律框架](#gsd)
2. [Harness CD — Agent 状态声明](#harness)
3. [唐代三省六部制 — 制度性分权](#tang-dynasty)
4. [OpenAI Agents SDK — 路由描述协议](#openai-agents)
5. [通用跨项目经验](#universal)
6. [多智能体框架全景对比（2026-04）](#landscape)
7. [claude-code-best-practice — Claude Code 工具层最佳实践](#claude-code-best-practice)
8. [文档债 / 技术债清理 — Round 23 实战经验](#doc-debt-cleanup)

---

## 1. GSD（get-shit-done）— 工程纪律框架 {#gsd}

**来源**: [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) (52k ⭐, 2025)
**借鉴时间**: Round 19 (2026-04-14)
**核心价值观**: "Context Engineering > Prompt Engineering。文件系统就是通信协议。"

### 1.1 Nyquist Rule — 验收标准可自动化

**原则**: 每条验收标准必须附带可自动执行的验证命令，在 60 秒内完成。
禁止"手动检查"、"人眼确认"、"运行后观察"等主观验证。

**为什么重要**: 没有可执行命令的验收标准等于没有验收标准。PR review 时无法客观判断"是否完成"，歧义导致来回沟通。

**EKET 落地**:
```markdown
- [ ] 描述；验证：`<命令>`
示例：- [ ] 含 Nyquist 注释；验证：`grep -l 'Nyquist' template/jira/ticket-template.md`
```

**关键规则**:
- 命令必须在 60 秒内完成（长时间集成测试需拆分）
- 相同代码 + 相同命令 = 相同结果（可重复）
- 违反此规则的 PR 描述视同未完成验收

### 1.2 4-Level Artifact Verification — 产物验证框架

**问题**: Agent 可能"声称"已完成但产出空文件、未接线的孤立代码、纯 mock 测试。

**4 级验证**:

| 级别 | 名称 | 检查内容 | 未通过后果 |
|------|------|---------|-----------|
| L1 | 存在性 | 文件在 diff 中可见 | 直接 reject |
| L2 | 实质性 | 非空函数体、非 stub、非 `return undefined` | 直接 reject |
| L3 | 接线 | 被正确 import/export/注册（孤立文件不算完成） | 直接 reject |
| L4 | 数据流 | 有非纯-mock 测试（纯文档 PR 豁免） | 直接 reject |

**关键洞察**: L3（接线）是最常被忽略的层级。写了函数但没有注册到路由/命令/导出，等于没写。

### 1.3 Deviation Rules — 偏差处理协议

**问题**: Slaver 遇到超出 ticket 范围的问题时，不知道"自己修"还是"上报 Master"，导致要么过度修改要么卡住不动。

**4 类规则**:

| 规则 | 触发条件 | 行动 | 范围限制 |
|------|---------|------|---------|
| Rule 1 — Bug Fix | 当前 ticket 实现中的明确 bug | 自动修复 | **仅限当前 ticket 修改过的文件** |
| Rule 2 — Missing Critical | 缺少 error handling / null guard / 输入校验 | 自动补充 | **仅限新增代码** |
| Rule 3 — Blocking | missing dep / broken import / 编译错误 | 自动修复 | **仅限当前 ticket 阻塞点** |
| Rule 4 — Architectural | DB schema / 新 service / 公共 API 变更 / 100+ 行重构 | **暂停，上报 Master** | — |
| 兜底 | 同一问题修复 ≥ 3 次失败 | 停止，记录 `deferred_issues` | — |

**关键洞察**: "预存在问题"（其他文件中的 bug）不修复，只记录到 `deferred_issues` 字段。范围蔓延是最大风险。

**Rule 4 判断清单**（满足任一 → 必须上报）:
- [ ] 需要修改 DB schema 或数据结构定义
- [ ] 需要新建 service / module（不在 ticket 范围内）
- [ ] 需要修改公共 API 接口（影响其他 Slaver 的依赖）
- [ ] 受影响代码量 > 100 行
- [ ] 需要修改 CLAUDE.md / 架构文档

### 1.4 Analysis Paralysis Guard — 行动阈值规则

**问题**: Agent 陷入"分析瘫痪"——不断读文件、搜索代码，但始终不开始实际修改。消耗 context window，拖延任务进度。

**规则**: 连续 5+ 次纯读操作（Read/Grep/Glob/Search）无任何写操作 → 强制决策点

**决策点（二选一，禁止第三条路）**:
- **A. 立即开始写代码** — 即使是框架/骨架代码也算，先建立文件结构
- **B. 报告 BLOCKED** — 在执行报告里写一句话说明卡在哪里，等待 Master

**例外**: Gate Review 阶段首次分析豁免最多 10 次读操作（理解需求期）。

**关键洞察**: "再读一个文件"的感觉永远存在，必须用阈值强制打断。

---

## 2. Harness CD — Agent 状态声明 {#harness}

**来源**: Harness Continuous Delivery 平台设计
**借鉴时间**: Round 18 (2026-04-14)
**核心价值观**: "Agent 的状态声明应该像微服务健康检查一样精确。"

### 2.1 4 值状态（vs 原来的 3 值）

| 旧状态 | 新状态 | 含义 |
|--------|--------|------|
| `active` | `idle` | 空闲，可接新任务 |
| `busy` | `busy` | 满载，拒绝新任务 |
| （无） | `draining` | 优雅关闭中，完成当前任务后停止 |
| （无） | `offline` | 已离线 |

**为什么重要**: `draining` 状态允许 Master 优雅地关闭 Slaver（完成手头任务后停止），而不是强制中断。类似 K8s 的 graceful termination。

### 2.2 容量声明（Capacity Declaration）

```typescript
interface SlaverCapacity {
  maxConcurrent: number;  // 最大并发任务数
  current: number;        // 当前任务数
}
```

**busyRatio 过载检测**: `busyRatio = busy Slaver 数 / 活跃 Slaver 总数`
- `>= 0.8` → YELLOW 告警（80% Slaver 满载，新任务可能排队）

### 2.3 执行时间戳（任务时序追踪）

Ticket 执行报告必须包含:
- `started_at`: ISO 8601，Slaver 领取时填写
- `completed_at`: ISO 8601，Slaver 提交 PR 时填写

**慢任务阈值**: `in_progress` 且 `now - started_at > 120 分钟` → Master heartbeat 标黄告警

---

## 3. 唐代三省六部制 — 制度性分权 {#tang-dynasty}

**来源**: 中国唐朝中央政府组织架构（618-907 AD）
**借鉴时间**: Round 16a (2026-04-13)
**核心价值观**: "权力制衡不应依赖人的自律，而应嵌入流程。"

### 3.1 核心借鉴：三权分立逻辑

| 制度原型 | 借鉴逻辑 | EKET 实现 |
|---------|---------|----------|
| 门下省（封驳权）| 执行前阻断，有否决权 | `gate_reviewer` |
| 御史台（独立监察）| 绕过权力链直报最高层 | `independent_auditor` |
| 三省会签制度 | 审查嵌入流程，不依赖人工记忆 | 状态机 `gate_review` 节点 |

### 3.2 gate_reviewer 设计要点

- **否决后自动打回**: VETO → 状态回到 `analysis`，不是 `backlog`（已分析过，只需修正）
- **死锁防止**: 同一 ticket 被否决 ≥ 2 次，第 3 次强制降级通过 + 记录异常
- **超时保护**: 30 分钟无响应 → 自动 APPROVE（审查员失联不能成为永久阻塞）
- **否决健康率**: 10-40% 为健康。< 10% 说明 gate_reviewer 太宽松；> 40% 说明任务质量系统性差

### 3.3 independent_auditor 设计要点

- **核心约束**: 不受 Master 指挥，报告链路绕过 Master，直写 `inbox/human_feedback/`
- **防篡改**: 审计日志 append-only + SHA256 hash 链（每条记录含上一条 hash）
- **触发条件**: 非同步，异步在关键事件后运行（PR 合并、VETO、架构变更）

### 3.4 关键洞察

> 制度的力量在于：无论参与者的主观意愿如何，流程本身强制了检查点。将审查嵌入状态机，比依赖"记得要 review"更可靠。

---

## 4. OpenAI Agents SDK — 路由描述协议 {#openai-agents}

**来源**: OpenAI Agents SDK（Swarm 的后继）
**借鉴时间**: Round 15b (2026-04-13)
**核心价值观**: "Agent 的路由选择应该基于声明式描述，而非 Master 的主观判断。"

### 4.1 routing_description（P0 字段）

每个 Agent 必须声明:
```yaml
routing_description:
  best_for: "前端 UI 组件、CSS 样式、React 状态管理"
  not_for: "后端 API、数据库 Schema、基础设施"
  handoff_to: "backend_dev（API 设计）, devops（部署配置）"
```

**为什么重要**: Master 在 5-10 个候选 Agent 中路由时，如果没有声明式描述，会依赖历史经验或猜测，产生错误分配。

### 4.2 quality_gates（P0 字段）

每个 Agent 声明自己产出物的质量检查点:
```yaml
quality_gates:
  code: ["npm test", "npm run lint", "npm run build"]
  pr_checklist: ["真实 stdout", "CI 绿灯", "与 AC 一一对应"]
```

**关键洞察**: 质量门是 CI/CD 的概念。Agent 版的质量门让 Master 在 PR review 时有客观标准，不依赖主观判断。

### 4.3 confidence_model（P1 字段，EKET 首创）

```yaml
confidence_model:
  high: "React 组件 / 状态管理 / 单元测试"
  medium: "Node.js API / TypeScript 泛型"
  low: "数据库优化 / WebSocket"
  escalate: "系统架构决策 / 安全审计 / 跨团队 API 变更"
```

**为什么重要**: Agent 自知边界。`escalate` 类型任务必须上报 Master，不得独立决策。防止 Agent 在不确定领域产出低质量输出。

---

## 5. 通用跨项目经验 {#universal}

这些经验不来自特定项目，而是在 EKET 自身迭代过程中积累的。

### 5.1 分支保护 + CI 是防幻觉的基础设施

**经验**: 防幻觉不能只靠 CLAUDE.md 里的文字规则。必须有 CI gate。

**具体**: `enforce_admins: true` + `required_status_checks: [test]` + `required_pull_request_reviews: 1`
效果：任何声称"测试通过"的 PR，必须有 GitHub Actions 绿灯才能合并。文字规则防不住，机器检查才防得住。

### 5.2 验证脚本的误报比漏报更危险

**经验**: `validate-ticket-template.sh` 的 `check_tbd()` 因 `\bTODO\b` 对解释性文本（"非仅修改注释或 TODO）"）误报 WARN，导致开发者忽略所有 WARN 输出。

**规则**: 误报率 > 5% → 开发者开始忽略告警 → 真正的问题被淹没。
宁可漏报 1 个真实问题，也不要误报 10 个假问题。

**处理方式**: 分层级：FAIL（阻断）/ WARN（提醒，不阻断）/ INFO（建议，不影响通过）

### 5.3 Squash Merge 会产生新的 commit hash

**经验**: GitHub squash merge 会创建全新 commit hash，而不是复用本地最新 commit 的 hash。
**后果**: 先本地 tag 再推，tag 会指向错误的 commit。
**正确做法**: squash merge 后，从 `origin/miao` 获取新 hash，再打 tag：
```bash
git fetch origin
git tag v2.x.x $(git rev-parse origin/miao)
git push origin v2.x.x
```

### 5.4 分支保护临时解除必须立即恢复

**经验**: 为了合并 PR 临时解除分支保护（去掉 required_reviews）时，窗口越短越好。
**规范**:
1. 解除保护
2. 合并 PR（立即，不做其他事）
3. 恢复保护（立即，同一条命令链）
4. 验证保护已恢复（`gh api ... | grep enforce_admins`）

### 5.5 Instance ID 必须包含随机后缀

**经验**: `instanceId = host_pid_timestamp` 在 CI 高并发场景下碰撞（同 host+pid，1ms 内创建两个实例）。
**修复**: 添加随机后缀 `Math.random().toString(36).slice(2, 7)`
**通用规则**: 任何用于唯一标识的 ID，timestamp 精度不够时必须加随机熵。

### 5.6 git history 是最昂贵的技术债

**经验**: 误将 `docs-site/node_modules`（65MB）提交到 git 历史，清理需要 `git filter-repo` + 强推 + 所有协作者重新 clone。
**预防**: 项目第一个 commit 前必须确认 `.gitignore` 覆盖所有 build 产物。
**成本**: 历史错误的清理代价远大于预防代价（约 100:1）。

### 5.7 向后兼容的字段升级模式

**经验**: `SlaverHeartbeat.status` 从 3 值升级到 4 值时，老客户端发送的 `'active'` 需要映射到 `'idle'`。
**模式**:
```typescript
// 升级时的兼容层
const normalizeStatus = (s: string): SlaverStatus => {
  if (s === 'active') return 'idle';  // 向后兼容
  return s as SlaverStatus;
};
```
**规则**: 字段值重命名时永远需要兼容层，字段添加不需要（可选字段 + 默认值）。

### 5.8 INFO 级别检查的价值

**经验**: 在 FAIL/WARN 之外加 INFO 级别（不影响通过/失败）的检查，可以传递建议而不增加噪音。
**适用场景**: Nyquist Rule 合规性检查（建议而非强制）、代码风格提示、未来迁移路径提示。
**关键**: INFO 绝对不能影响退出码和 CI 结果，否则会被升级为 WARN/FAIL 处理。

---

## 附录：借鉴评估框架

在决定是否借鉴外部项目时，评估以下 5 个维度：

| 维度 | 问题 | 高分条件 |
|------|------|---------|
| **问题匹配度** | 我们有这个痛点吗？ | 当前已出现相关问题或 near-miss |
| **可移植性** | 能在 EKET 语境下表达吗？ | 无需引入新基础设施 |
| **可验证性** | 能写自动化检查吗？ | 有对应的 grep/test 命令 |
| **范围可控** | 改动面积小于 3 个文件吗？ | 独立 ticket，不依赖其他变更 |
| **可撤销性** | 借鉴错误时容易撤销吗？ | 纯新增内容（不修改已有逻辑）|

**判断**: 5 项中 4 项高分 → 直接借鉴；3 项 → 写 spike ticket 先验证；< 3 项 → 记录想法，暂不行动。

---

## 6. 多智能体框架全景对比（2026-04）{#landscape}

**调研时间**: 2026-04-14
**数据来源**: GitHub API 实时查询 + 官方 README

### 6.1 Stars 排行

| 框架 | Stars | 状态 | 首发年 |
|------|-------|------|--------|
| [MetaGPT](https://github.com/FoundationAgents/MetaGPT) | 67k | 活跃 | 2023 |
| [microsoft/autogen](https://github.com/microsoft/autogen) | 57k | ⚠️ 维护模式 | 2023 |
| [crewAI](https://github.com/crewAIInc/crewAI) | 49k | 活跃 | 2023 |
| [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | 29k | 活跃 | 2024 |
| [openai/openai-agents-python](https://github.com/openai/openai-agents-python) | 21k | 活跃 | 2025-03 |
| [camel-ai/camel](https://github.com/camel-ai/camel) | 17k | 活跃 | 2023 |
| [princeton-nlp/SWE-agent](https://github.com/princeton-nlp/SWE-agent) | ~14k | 活跃 | 2024 |
| [microsoft/agent-framework (MAF)](https://github.com/microsoft/agent-framework) | 9.4k | 活跃（AutoGen 继任者） | 2025-04 |
| [kyegomez/swarms](https://github.com/kyegomez/swarms) | 6.2k | 活跃 | 2023 |

**重要事件**: 2025 年 AutoGen 进入维护模式，Microsoft Agent Framework (MAF) 成为官方继任者，采用 Actor 模型 + A2A 协议。

### 6.2 各框架核心特征

#### MetaGPT — 最接近 EKET 设计哲学

- **定位**: AI 软件公司模拟器，SOP 驱动（ProductManager→Architect→Engineer）
- **通信**: 结构化消息传递 + 共享消息池（blackboard）
- **独特**: Artifact 链——每个角色输出标准化文档，强依赖链
- **Master 等价**: ProductManager（需求）→ Architect（架构）→ Engineer（实现）
- **EKET 借鉴点**: 产出物 Artifact 标准化 schema，机器可读可验证

#### CrewAI — 最流行的 Role-Based 框架

- **定位**: 角色扮演式自动化，Crews（自治）+ Flows（精确控制）双模式
- **配置**: YAML 声明式（agents.yaml + tasks.yaml）
- **独特**: Crews 与 Flows 正交设计，自治协作与精确编排可自由组合
- **Master 等价**: `Process.hierarchical` 模式自动创建 Manager Agent
- **EKET 借鉴点**: 重复性工作流模板化（Crew 化），减少 Master 介入

#### LangGraph — 最强状态管理，生产级首选

- **定位**: 有状态 Agent 的低层编排框架（受 Google Pregel 启发）
- **架构**: DAG 图，节点=Agent/函数，边=状态转移
- **独特**: Durable Execution（断点恢复）+ 时间旅行调试 + Subgraph 嵌套
- **持久化**: 内建 checkpoint，跨会话状态恢复，失败可续
- **EKET 借鉴点**: ⭐ **Ticket 执行快照 + 断点恢复**（EKET 最明显短板）

#### Microsoft Agent Framework（MAF）— 企业级 AutoGen 继任者

- **定位**: 生产就绪，Actor 模型 + A2A/MCP 互操作
- **独特**: 跨框架互操作（Agent-to-Agent 协议），Semantic Kernel 集成
- **企业**: 微软长期支持承诺，Azure AI Foundry 可观测性
- **EKET 借鉴点**: A2A + MCP 互操作（EKET 开放生态的未来路径）

#### OpenAI Agents SDK — Handoff 范式

- **定位**: 轻量级，Handoff（任务移交）而非指派
- **架构**: 去中心化，Triage Agent → 专业 Agent 动态路由
- **独特**: 内建 Guardrails（输入/输出边界检查）+ tracing
- **EKET 借鉴点**: Slaver 完成后直接 handoff 给下一 Slaver（减少 Master 协调开销）

#### SWE-agent — 编码专用 SOTA

- **定位**: 专门解决 GitHub issue，ACI（Agent-Computer Interface）设计
- **成绩**: SWE-bench verified 65%+（开源最强）
- **独特**: 为 agent 定制专用 bash 命令集（非原始 shell），减少噪音
- **EKET 借鉴点**: ACI 接口设计——Slaver 执行代码任务时可定制专用命令集

### 6.3 结构化对比总表

| 维度 | MetaGPT | CrewAI | LangGraph | MAF | OpenAI Agents | **EKET** |
|------|---------|--------|-----------|-----|---------------|---------|
| 架构模式 | 中心化SOP | 中心/去中心 | 图状态机 | Actor模型 | Handoff链 | **中心化Master-Slaver** |
| 任务调度 | 角色订阅 | 声明+动态委托 | 条件边路由 | 事件驱动 | 动态Handoff | **Ticket状态机** |
| 状态持久化 | 弱 | 中 | ✅强 | ✅强 | 弱 | **中（文件队列+SQLite）** |
| 断点恢复 | ❌ | ❌ | ✅ | ✅ | ❌ | **❌（待补）** |
| 角色系统 | ✅固定 | ✅YAML | ❌需自建 | ✅ | ❌动态 | **✅角色+技能系统** |
| 人类介入 | ✅ | ✅ | ✅ | ✅ | ✅ | **✅（inbox机制）** |
| 代码开发专用 | ✅ | 部分 | ❌通用 | 部分 | ❌通用 | **✅核心场景** |
| 降级容灾 | ❌ | ❌ | 部分 | ❌ | ❌ | **✅三级降级** |
| Gate Review | ❌ | ❌ | ❌ | ❌ | ❌ | **✅（业界独创）** |
| Anti-Hallucination | ❌ | ❌ | ❌ | ❌ | Guardrails | **✅红线规则** |
| 互操作协议 | 弱 | 弱 | MCP | A2A+MCP | MCP | **❌（待补）** |

### 6.4 EKET 差异化定位

**独有优势**（其他框架没有）：
1. **文件系统优先 + 三级降级** — 无依赖可运行，零基础设施启动
2. **Gate Review 协议** — 任务执行前强制交叉审查，防 AI 幻觉，业界独创
3. **Anti-Hallucination 红线** — 禁止伪造测试/无 CI 绿灯不合并，明确规则化
4. **Inbox P0/P1/P2 分级** — 人类指令优先级响应机制
5. **Master+Slaver 心跳自检** — 定期强制反思问题列表

### 6.5 借鉴优先级路线图

| 优先级 | 差距 | 借鉴来源 | 具体方向 |
|--------|------|---------|---------|
| **P0** | Ticket 断点恢复 | LangGraph checkpointing | Slaver 重启可从快照续跑，不重头 |
| **P0** | 继续深化 Gate Review | — | 护城河，持续强化 |
| **P1** | 产出物 schema 化 | MetaGPT Artifact 链 | 分析报告/PR/测试结果统一机器可读格式 |
| **P1** | Slaver 间 Handoff | OpenAI Agents SDK | Master 审批后 Slaver A 直接移交 Slaver B |
| **P1** | 工作流模板化 | CrewAI Flows | 重复性流程 Crew 化，无需 Master 介入 |
| **P2** | A2A/MCP 互操作 | MAF | 暴露标准接口，外部 agent 可接入任务队列 |
| **P2** | 执行 DAG 可视化 | LangSmith | Ticket 执行路径可视化追踪 |
| **P2** | ACI 接口设计 | SWE-agent | Slaver 执行代码任务时定制专用命令集 |

### 6.6 竞争格局一句话总结

> EKET 在**工程可靠性**（三级降级容灾）和**质量门控**（Gate Review + Anti-Hallucination）两个维度领先所有竞争者。这是真正的护城河——其他框架能复制功能，但复制不了经过多 Round 迭代验证的工程纪律体系。

---

## 7. claude-code-best-practice — Claude Code 工具层最佳实践 {#claude-code-best-practice}

**来源**: [shanraisshan/claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice)（44k ⭐，GitHub Trending #1，2026-03）
**借鉴时间**: Round 22 (2026-04-15)
**作者背景**: Shayan Raisshan（Claude Community Ambassador）+ Anthropic 核心团队（Boris Cherny 创始人、Thariq Shihipar 等）第一手实践
**核心价值观**: *"from vibe coding to agentic engineering — practice makes claude perfect"*

---

### 7.1 三机制分工原则：Agent / Command / Skill

**最重要的架构贡献**：清晰定义了 Claude Code 三个扩展机制的分工，以及"何时用哪个"的决策规则。

| 机制 | 位置 | 上下文 | 自动触发 | 适用场景 |
|------|------|--------|---------|---------|
| **Skill** | `.claude/skills/<name>/SKILL.md` | 内联（主对话） | ✅ 通过 description | 可复用知识单元，零开销 |
| **Agent** | `.claude/agents/<name>.md` | **独立子进程** | ✅ 通过 description | 自治多步骤任务，需要隔离上下文 |
| **Command** | `.claude/commands/<name>.md` | 内联（主对话） | ❌ 只能用户 `/` 触发 | 需要用户主动发起的编排入口 |

**黄金编排模式**：
```
[C] Command（用户触发 → 编排入口）
    ↓
[A] Agent（自治多步骤 → 隔离上下文）
    预加载 Skill（领域知识）
    ↓
[S] Skill（可复用输出 → 内联执行）
```

**轻量优先规则**：同一意图有多个机制可用时，优先选最轻量的：`Skill → Agent → Command`。

---

### 7.2 Skill description 是触发器，不是摘要

**问题**：Skill 的 `description` 字段写功能摘要，Claude 不知道何时该触发。

**规则**：description 要为**模型**写，描述"何时应该触发"，而不是描述"这个 Skill 是什么"：

```yaml
# ❌ 错误（功能摘要）
description: "管理 Redis 连接的工具"

# ✅ 正确（触发条件）
description: "Use when checking Redis connectivity, listing Slavers, or
diagnosing connection issues. Triggers on: 'redis', 'connection', 'slaver list'."
```

**模板**：`"Use when [用户场景]. Triggers when user mentions [关键词]. Provides [输出]."`

**EKET 落地**：TASK-030，已重写 template/skills/ 下全部 23 个 YAML 的 description。

---

### 7.3 settings.json 强制行为 vs CLAUDE.md 建议行为

**来源**：Boris Cherny（Claude Code 创始人）内部实践

> **"CLAUDE.md is guidance, settings.json is enforcement."**

**问题**：CLAUDE.md 里写"NEVER do X"是软约束，Claude 在上下文压力下可能忽略。

**规则**：确定性的禁止行为必须用 settings.json 的 permissions 系统强制：

```json
{
  "permissions": {
    "allow": ["Read(*)", "Edit(jira/**)"],
    "ask":   ["Bash(git merge*)", "Edit(template/**)"],
    "deny":  ["Edit(node/src/**)", "Bash(npm run build*)"]
  }
}
```

**三级语义**：
- `allow`：无需确认，直接执行
- `ask`：执行前弹出确认对话框
- `deny`：物理级阻断，无论 prompt 怎么说都不执行

**EKET 落地**：TASK-031，新增 settings.master.json（deny node/src/**）和 settings.slaver.json（deny force push 到受保护分支）。

---

### 7.4 动态 Shell 注入（!`command` 语法）

**发现**：Claude Code 支持在 CLAUDE.md / Skill 文件中使用反引号动态执行 Shell 命令，输出注入到上下文。

```markdown
## 实时状态（每次启动自动刷新）

待执行任务：!`find jira/tickets -name "*.md" | xargs grep -l "状态.*ready" | sort`
当前 PR：!`gh pr list --base miao --state open --json number,title | jq -r '.[] | "#\(.number) \(.title)"'`
```

**关键价值**：CLAUDE.md 从"写死的静态文档"变为"每次启动自动获取实时数据的动态上下文"。

**安全原则**：注入命令只用只读操作（find/grep/git log/gh pr list），禁止有副作用的命令。Fallback：`|| echo "(unavailable)"` 防命令失败导致上下文报错。

**EKET 落地**：TASK-032，新增 CLAUDE.master.md（5处注入）和 CLAUDE.slaver.md（3处注入）。

---

### 7.5 Agent Memory — 跨会话持久记忆

**Claude Code v2.1.33+ 原生特性**，Agent 可声明 memory 级别，跨会话积累知识：

```yaml
---
name: gate-reviewer
memory: project   # 团队共享，写入 .claude/agent-memory/gate-reviewer/
---
```

**三级存储**：

| 级别 | 路径 | 版本控制 | 共享 | 适用场景 |
|------|------|---------|------|---------|
| `user` | `~/.claude/agent-memory/<name>/` | ❌ | ❌ | 跨项目通用经验 |
| `project` | `.claude/agent-memory/<name>/` | ✅ | ✅ | 团队共享的项目约定 |
| `local` | `.claude/agent-memory-local/<name>/` | ❌（gitignore） | ❌ | 个人私有知识 |

**工作机制**：启动时自动读取 `MEMORY.md` 前 200 行注入系统提示；超出后 Agent 自动迁移到主题文件。

**激活方式（在 prompt 中明确要求）**：
```markdown
- 启动时：Review your memory for historical patterns before starting.
- 完成后：Update your memory with new patterns discovered in this session.
```

**最佳组合**：Skill（静态领域知识）+ Memory（动态积累的历史经验），两者互补。

**EKET 落地**：TASK-033，gate_reviewer（8条否决模式种子）和 code_reviewer（12条代码风格 + 14条反模式种子）均已配置 `memory: project`。

---

### 7.6 /loop 自动化重复任务

**Boris Cherny 内部工作流**：`/loop 30m /heartbeat:master` — 每 30 分钟自动执行心跳，无需人工触发。

```bash
/loop 30m /heartbeat:master   # Master 心跳：任务队列 + Slaver 进度 + gate_review 超时 + inbox
/loop 10m /heartbeat:slaver   # Slaver 心跳：当前任务 + 依赖检查 + 分支状态
/loop 5m  /babysit-pr         # PR 监控：每 5 分钟检查 CI 状态
```

**与手动心跳的差距**：手动心跳依赖"记得执行"，/loop 将其变成基础设施，永不遗漏。

**EKET 落地**：TASK-034，新增 heartbeat-master.md（7处动态注入）和 heartbeat-slaver.md（6处动态注入）。

---

### 7.7 Skill 渐进式披露结构

**推荐的 Skill 文件夹结构**（不是单文件，是目录）：

```
skills/<name>/
├── SKILL.md          # 核心提示（200行以内，触发条件描述）
├── MEMORY.md         # 动态积累的 Gotchas（可选，需配合 memory: 字段）
├── references/       # API 文档、规范参考
├── scripts/          # 可内嵌执行的脚本（让 Claude 专注组合而非重建）
└── examples/         # 输入/输出示例
```

**关键原则**：
- SKILL.md 只写能改变 Claude 默认行为的内容，不写废话
- 建立 Gotchas 区：收集 Claude 反复踩的坑
- 内嵌脚本：给 Claude 可复用代码，而非让它每次重新生成

---

### 7.8 Skill 的 9 种类型分类（Thariq，Anthropic 内部）

Anthropic 内部数百个 Skill 归纳为 9 类，按类别设计触发条件：

| 类型 | 描述 | 触发关键词模板 |
|------|------|-------------|
| Library & API Reference | 内部库/CLI 使用说明 + gotchas | `Use when using [lib-name]` |
| Product Verification | 产品测试验证（最值得花时间打磨） | `Use when verifying [feature]` |
| Data Fetching & Analysis | 连接数据/监控栈 | `Use when querying [data-source]` |
| Business Process & Team Automation | 重复流程自动化 | `Use when [process] needs to run` |
| Code Scaffolding & Templates | 代码脚手架 | `Use when creating new [type]` |
| Code Quality & Review | 代码质量强制 | `Use when reviewing [scope]` |
| CI/CD & Deployment | 部署运维 | `Use when deploying [service]` |
| Runbooks | 故障诊断 | `Use when [service] has issues` |
| Infrastructure Operations | 基础设施操作（常需防护） | `Use when managing [infra]` |

---

### 7.9 CLAUDE.md 200 行原则 + `<important if="...">` 标签

**200 行原则**：每个 CLAUDE.md 保持在 200 行以内。大型项目用 `.claude/rules/` 目录拆分，通过 `@path` 导入组合。

**防忽略技术**（解决 CLAUDE.md 变长后被 Claude 忽略的问题）：

```xml
<important if="user asks about authentication">
  Always use JWT with RS256, never HS256
</important>
```

规则只在相关上下文中激活，不会因为文件太长被淹没。

**Monorepo 加载策略**：
- 向上加载（Ancestor）：启动时自动加载所有父目录的 CLAUDE.md
- 向下懒加载（Descendant）：只在访问子目录文件时才加载
- 平级不加载（Sibling）：`frontend/` 和 `backend/` 互不干扰

---

### 7.10 关键洞见：给 Claude 验证自己工作的方式

**Boris Cherny 最重要的一条（#13）**：

> **"给 Claude 验证自己工作的方式，能 2-3x 提升输出质量。"**

这正是 EKET 的 Gate Review 和 Nyquist Rule 在做的事——强制 Agent 在完成后用命令验证结果，而不是声称完成。这是 EKET 与其他框架最大的差异化来源之一。

**具体形式**：
- Nyquist Rule：每条验收标准必须附带可执行验证命令
- Gate Review：任务执行前独立审查员交叉验证
- Stop Hook：Agent 完成时自动触发验证脚本
- 4-Level Artifact Verification：L1 存在性 → L2 实质性 → L3 接线 → L4 数据流

---

### 7.11 EKET 与 claude-code-best-practice 的互补定位

| 维度 | claude-code-best-practice | EKET |
|------|--------------------------|------|
| **焦点** | Claude Code 工具层配置（Skill/Agent/Hook） | 多 Agent 协作流程管理（Ticket/Branch/Review） |
| **粒度** | 工具层 | 流程层 |
| **状态管理** | 无（对话即状态） | 有（Jira Ticket 状态机） |
| **互补性** | ⭐⭐⭐⭐⭐ 高度互补 | — |

**结论**：EKET 是**流程框架**，claude-code-best-practice 是**工具使用手册**。EKET 在架构设计（Gate Review、三仓库分离、Ticket 状态机）上已超越大多数同类，但工具层的 Claude 原生特性利用（Memory、/loop、动态注入、settings.json 权限）有很大提升空间——本次 Round 22 已完成主要补齐。

---

## 8. 文档债 / 技术债清理 — Round 23 实战经验 {#doc-debt-cleanup}

**来源**: EKET 自身项目（Round 23，2026-04-15）
**背景**: 经过 22 轮迭代后，项目积累了大量游离文件、断链、过时内容和重复文档，进行了一次系统性多轮清理（PR #49~#54），净减少约 **7,000+ 行**过时内容。

本次经验已拆分为三份独立文档，内容更完整：

| 文档 | 主题 |
|------|------|
| [DOC-DEBT-CLEANUP.md](DOC-DEBT-CLEANUP.md) | 通用方法论：四种债务类型、清理顺序、断链检测、archive 结构、预防规则 |
| [EKET-PROJECT-HYGIENE.md](EKET-PROJECT-HYGIENE.md) | EKET 特有规则：template/ 引用判断、ticket 状态一致性、outbox 清理、三仓库归属 |
| [MULTI-AGENT-COLLAB-LESSONS.md](MULTI-AGENT-COLLAB-LESSONS.md) | 多智能体协作经验：任务分配、并行风险、环境依赖处理、失败模式（来自 Round 2/3） |
| [RULE-RETENTION-LESSONS.md](RULE-RETENTION-LESSONS.md) | 规则保持性与遗忘防治：三层防御纵深、CLAUDE.md 拆分陷阱、ESM mock 陷阱、强制复盘价值 |

### 核心原则（快速参考）

1. **先移动后修链**：位置稳定前修链是无效劳动
2. **删除前 grep**：`grep -rn "FILENAME" . --include="*.md"` 先确认没有引用
3. **template/ 不是断链**：描述未来项目结构的引用，不需要修复
4. **archive 要有结构**：按版本/类型分目录，不是垃圾桶
5. **ticket 状态要清理**：定期检查僵尸 `IN_PROGRESS`，每 10 轮迭代扫描一次

