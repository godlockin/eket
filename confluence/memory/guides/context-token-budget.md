# Agent 上下文与 Token 预算管理

**创建时间**: 2026-05-01
**适用范围**: Claude Code Agent（Master/Slaver）的上下文窗口管理

---

## 核心问题

Agent 的上下文窗口有限（~200k tokens）。超出后 agent 被强制终止（compaction 或 kill），已产出的工作可能丢失。这是 slaver 静默退出的常见原因之一。

---

## 1. 上下文消耗大户

| 操作 | Token 消耗 | 缓解 |
|------|-----------|------|
| 读取大文件（>500 行） | 高 | 用 `offset`/`limit` 只读需要的部分 |
| 全量 `npm test` 输出 | 极高 | `npm test 2>&1 \| tail -20` |
| `git diff` 大量变更 | 高 | `git diff --stat` 先看概览 |
| 多轮 Grep 搜索 | 累积高 | 缩小 glob/path 范围 |
| 连续读取 5+ 文件 | 高 | 读 5 个就开始写代码或报告 |
| Write 工具大内容（>8k tokens） | 触发 bug | 分 chunk 写入（见下方） |

---

## 2. Write 工具大内容 Bug

**症状**：`Write` 调用含 >~8k tokens 的 `content` 参数时，返回 `InputValidationError: The required parameter 'content' is missing`。model 反复重试空参数 Write，烧尽 token。

**解法**：分 chunk 写入：
1. 第一次 `Write`：header + 前 ~150 行
2. 后续用 `Edit`：找到文件末尾附近的 anchor text，`old_string=anchor`、`new_string=anchor + 下一批内容`
3. 每 chunk < 500 行

**诊断**：`Write({file_path: "/tmp/test.txt", content: "smoke"})` 如果成功，说明工具正常，问题是内容太大。

---

## 3. Slaver Prompt 的上下文节约规则

在 slaver agent prompt 中包含以下规则（参见 `agent-prompt-template.md`）：

1. **Bash 输出限制**：长命令输出用 `| tail -20` 或 `| head -50` 截取
2. **文件读取限制**：连续读取不超过 5 个文件
3. **Grep 范围收窄**：指定 `path` 和 `glob`，避免全仓扫描
4. **进度输出精简**：`[1/5] done: xxx` 一行足够，不要解释性长段
5. **不要重复粘贴文件内容**：引用行号即可

---

## 4. Master 的上下文管理

Master 作为长期运行节点，上下文压力更大：

- **及时 compact**：每完成一个 EPIC 阶段后，上下文已经很长。把关键信息写入文件（lessons/tickets），允许 compaction 清理旧对话
- **外化记忆**：决策写入 ticket 注释，不要只存在对话里
- **Agent 产出验证简洁化**：不要读 agent 的完整 JSONL transcript，只验证最终产物
- **分批处理**：15 个 ticket 不要一次性全在对话里展开，分批管理

---

## 5. Token 预算估算

| 场景 | 大致 Token 消耗 |
|------|----------------|
| 读一个 200 行文件 | ~2k |
| npm test 完整输出 | ~5-20k |
| git diff 100 行变更 | ~1k |
| 一轮 Grep + Read + Edit | ~3-5k |
| 派一个 slaver agent（prompt） | ~2-3k |
| 完整 EPIC 的 Master 对话 | ~150-200k（需 compaction） |

---

## 6. 上下文溢出应急

Agent 接近上下文极限时的症状：
- 回复变短/变敷衍
- 开始"忘记"之前的指令
- 突然无响应（被 kill）

**Master 应对**：
1. `TaskOutput(block=false)` 检查 agent 状态
2. 如已死 → `TaskStop` 清理
3. 读取最后输出，确认做到哪一步
4. 重派新 agent，prompt 中说明"从第 X 步继续"

---

**参见**：
- [agent-prompt-template.md](agent-prompt-template.md) — 防卡死规则含输出限制
- [lessons/multi-agent-collab-lessons.md](lessons/multi-agent-collab-lessons.md) — 分析瘫痪模式
