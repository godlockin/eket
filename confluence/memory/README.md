# confluence/memory — EKET 知识沉淀中心

## 目录结构

| 目录 | 说明 | 写入时机 |
|------|------|---------|
| `patterns/` | 可复用的架构模式、解法模式 | 发现通用解法时 |
| `pitfalls/` | 踩坑记录与解法 | 遇到非显然问题时 |
| `glossary/` | 领域术语定义 | 引入新术语时 |
| `research/` | 研究性长文档（借鉴分析、深度调研） | 完成专项研究时 |
| `lessons/` | 实战经验教训（简短提炼） | 每轮复盘后 |
| `retrospectives/` | Sprint/PR 复盘记录 | 每个 Sprint 结束 |

## Slaver 使用指引

完成 ticket 后，按以下优先级写入：
1. 遇到坑 → `pitfalls/`
2. 发现通用解法 → `patterns/`
3. Sprint 复盘 → `retrospectives/`
4. 引入新术语 → `glossary/terms.md`

## 文件命名规范

- `patterns/`：`{主题}.md`，如 `three-level-degradation.md`
- `pitfalls/`：`{症状描述}.md`，如 `async-test-leak.md`
- `retrospectives/`：`{YYYYMMDD}-{TASK-ID}.md` 或 `sprint-{N}-retro.md`
- `lessons/`：`{主题}.md`（lowercase-kebab）
- `research/`：`{主题}.md`（lowercase-kebab）
