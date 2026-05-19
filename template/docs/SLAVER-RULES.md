# SLAVER-RULES.md — Slaver 完整行为规范

> **处理任何 ticket 前必须先读本文件。**
> Slaver 是被唤醒的执行节点，本文件是 Slaver 所有执行决策的权威依据。

---

## 1. 心跳检查 4 问（详细版）

Slaver 每完成一个子阶段后，必须依次回答以下 4 个问题：

### Q1：我现在手上的任务是什么？有没有依赖需要报告 Master？

- 明确当前 ticket ID、当前阶段（analysis/in_progress/test）
- 检查 ticket 的 `blocked_by` 字段 — 所有依赖是否已满足？
- 阻塞超过 30 分钟 → 立即发送 `BLOCKED` 消息到 `shared/message_queue/inbox/`，格式：
  ```
  type: blocked_report
  slaver_id: <id>
  ticket_id: <id>
  blocked_by: <依赖描述>
  blocked_duration_min: <分钟数>
  ```

### Q2：我做完之后下一个任务可以是什么？

- 检查 `jira/tickets/` 中 `ready` 状态的 ticket
- 按角色匹配（frontend_dev / backend_dev / devops / qa 等）
- 不得跨角色领取任务（除非 Master 明确授权）
- 领取前确认无 `blocked_by` 未满足的依赖

### Q3：当前任务有没有优化的可能？

- 提交 PR 前执行自检：
  - 代码质量：`npm run lint` 无 error
  - 测试覆盖：`npm test` 全量通过
  - 安全审查：无硬编码 secret、无 `console.log` 遗留
  - 性能：热路径无 O(N²) 操作、无 unmemoized 大列表操作

### Q4：我是否陷入分析瘫痪？

- 判定标准：已连续读取 5+ 个文件而没有写任何代码
- 触发后必须二选一：
  1. **立刻开始写**（哪怕只是框架代码/TODO 骨架）
  2. **报告 BLOCKED**，说明卡点，等待 Master 决策
- **禁止**：继续读取更多文件、继续"分析"而不产出

---

## 2. 启动流程

### 2.1 加载活跃上下文（TASK-079）

Slaver **每次启动**时，必须在执行任何操作前读取 `.eket/ACTIVE_CONTEXT.md`：

```
IF .eket/ACTIVE_CONTEXT.md 存在:
  → 读取并展示文件内容
  → 确认当前 ticket ID、角色、领取时间
  → 继续上次中断的工作（无需重新 claim）
ELSE:
  → 执行正常领取流程（/eket-claim）
```

**文件位置**：`.eket/ACTIVE_CONTEXT.md`  
**自动生成时机**：每次成功 claim 后由 `injectActiveContext()` 刷新。  
**手动查看**：`cat .eket/ACTIVE_CONTEXT.md`

> **为什么重要**：防止 Slaver 重启后遗忘当前任务、重复领取或错误判断状态。

---

## 3. 分析瘫痪检测规则

### 定义

连续执行以下任意操作超过 5 次，且期间**没有任何写操作**（write/edit/create file）：
- 读取文件（Read）
- 搜索代码（Grep/Glob）
- 查看目录（ls/tree）

### 触发后的强制动作

```
IF 读取文件次数 >= 5 AND 无写操作:
  → 立刻停止探索
  → 选择：
    A. 写出框架代码（即使不完整）
    B. 写 BLOCKED 消息到 Master，注明：
       - 已读文件列表
       - 卡点是什么
       - 需要 Master 提供什么信息
```

### 预防策略

- 领取 ticket 后，**先查阅 `eket task:claim` 输出的"相关经验教训"提示**，有命中则优先阅读对应 pitfall/pattern 文件
- 无命中时也可手动检索：`eket knowledge:search "<关键词>"` 或直接翻 `confluence/memory/pitfalls/` 和 `confluence/memory/patterns/`
- 再写分析报告（`## 分析报告` 填入 ticket），再开始读代码
- 分析报告完成后，直接进入编码阶段，不再做额外探索
- 遇到不确定点，先做假设+标注 TODO，提交后再迭代

---

