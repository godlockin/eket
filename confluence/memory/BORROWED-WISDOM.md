# EKET 借鉴知识库 — Borrowed Wisdom

**创建时间**: 2026-04-14
**维护者**: Master Agent
**目的**: 沉淀从外部项目借鉴的思想和规则，避免"遗忘再重发明"

---

## 目录

1. [GSD（get-shit-done）— 工程纪律框架](#gsd)
2. [Harness CD — Agent 状态声明](#harness)
3. [唐代三省六部制 — 制度性分权](#tang-dynasty)
4. [OpenAI Agents SDK — 路由描述协议](#openai-agents)
5. [通用跨项目经验](#universal)

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
