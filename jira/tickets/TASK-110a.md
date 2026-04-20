# TASK-110a: task:create 引导建卡（AI 推断 + Socratic 补全）

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P1
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: 无

## 背景

现有建卡方式：人工直接写 Markdown 文件。
目标：`task:create` 命令接受一段原始描述，AI 推断补全结构化字段，
针对不足部分（详细描述 + 验收标准）逐条 Socratic 提问，确认后写入 ticket 文件。

## 验收标准

1. `node dist/index.js task:create "<原始描述>"` 可用
2. AI 自动推断：title / type / priority / 背景（从描述提取）
3. 检查缺口：详细描述 < 50 字 或 验收标准为空 → 触发提问
4. 逐条提问（非一次性），用户回答后更新草稿
5. 确认后写入 `jira/tickets/TASK-NNN.md`（NNN 自动递增）
6. ticket 包含「澄清记录」章节，记录问答过程
7. `npm test` 全绿，新增 ≥ 3 单测

## Ticket 模板（生成格式）

```markdown
# TASK-NNN: <title>

## 元数据
- **状态**: todo
- **类型**: <feature|bug|chore|refactor>
- **优先级**: <P0|P1|P2>
- **负责人**: 待领取
- **创建时间**: <date>
- **依赖**: <无|TASK-XXX>

## 背景
<从原始描述推断>

## 详细描述
<引导补全>

## 验收标准
<引导补全>

## 澄清记录
- Q: <问题>
  A: <用户回答>
```

## 实现步骤

1. 新建 `node/src/commands/task-create.ts`
2. 解析原始描述，调用 LLM（或规则推断）填充结构化字段
3. 检查详细描述和验收标准完整性
4. 逐条交互式提问（readline 或 prompt）
5. 写入 ticket 文件（自动计算下一个 TASK 编号）
6. 在 `node/src/index.ts` 注册命令
7. 写单测（mock readline + 文件写入）