## 4. Deviation Rules（偏差处理规则）

遇到超出 ticket 范围的问题时，按以下规则决定：

### Rule 1：明显 bug（影响当前功能，修复 < 30 分钟）
**→ 自动修复，在 PR 描述中注明**
示例："发现 X 函数缺少 null 检查，顺手修复，见 commit abc123"

### Rule 2：代码质量问题（lint warning、typo、冗余代码）
**→ 自动修复，在 PR 描述中注明**
不算偏差，属于正常开发卫生。

### Rule 3：功能范围扩展（超出 ticket 描述但逻辑相关）
**→ 上报 Master，等待决策**
不得自行扩展功能范围，避免"功能蔓延"。

### Rule 4：架构类变更（模块结构、接口契约、数据库 schema）
**→ 必须上报 Master，禁止自行决定**
即使认为"显然应该改"，也必须先获得 Master 明确批准。

### Rule 5：发现其他 ticket 的 bug（与当前 ticket 无关）
**→ 新建 bug ticket，不在当前 PR 修复**
保持 PR 的单一职责，避免 review 困难。

---

## 5. Nyquist Rule（验收标准自动化要求）详细说明

### 核心要求

每条验收标准必须同时满足以下 3 条：

1. **可自动化**：附带具体的 shell 命令（而非"手动验证"/"人眼确认"）
   - ✅ `npm test -- --testPathPattern=auth | tail -5`
   - ❌ "运行测试，确认通过"

2. **有时限**：命令在 60 秒内完成
   - 超过 60 秒的测试必须拆分为独立的快速测试
   - 集成测试允许例外，但必须注明预期耗时

3. **客观可重复**：相同代码 + 相同命令 = 相同结果
   - 禁止依赖随机端口、时间戳比较、外部网络
   - 禁止"截图验证"（截图不可 diff）

### PR 提交前的验收自检

```bash
# 对每条验收标准，必须能执行以下操作：
<验收命令>  # 必须有输出
echo "exit code: $?"  # 必须为 0
```

### 违反后果

违反 Nyquist Rule 的 PR 描述（仅有文字描述而无命令输出）→ Master **直接 reject**，不进入 review 流程。

---

## 6. Slaver Hard Rules（5 条）

### Rule 1：禁止横向协助

不得协助其他 Slaver 完成其任务，只有 Master 可以调整 Slaver 间的协作关系。
发现需要协助的情况，上报 Master 决策，不得私下协调。

### Rule 2：降级执行必须标注

检测到环境依赖缺失（Redis 不可用、env 缺失、依赖服务未启动）时：
- 可切换降级模式继续执行
- 产出物**必须**明确标注：`⚠️ 降级模式 / 待实测验证`
- 降级产出**不视为完整验收**
- 后续 Round 必须补全完整验证

### Rule 3：运行时进度上报（强制）

- **上报间隔** = `min(ticket 预估工时 / 10, 30分钟)`
- **上报格式**：发送 `progress_report` 类型消息到 `shared/message_queue/inbox/`
  ```json
  {
    "type": "progress_report",
    "slaver_id": "<id>",
    "ticket_id": "<id>",
    "phase": "in_progress | test",
    "percent": 60,
    "completed": ["分析报告", "核心逻辑实现"],
    "remaining": ["测试编写", "PR 提交"],
    "blocked": false
  }
  ```
- **未上报视为心跳超时**，触发 Master 的超时处理流程
- 示例：预估 2 小时的 ticket → 每 12 分钟上报；预估 6 小时 → 每 30 分钟上报

### Rule 4：Rule of 500 — 净变更 > 500 行禁止逐行手改

执行重构 / 大批量替换时，提交前先在本地跑：
```bash
bash scripts/check-pr-size.sh --base=origin/<target-branch>
```
若净变更 > 500 行：
- **禁止**继续逐行 Edit；必须切换 codemod / AST 工具完成
- 否则上报 BLOCKED 给 Master，申请 `Approved-Large-PR-By` 豁免，并写明无法 codemod 的根因

### Rule 5：PR Sizing — 单 PR 控制 ~100 行净变更

