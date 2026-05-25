# EPIC-012: 借鉴 Karpathy Guidelines 优化 EKET 行为约束

## 元信息

| 字段 | 值 |
|------|-----|
| 状态 | `done` |
| 优先级 | P1 |
| 预估 | 8h |
| Owner | Master |

## 背景

Andrej Karpathy 观察到 LLM 编码常见陷阱：
- 默默假设而不确认
- 过度工程化
- 改动范围超出必要
- 缺乏可验证目标

[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) 将这些观察转化为 4 条行为准则，值得 EKET 借鉴。

## 目标

将 Karpathy Guidelines 的精华融入 EKET 框架：
1. 增强 gate review 检查
2. 为专家 persona 增加行为戒律
3. 建立反模式库
4. 支持 Cursor IDE

## 任务拆分

| Ticket | 标题 | 优先级 | 估时 |
|--------|------|--------|------|
| TASK-E12-001 | Gate Review 增加 Surgical Changes 检查 | P0 | 2h |
| TASK-E12-002 | 专家 Persona 增加 Mantras 字段 | P1 | 1.5h |
| TASK-E12-003 | 创建反模式库 anti-patterns.md | P1 | 1.5h |
| TASK-E12-004 | 添加 Cursor IDE 支持 | P2 | 1.5h |
| TASK-E12-005 | 创建 META-GUIDELINES.md 元规则 | P2 | 1.5h |

## 验收标准

- [ ] gate:review 检查 diff 范围并警告过大改动
- [ ] 专家配置支持 mantras 字段并在输出中引用
- [ ] anti-patterns.md 包含至少 8 个常见错误模式
- [ ] .cursor/rules 目录可被 Cursor 识别
- [ ] META-GUIDELINES.md 被所有 skill 引用

## 参考

- [Karpathy Guidelines SKILL.md](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/skills/karpathy-guidelines/SKILL.md)
- [EXAMPLES.md](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/EXAMPLES.md)
