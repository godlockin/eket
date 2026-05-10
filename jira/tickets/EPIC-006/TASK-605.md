---
agent_type: backend
estimate_hours: 006
status: done
assigned_to: slaver-backend-005
claimed_at: 2026-05-10T12:11:00Z
analysis_submitted_at: 2026-05-10T12:15:00Z
analysis_approved_at: 2026-05-10T22:00:00+08:00
implementation_completed_at: 2026-05-10T22:25:00+08:00
pr_merged_at: 2026-05-10T22:30:00+08:00
completed_at: 2026-05-10T22:30:00+08:00
branch: feature/TASK-605-tool-output-filter
merged_to: testing
---

# TASK-605: Tool Output Filtering（结果分页）

**EPIC**: EPIC-006 | **Milestone**: M1-Optimization | **优先级**: P1 | **工时**: 4h | **状态**: ready | **依赖**: TASK-603

## 需求

对 Grep/Glob/ls 等 tool 的大量输出进行智能过滤：优先级排序 + 分页（最多 50 条）+ 提示剩余数量。

## 验收标准

- **AC-1**: Given Grep 返回 500 条结果, When `filterToolOutput('grep', output)` 调用, Then 返回：前 50 条（优先级排序后）+ "\n\n[... 450 more results, use --limit to see more]"
- **AC-2**: Given Glob 返回 200 个文件路径, When `filterToolOutput('glob', output)` 调用, Then 返回：按修改时间排序的前 50 个 + 剩余提示
- **AC-3**: Given ls 输出 300 行, When `filterToolOutput('ls', output)` 调用, Then 返回：前 50 行 + 剩余提示
- **AC-4**: Given Grep 结果包含精确匹配和模糊匹配, When 优先级排序, Then 精确匹配排最前，模糊匹配在后
- **AC-5**: Given 通用 tool output > 5000 chars, When 未识别的 tool, Then 截断到 5000 chars + "... truncated"

## 技术方案

### 新增文件
- `node/src/utils/tool-output-filter.ts`

### 集成点
- `node/src/core/claude-runner.ts`（在返回 result 前过滤 stdout）

## 测试策略

- **unit**: `tests/utils/tool-output-filter.test.ts`
- **integration**: 实际 tool 调用测试

## observability
- logs: ["tool_output.filtered"]
- metrics: ["tool_output.savings_ratio"]

## rollback_plan
Revert PR。可选功能。

---

**类型**: feature  
**技能要求**: Node.js / TypeScript  
**依赖**: TASK-603  
**assigned_experts**: backend-engineer