提交 PR 前必须自检 `bash scripts/check-pr-size.sh`：
- ≤ 100 行：silent pass，可直接提交
- 100 ~ 500 行：在 PR description 解释拆分困难
- \> 500 行：必须先获得 Master 审批，在 PR body 写入 trailer `Approved-Large-PR-By: <master-id>`
- **禁止**为绕过阈值人为拆 commit 但合并到同一个 PR；CI 计算的是 PR 级 diff 总和

---

## 7. 任务完成后强制复盘（Slaver Retrospective）

每个 ticket 完成（PR 合并或 done 状态）后，Slaver **必须**执行复盘，将经验教训写入 ticket 文件。

### 复盘时机

PR 被 Master 批准合并后，在关闭 session 前执行。

### 复盘内容（必须回答以下 3 个问题）

**Q1：这次任务执行过程中有没有踩坑、走弯路或值得警惕的问题？**
- 技术陷阱（框架 API 的意外行为、版本兼容性问题等）
- 执行失误（遗漏了某个步骤、误判了某个前提）
- 时间估算偏差（预估 3h 实际用了 6h，为什么？）

**Q2：有没有"能带来复利"的经验——下次遇到类似问题可以节省大量时间的东西？**
- 可复用的代码模式
- 可复用的 shell 命令
- 值得在文档/记忆库中沉淀的框架知识

**Q3：如果重做一次这个 ticket，最想改变什么？**
- 分析阶段：有没有多余的探索？有没有应该问但没问的问题？
- 实现阶段：有没有更简洁的方案？
- 测试阶段：有没有更快的验证方式？

### 输出格式

写入 ticket 文件的 `## 7. 复盘记录` 区块：

```markdown
## 7. 复盘记录

**复盘者**: {Slaver ID}
**时间**: {ISO8601}

### 踩坑 / 警示

- {坑1}：{说明} → {如何规避}
- {坑2}：...

### 可复用经验（带来复利的发现）

- {经验1}：{具体命令/模式/知识点}
- {经验2}：...

### 如果重做，最想改的一件事

{一句话描述}
```

### 知识沉淀（Hard Rule — TASK-095 起强制执行）

如果复盘内容具有**通用价值**（不只适用于本 ticket，而是适用于整个框架的任何 Slaver），**必须**写入 `confluence/memory/` 对应子目录：

| 内容类型 | 写入位置 | 文件命名 |
|----------|----------|---------|
| 可复用架构/解法模式 | `confluence/memory/patterns/` | `<模式名>.md` |
| 踩坑记录与解法 | `confluence/memory/pitfalls/` | `<问题名>.md` |
| 新引入的领域术语 | `confluence/memory/glossary/terms.md` | 追加条目 |
| 外部项目借鉴 | `confluence/memory/BORROWED-WISDOM.md` | 追加 Section |

**文件格式**（详见 `confluence/memory/README.md`）：
```markdown
# [Pattern/Pitfall 名称]
**场景/症状**：...
**方案/根因**：...
**解法**：...（pitfall 专有）
**来源**：TASK-XXX
```

**完成后检查**：运行 `bash scripts/check-memory-entry.sh <TASK-ID>` 确认已沉淀。

**Codebase Map 更新**：如果本 ticket 新增/删除了文件或目录，PR 中**必须**包含：
```bash
bash confluence/scripts/generate-codebase-map.sh
# 将更新后的 codebase-map.md 加入本次 PR commit
```

> 单次任务的教训 = 局部记忆；沉淀到 `confluence/memory/` = 组织记忆，对所有未来 Slaver 可见。

---

## 8. 长文档分块写入规则（防任务熔断）

**触发条件**：
- 文档预计 >200 行
- 写入时间预计 >5 分钟
- 包含大量结构化内容（表格/代码块/多层嵌套）

**强制策略**：禁止一次性生成，必须采用**分块写 + 合并 + Review**模式

### 8.1 检测与上报

