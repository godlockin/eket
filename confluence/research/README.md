---
title: Research Knowledge Base
created: 2026-05-27
category: research
---

# Research Knowledge Base

> 技术研究、工具评测、方法论沉淀目录

## 目录结构

```
research/
├── llm-patterns/       # LLM 使用模式研究
│   └── llm-laziness.md # 输出截断根因与补救
├── tools/              # 工具评测与对比
└── methodologies/      # 方法论研究
```

## 使用指南

| 子目录 | 用途 | 示例 |
|--------|------|------|
| `llm-patterns/` | LLM 行为分析、提示工程模式 | 输出截断、幻觉防御、上下文管理 |
| `tools/` | 工具/框架评测对比 | MCP servers、Agent 框架、编辑器插件 |
| `methodologies/` | 研究方法论、流程设计 | 跨项目研究、A/B 测试设计、基准测试 |

## 文件规范

所有研究文件需包含 frontmatter:

```yaml
---
title: <研究标题>
created: <YYYY-MM-DD>
category: research/<子目录>
tags: [tag1, tag2]
status: draft | review | published
---
```

## 关联文档

- [lessons/research-methodology.md](../memory/lessons/research-methodology.md) — 跨项目研究方法论
- [borrowed-wisdom.md](borrowed-wisdom.md) — 外部项目借鉴
