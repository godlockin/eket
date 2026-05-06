# confluence/memory — EKET 知识沉淀中心

## 目录结构

| 目录 | 说明 | 写入时机 |
|------|------|---------|
| `patterns/` | 可复用的架构模式、解法模式 | 发现通用解法时 |
| `pitfalls/` | 踩坑记录与解法 | 遇到非显然问题时 |
| `lessons/` | 实战经验教训（简短提炼） | 每轮复盘后 |
| `research/` | 研究性长文档（借鉴分析、深度调研） | 完成专项研究时 |
| `guides/` | SOP 模板与操作指南 | 编写流程规范时 |
| `glossary/` | 领域术语定义 | 引入新术语时 |
| `retrospectives/` | Sprint/PR/EPIC 复盘记录 | 每个里程碑结束 |
| `archive/` | 归档低引用/过期文档 | GC 触发时 |

## Slaver 使用指引

完成 ticket 后，按以下优先级写入：
1. 遇到坑 → `pitfalls/`
2. 发现通用解法 → `patterns/`
3. 单次 ticket/任务经验教训 → `lessons/`
4. Sprint/PR/EPIC 复盘 → `retrospectives/{sprints,prs,epics}/`
5. 编写 SOP/操作指南 → `guides/`
6. 引入新术语 → `glossary/terms.md`

> **注意**：`lessons/` 存放任务经验教训（含 ticket debrief），`research/` 存放研究性长文（外部借鉴分析、深度调研报告）。两者勿混淆。

## 文件命名规范

- `patterns/`：`{主题}.md`（lowercase-kebab），如 `three-level-degradation.md`
- `pitfalls/`：`{症状描述}.md`（lowercase-kebab），如 `async-test-leak.md`
- `lessons/`：`{主题}.md`（lowercase-kebab），如 `slaver-exit-cleanup.md`
- `research/`：`{主题}.md`（lowercase-kebab），如 `redis-architecture.md`
- `guides/`：`{主题}.md`（lowercase-kebab），如 `branch-strategy.md`
- `retrospectives/sprints/`：`sprint-{N}.md`，如 `sprint-001.md`
- `retrospectives/epics/`：`EPIC-{NNN}.md`，如 `EPIC-002.md`
- `retrospectives/prs/2026/`：`PR{N}-TASK-{NNN}.md`，如 `PR75-TASK-050.md`
- `retrospectives/2026/`：`{MM}-{主题}.md`，如 `05-lessons-learned.md`

---

## L0-L4 分层规范（对标 GenericAgent）

EKET 采用五层记忆架构，防止无限膨胀：

| 层级 | 名称 | 内容 | 载体 | 大小上限 |
|------|------|------|------|---------|
| **L0** | 导航索引 | 所有文件的一行摘要指针 | `memory-index.md` | ≤50行 |
| **L1** | 热记忆 | 当前任务上下文、活跃规则 | Agent 工作内存（context window） | ~8K tokens |
| **L2** | 温记忆 | 本目录 `.md` 文件（patterns/pitfalls/lessons/…） | `confluence/memory/` | 每文件 ≤500行 |
| **L3** | 冷记忆 | 全文索引 + FTS5 向量 | SQLite（`.eket/data/sqlite/eket.db`） | 无硬限制 |
| **L4** | 归档 | 超期/低引用文件压缩归档 | `confluence/memory/archive/`（可选） | 按需 |

### 防膨胀机制

- **L0 自动重建**：`node dist/index.js knowledge:index --rebuild`
- **超50行警告**：自动列出最旧 10 个候选 GC 文件
- **GC 流程**：`knowledge:gc --dry-run` → 确认 → `knowledge:gc --execute`（删除 90天+ 未修改文件，自动重建 L0）
- **写入准则**：每个 `.md` 文件只存一个主题，超过 200 行考虑拆分

### 何时触发 GC

1. `knowledge:index --rebuild` 报 `[WARN] memory index exceeds 50 lines`
2. 月度维护时主动检查
3. `confluence/memory/` 总文件数 > 80