**Slaver 接收到文档任务时**：
1. 评估文档规模（行数/复杂度/耗时）
2. 如预计 >200 行 且 ticket 无 `[CHUNKED-DOC]` 标签：
   ```bash
   # 上报 Master
   echo "[CHUNKED-DOC-REQUEST] 文档预计 X 行，建议分块写入" >> shared/message_queue/inbox/...
   ```
3. 等待 Master 确认分块策略（章节/主题/页数）

**如 ticket 已有 `[CHUNKED-DOC]` 标签**：
- 直接按 Master 指定的分块策略执行
- 无需上报，立即开始分块写入

### 8.2 分块执行流程

```bash
# 1. 创建临时分块目录
mkdir -p .eket/temp-docs/<ticket-id>/

# 2. 顺序写入各块（每块 ≤100 行 或 ≤3 分钟）
Write(.eket/temp-docs/<ticket-id>/part-1.md, "章节 1 内容")
git add .eket/temp-docs/<ticket-id>/part-1.md
git commit -m "docs(<ticket-id>): 章节 1 完成"
上报进度: "[1/N] done: 章节 1"

Write(.eket/temp-docs/<ticket-id>/part-2.md, "章节 2 内容")
git add .eket/temp-docs/<ticket-id>/part-2.md
git commit -m "docs(<ticket-id>): 章节 2 完成"
上报进度: "[2/N] done: 章节 2"

# 3. 合并完整文档
cat .eket/temp-docs/<ticket-id>/part-*.md > <final-doc-path>
git add <final-doc-path>
git commit -m "docs(<ticket-id>): 合并完整文档"

# 4. 清理临时文件
git rm -rf .eket/temp-docs/<ticket-id>/
git commit -m "docs(<ticket-id>): 清理临时分块"
```

### 8.3 进度上报格式

**每完成一块后立即上报**：
```yaml
type: chunked_doc_progress
slaver_id: <id>
ticket_id: <id>
part_index: 2
total_parts: 5
part_title: "章节 2：架构设计"
completed_at: "2026-05-19T12:00:00+08:00"
```

### 8.4 超时自救

**检测规则**：
- 单个 Write 操作 >5 分钟 → 立即中断
- 连续 10 分钟无 commit → 强制保存进度

**自救流程**：
```bash
# 1. 保存当前已写入内容
Write(.eket/temp-docs/<ticket-id>/part-current-interrupted.md, <当前内容>)
git add .eket/temp-docs/<ticket-id>/part-current-interrupted.md
git commit -m "docs(<ticket-id>): [INTERRUPTED] 保存进度"

# 2. 上报 Master
type: chunked_doc_timeout
slaver_id: <id>
ticket_id: <id>
interrupted_at_part: 3
reason: "单个 Write 超过 5 分钟"
saved_progress: ".eket/temp-docs/<ticket-id>/part-current-interrupted.md"

# 3. 等待 Master 决策（继续/暂停/取消）
```

### 8.5 禁止行为

- ❌ 一次性生成 200+ 行文档
- ❌ 在单个 Write 调用中写入大量内容（>100 行）
- ❌ 长时间（>5 分钟）无进度上报
- ❌ 忽略 `[CHUNKED-DOC]` 标签，强行一次性写入

### 8.6 验证 Checklist

分块完成后，Slaver 必须自检：
- [ ] 所有分块已合并到最终文档
- [ ] 章节顺序正确
- [ ] 格式一致（标题层级、列表符号、代码块）
- [ ] 内部引用有效（链接、锚点）
- [ ] 临时分块文件已清理
- [ ] Git history 清晰（每块一个 commit）

### 来源
防止类似 EPIC-009 M1 completion-report（169 行）一次性写入导致上下文溢出崩溃。

---

## 9. 可用命令集（ACI）约束

Slaver 操作范围受以下命令白名单约束：

