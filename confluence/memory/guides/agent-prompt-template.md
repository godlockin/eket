---
title: Agent Prompt 防卡死模板
proof:
  task_id: TASK-415
  exit_code: 0
  timestamp: 2026-05-01T10:00:00Z
  tool_name: manual verification
---

# Agent Prompt 防卡死模板

> Master 派 slaver agent 时，将以下规则段落复制到 agent prompt 中。

## 防卡死规则（必须遵守）
1. 所有 Bash 命令设 `timeout: 120000`（2 分钟），超时立即报告
2. Git push 只用 SSH：`git push git@github.com:godlockin/eket.git <branch>`
3. `npm test` 输出只看 `tail -20`，不要全量输出
4. 最多连续读取 5 个文件，超过必须开始写代码或报告 BLOCKED
5. 遇到 HTTP 429 / rate limit → 立即停止，报告"429 限流"，不要重试
6. 遇到 merge conflict → 不要自行解决超过 3 个文件的冲突，报告给 Master
7. 每完成一个子步骤，输出一行进度（"[1/5] done: xxx"）

## Master 心跳监控 SOP
1. 派 agent 时用 `run_in_background: true`
2. 收到完成通知后验证产物
3. 如果 15 分钟无通知 → `TaskOutput(block=false)` 检查
4. 如果 agent 已死 → `TaskStop` + 分析最后输出 + 重派或手动完成

## 🚨 执行约束（必须遵守）

**时间盒**: 本任务必须在 **{TIME_LIMIT} 分钟**内完成

**反瘫痪规则**:
- ❌ 连续读取 > {MAX_FILE_READS} 个文件而无写操作（触发分析瘫痪）
- ❌ 总耗时 > {TIME_LIMIT} 分钟 → 立即输出当前进度报告
- ❌ 深度遍历目录（> 3 层）

**强制产出格式**:
```markdown
# {任务标题} 报告

## 1. 核心发现（Top 5）
| 问题 | 位置 | 优先级 | 修复命令 |
|------|------|--------|----------|
| ...  | ...  | ...    | ...      |

## 2. 详细分析
...

## 3. 改进建议
...
```

**禁止产出**:
- ❌ "需要更多时间分析"
- ❌ "待进一步研究"
- ❌ 无结论的数据罗列

**参数说明**:
- `{TIME_LIMIT}`: Master 派遣时必须填入，计算规则：估算工时 × 1.5（如 2h 任务 → 180min）
- `{MAX_FILE_READS}`: Master 派遣时必须填入，默认值 5

---

## 常见卡死场景及应对
| 场景 | 症状 | 应对 |
|------|------|------|
| API 429 限流 | 连续报错后静默 | 立即停止报告，不重试 |
| 上下文溢出 | agent 突然无输出 | Master 检查 TaskOutput |
| npm test 超时 | 命令挂起 | 必须设 timeout: 120000 |
| git push 挂起 | 等待认证输入 | 只用 SSH，不用 HTTPS |
| Worktree 异常 | commit 丢失 | 参考 worktree-agent-guide.md |
| **SessionStart context 爆炸** | 见下节 | 见下节 |

---

## ⚠️ SessionStart Context 爆炸（高频根因）

### 问题

每个 Claude Code session 启动时，hook 自动注入大量内容到 system context：

| 来源 | 大小 |
|------|------|
| `~/.claude/CLAUDE.md` | ~15k chars |
| `SKILL.md`（SessionStart hook 注入） | ~13k chars |
| `project CLAUDE.md` | ~5k chars |
| `memory-index.md` 等 hook 读取内容 | 变量 |
| **起手 context 合计** | **~35-50k chars（≈ 10-15k tokens）** |

Master 再派 Slaver 时，**子 agent 继承父 context**（含所有已读文件、对话历史），起手就可能已消耗 50k+ tokens。Master 在长会话后派出的 Slaver 实际可用 context 可能只剩 50-100k tokens，稍复杂的任务就溢出静默退出。

### 症状识别

- Slaver agent 启动后没有任何输出就结束
- `TaskOutput` 返回内容极短或为空
- Master 反复派同一 Slaver 都失败
- Slaver 完成了部分工作后突然停止（无 commit、无报告）

### 应对措施

**Master 侧（派 agent 前）**：

```
# 1. 评估当前 context 大小
# 如果对话已进行 30+ 轮或读取了 10+ 个文件，先 compact
/compact

# 2. Slaver prompt 中显式声明 token 预算
"""
⚠️ Token 预算：你的可用 context 约 100k tokens，务必节约：
- Bash 输出截取 tail -50
- 最多读 5 个文件
- 进度报告每行不超过 80 字符
- 发现 context 不足时立即停止并报告已完成的步骤
"""

# 3. 复杂任务拆分为多个小 Slaver，而非一个大 Slaver
```

**Slaver 侧（agent prompt 必加规则）**：

```
8. context 自查：每完成 3 个子步骤，用 Bash echo "=== context check ===" 输出一个标记。
   如果发现自己开始重复之前已做的操作，立即停止并报告。
9. 严禁读取大文件全量内容：> 300 行的文件必须用 offset/limit 分段读取。
10. 严禁在 prompt 里粘贴超过 50 行的代码片段给 Master。
```

**Master 事后处理**：

```
1. TaskOutput(task_id, block=false) → 找到最后一条有效输出
2. 确认做到哪一步（已 commit 了什么）
3. 重派 Slaver，prompt 中明确："从第 X 步继续，前 X-1 步已完成"
4. 如果多次失败 → 降级为 Master 自己分步执行（每步单独 Bash）
```

### 预防：Master 长会话管理

```
每完成一个 EPIC 阶段（约 5-10 个 ticket）→ 强制 /compact
每次 /compact 前 → 把关键决策写入对应 ticket 的注释区
不要在一个 session 里处理超过 15 个 ticket
```
