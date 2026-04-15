# 个人知识库 v2 升级 - 需求分析

**作者**: Master Agent
**创建时间**: 2026-04-09
**状态**: approved
**版本**: 1.0

---

## 1. 项目概述

### 1.1 背景
个人知识库基于 Karpathy LLM Wiki 模式构建，已完成基础建设：
- 756 本书骨架页面
- 2430 个概念页面
- sqlite-vec 向量索引
- 语义查询与知识回流机制

当前局限：缺乏全局视角，无法发现隐藏关联。

### 1.2 目标
借鉴 Graphify 架构，升级为"动态知识图谱系统"：
1. **发现隐藏关联** - 社区检测揭示书籍间的隐藏关联
2. **识别核心枢纽** - God Nodes 指导学习路径
3. **惊喜连接** - 跨领域洞察，激发创新
4. **增量更新** - 节省 LLM 调用成本和时间
5. **Git 集成** - 提交即更新，保持图谱最新

---

## 2. 需求分解

### 2.1 Phase 1: 图谱分析能力 (P0)

| 功能 | 描述 | 预估工时 |
|------|------|----------|
| 社区检测 | Leiden 算法检测知识集群 | 1.5h |
| God Nodes | 识别最高连接度节点 | 0.5h |
| 惊喜连接 | 发现跨社区强边 | 0.5h |

**交付物**:
- `wiki_cluster.py`
- `GRAPH_REPORT.md`
- `graph.json`

### 2.2 Phase 2: 增量缓存 (P1)

| 功能 | 描述 | 预估工时 |
|------|------|----------|
| SHA256 缓存 | 文件哈希检测变更 | 1h |

**交付物**:
- `wiki_cache.py`
- `wiki_cache/` 目录
- 集成到 `wiki_enrich.py`

### 2.3 Phase 3: 自动化 (P2)

| 功能 | 描述 | 预估工时 |
|------|------|----------|
| Git Hook | post-commit 自动更新 | 0.5h |
| HTML 可视化 | vis.js 交互式图谱 | 1.5h |

**交付物**:
- `wiki_hook.py`
- `.git/hooks/post-commit`
- `graph.html`

---

## 3. 技术架构

### 3.1 技术栈
- **Python 3.10+**: 主要编程语言
- **networkx**: 图构建和分析
- **graspologic**: Leiden 社区检测算法
- **sqlite-vec**: 现有向量存储（保持兼容）

### 3.2 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    个人知识库 v2                          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  数据层     │  │  分析层     │  │  展示层     │     │
│  │             │  │             │  │             │     │
│  │  obsidian/  │  │  wiki_      │  │  GRAPH_     │     │
│  │  concepts/  │→ │  cluster.py │→ │  REPORT.md  │     │
│  │  books/     │  │  wiki_      │  │  graph.     │     │
│  │             │  │  cache.py   │  │  html       │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│         │                  │                  │         │
│         ▼                  ▼                  ▼         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              sqlite-vec (向量索引)               │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 3.3 核心算法

#### Leiden 社区检测
```python
from graspologic import cluster
communities = cluster.leiden(G, weight='weight')
```

#### Degree Centrality (God Nodes)
```python
centrality = nx.degree_centrality(G)
god_nodes = sorted(centrality.items(), key=lambda x: x[1], reverse=True)[:10]
```

#### 惊喜连接发现
```python
# 跨社区 + 高权重边
for u, v, data in G.edges(data=True):
    if G.nodes[u]['community'] != G.nodes[v]['community']:
        surprising.append((u, v, data['weight']))
```

---

## 4. 工作流程

### 4.1 初始构建
```bash
# 1. 运行图谱分析
uv run python wiki_cluster.py --dir ../obsidian --output GRAPH_REPORT.md

# 2. 查看报告
cat GRAPH_REPORT.md
```

### 4.2 增量更新（缓存命中）
```bash
# wiki_enrich.py 自动检查缓存
# 未变更文件直接使用缓存
# 变更文件调用 LLM 并更新缓存
```

### 4.3 Git 集成
```bash
# commit 后自动触发
git commit -m "添加新书"
# → post-commit hook 运行
# → wiki_enrich.py --incremental
# → wiki_cluster.py
# → GRAPH_REPORT.md 更新
```

---

## 5. 成功标准

### 5.1 功能指标
- [ ] 可运行 `wiki_cluster.py` 生成图谱分析报告
- [ ] `GRAPH_REPORT.md` 包含 God Nodes 和惊喜连接
- [ ] `graph.json` 可供可视化使用
- [ ] 增量缓存减少 80%+ LLM 调用

### 5.2 性能指标
- [ ] 图谱分析在 5 分钟内完成（756 本书）
- [ ] 缓存命中率 > 90%（稳定文档库）
- [ ] Git Hook 不阻塞正常 commit 流程

---

## 6. 相关 Jira Tickets

| Ticket ID | 标题 | 优先级 | 状态 |
|-----------|------|--------|------|
| EPIC-001 | 个人知识库 v2 升级 | P0 | active |
| FEAT-001 | 图谱构建与社区检测 | P0 | ready |
| FEAT-002 | God Nodes 识别 | P0 | backlog |
| FEAT-003 | 惊喜连接发现 | P0 | backlog |
| FEAT-004 | 增量缓存机制 | P1 | backlog |
| FEAT-005 | Git Hook 集成 | P2 | backlog |
| FEAT-006 | 交互式 HTML 可视化 | P2 | backlog |

---

## 7. 参考文档

- wiki-v2-upgrade-plan.md（外部文档，本机路径）
- personal-wiki-requirements.md（外部文档，本机路径）
- wiki-dev-lessons.md（外部文档，本机路径）

---

**审批记录**:
- 2026-04-09: Master Agent 批准
