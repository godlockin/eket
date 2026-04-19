# confluence/memory — 知识沉淀规范

Slaver 完成 ticket 后，**必须**将经验写入此处。

## 目录说明

| 目录 | 内容 | 写入时机 |
|------|------|---------|
| `patterns/` | 可复用的架构模式、解法模式 | 每次发现通用解法时 |
| `pitfalls/` | 踩坑记录与解法 | 每次遇到非显然问题时 |
| `glossary/` | 领域术语定义 | 引入新术语时 |

## 写入格式

### patterns/ 文件格式

```markdown
# [Pattern 名称]
**场景**：什么情况下使用
**方案**：具体做法
**来源**：TASK-XXX
```

### pitfalls/ 文件格式

```markdown
# [坑的名称]
**症状**：什么现象
**根因**：为什么
**解法**：怎么修
**来源**：TASK-XXX
```

## 现有文件说明

- `BORROWED-WISDOM.md`：从外部项目借鉴的模式（历史研究产出）
- `MULTI-AGENT-COLLAB-LESSONS.md`：多智能体协作经验
- `RULE-RETENTION-LESSONS.md`：规则保持经验
- `patterns/`：可复用架构模式（结构化索引）
- `pitfalls/`：踩坑记录（结构化索引）
- `glossary/`：领域术语表
