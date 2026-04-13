# Epic: EPIC-001 - 个人知识库 v2 升级

**创建时间**: 2026-04-09
**创建者**: Master Agent
**优先级**: P0
**状态**: active
**标签**: `epic`, `personal-wiki`, `v2-upgrade`
**产品负责人**: Master Agent

---

## 1. Epic 概述

### 1.1 愿景
借鉴 Graphify 架构，将个人知识库从"静态文档集合"升级为"动态知识图谱系统"，实现：
- 发现隐藏关联（社区检测）
- 识别核心枢纽（God Nodes）
- 惊喜连接发现（跨领域关联）
- 增量更新（节省 LLM 成本）
- Git 集成（提交即更新）

### 1.2 当前状态
已完成基础建设：
- ✅ 756 本书骨架页面
- ✅ 2430 个概念页面
- ✅ sqlite-vec 向量索引
- ✅ 语义查询与知识回流机制

### 1.3 升级范围
| 能力 | 当前状态 | 目标状态 | 优先级 |
|------|----------|----------|--------|
| 社区检测 | ❌ | ✅ Leiden 算法 | P0 |
| God Nodes | ❌ | ✅ 最高连接度节点 | P0 |
| 跨文档关联 | ❌ | ✅ 惊喜连接发现 | P0 |
| 增量缓存 | ❌ | ✅ SHA256+semantic cache | P1 |
| Git Hook | ❌ | ✅ post-commit hook | P2 |
| Watch 模式 | ❌ | ✅ 监听文件变化 | P2 |
| HTML 可视化 | ❌ | ✅ vis.js 交互式 | P2 |

---

## 2. 包含的 Features

| Feature ID | 标题 | 优先级 | 状态 |
|------------|------|--------|------|
| FEAT-001 | 图谱构建与社区检测 | P0 | backlog |
| FEAT-002 | God Nodes 识别 | P0 | backlog |
| FEAT-003 | 惊喜连接发现 | P0 | backlog |
| FEAT-004 | 增量缓存机制 | P1 | backlog |
| FEAT-005 | Git Hook 集成 | P2 | backlog |
| FEAT-006 | 交互式 HTML 可视化 | P2 | backlog |

---

## 3. 成功标准

### 3.1 功能指标
- [ ] 可运行 `wiki_cluster.py` 生成图谱分析报告
- [ ] 输出 `GRAPH_REPORT.md` 包含 God Nodes 和惊喜连接
- [ ] 输出 `graph.json` 可供可视化使用
- [ ] 增量缓存可减少 80%+ LLM 调用（针对未变更文件）

### 3.2 质量指标
- [ ] 图谱分析在 5 分钟内完成（756 本书）
- [ ] 缓存命中率 > 90%（针对稳定文档库）
- [ ] Git Hook 不阻塞正常 commit 流程

---

## 4. 技术约束

### 4.1 技术栈
- Python 3.10+
- graspologic (Leiden 算法)
- networkx (图构建和分析)
- sqlite-vec (现有向量库，保持兼容)

### 4.2 架构原则
- 嵌入用户现有工作流（Obsidian + sqlite-vec）
- 分层渐进：P0 → P1 → P2
- 增量更新：避免重复 LLM 调用

---

## 5. 里程碑

| Phase | 内容 | 预计时间 | 交付物 |
|-------|------|----------|--------|
| Phase 1 | 社区检测 + God Nodes + 惊喜连接 | 2h | GRAPH_REPORT.md, graph.json |
| Phase 2 | 增量缓存 | 1h | wiki_cache/, 集成到 enrich |
| Phase 3 | Git Hook + Watch | 1h | post-commit hook |
| Phase 4 | HTML 可视化 | 2h | graph.html |

---

## 6. 相关文档

- [wiki-v2-upgrade-plan.md](../../../../../00_文档/docs/plans/wiki-v2-upgrade-plan.md)
- [personal-wiki-requirements.md](../../../../../working/sourcecode/research/LLM/dev_notes/requirements/personal-wiki-requirements.md)
- [wiki-dev-lessons.md](../../../../../00_文档/docs/plans/wiki-dev-lessons.md)

---

**状态**: `planning` → `active` → `completed`