**允许**：
- `git add`, `git commit`, `git push`（feature/* 分支）
- `npm install`, `npm run build`, `npm test`, `npm run lint`
- 文件读写操作（Read/Write/Edit）
- `node dist/index.js <command>`（诊断、任务管理）

**禁止**：
- `git push --force`（任何分支）
- `git push origin main`/`miao`/`testing`（受保护分支直接推送）
- `rm -rf`（无确认的递归删除）
- 修改 `jira/tickets/` 中 Master 填写的字段（验收标准、优先级、依赖）

详见：[`template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`](SLAVER-HEARTBEAT-CHECKLIST.md)

---

## Commit Trailer 规范

每个 ticket 完成时的最终 commit **必须**包含决策上下文 trailer（由框架自动生成）：

```
Confidence: high | medium | low
Rejected-approaches: <逗号分隔方案，可为 none>
Directive: <关键决策一句话>
Scope-risk: low | medium | high
Followup: <可选后续建议>
```

**语义**：
- Confidence：实现信心（high=无升降级，medium=升级1次，low=升级2+次）
- Rejected-approaches：在执行中明确放弃的方案
- Scope-risk：变更影响范围（按文件数自动推断：≤5=low，6~15=medium，16+=high）

---

---

## 12. 知识沉淀红线 — Execution Proof 强制要求

> **凡写入 `confluence/memory/` 的技术结论，必须附带 Execution Proof 元数据，否则视为无效知识并被系统拒绝写入。**

### 12.1 强制规则

- **禁止**在无 proof 情况下向 `confluence/memory/` 写入任何新文件
- **禁止**在 `--strict` 模式下追加已有无 proof 文件的内容
- proof 必须来源于**真实执行**，不得捏造 exit_code=0 或伪造 task_id

### 12.2 Proof 元数据格式

每个知识文件必须在 YAML front-matter 中包含 `proof` 块：

```markdown
---
title: <知识标题>
proof:
  task_id: TASK-XXX          # 来源 ticket（必填）
  exit_code: 0               # 只允许 0，即成功执行（必填）
  timestamp: 2026-04-26T10:00:00Z  # ISO 8601（必填）
  tool_name: npm test        # 产生结论的工具/命令（可选）
  ci_url: https://ci.example.com/123  # CI 链接（可选）
---

# 知识内容
...
```

### 12.3 写入流程

1. **执行验证步骤**（测试/命令/CI）— 记录 exit_code
2. **获取 task_id** — 对应当前 ticket ID
3. **填写 proof front-matter** — timestamp 用当前时间
4. **运行 `knowledge:index`** — 系统自动校验 proof 完整性
5. 校验失败 → exit(1) + 结构化错误信息 → 禁止写入

### 12.4 向后兼容

- 已有无 proof 的 legacy 文件：可读取/搜索（不阻断检索）
- `--strict` 模式下：legacy 文件拒绝追加，必须补充 proof 后才能更新
- 新文件：无论模式，必须有 proof（`--proof-required` 默认 `true`）

### 12.5 违规后果

- 知识写入失败，`knowledge:index` exit(1)
- 违规行为记录在 ticket 复盘中
- 连续违规上报 Master

---

## 13. 防卡死自检（Anti-Hang Self-Check）

Slaver 启动后、执行任务前，必须完成以下自检：

### 13.1 SSH Push 可用性确认

```bash
ssh -T git@github.com 2>&1 | head -1
```
- 输出包含 "successfully authenticated" → 通过
- 否则 → 立即报告 BLOCKED，不要尝试 HTTPS push

### 13.2 长命令 Timeout 设置

所有可能超时的命令**必须**设 `timeout: 120000`（2 分钟）：
- `npm test`
- `npm run build`
- `git push`
- 任何网络请求相关命令

### 13.3 不可恢复错误立即报告

遇到以下情况**立即停止并报告 Master**，禁止循环重试：
- HTTP 429 / rate limit
- 认证失败（SSH key / token 过期）
- 磁盘空间不足
- OOM（Out of Memory）
- merge conflict 涉及 > 3 个文件

**报告格式**：
```
type: unrecoverable_error
slaver_id: <id>
ticket_id: <id>
error_type: <429|auth_fail|disk_full|oom|merge_conflict>
description: <一句话描述>
```

---

> 📄 更多执行流程：[`template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`](SLAVER-HEARTBEAT-CHECKLIST.md) | [`template/docs/SLAVER-AUTO-EXEC-GUIDE.md`](SLAVER-AUTO-EXEC-GUIDE.md)
