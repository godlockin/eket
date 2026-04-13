# Feature Ticket: FEAT-002 - God Nodes 识别

**创建时间**: 2026-04-09
**创建者**: Master Agent
**重要性**: high
**优先级**: P0
**状态**: backlog
**标签**: `feature`, `graph-analysis`, `god-nodes`, `centrality`
**Epic**: EPIC-001
**分配给**: null

---

## 0. 任务元数据

### 0.1 重要性说明
high: 核心图谱分析能力，识别知识枢纽

### 0.2 优先级说明
P0: 紧急核心功能，Phase 1 的核心交付物

### 0.3 依赖关系
```yaml
blocks: []
blocked_by:
  - FEAT-001  # 依赖社区检测结果
related:
  - FEAT-003  # 惊喜连接可并行
external: []
```

### 0.4 背景信息
God Nodes 是图中连接度最高的节点，代表知识领域的核心概念/书籍。
识别这些节点有助于：
- 快速定位知识骨架
- 指导学习路径
- 发现知识盲区

### 0.5 技能要求
python, networkx, graph-theory, centrality-algorithms

### 0.6 预估工时
0.5h

---

## 1. 状态流转记录

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| 2026-04-09 | backlog | Master | 初始创建，依赖 FEAT-001 |

---

## 2. 需求概述

### 2.1 功能描述

> 作为知识管理者，我需要识别知识库中连接度最高的"God Nodes"，以便快速定位核心概念。

### 2.2 验收标准

- [ ] 在 `wiki_cluster.py` 中添加 `find_god_nodes()` 函数
- [ ] 使用 degree centrality 算法计算连接度
- [ ] 输出 Top 10 God Nodes 列表
- [ ] 包含节点名称、连接度分数、所属社区
- [ ] 集成到 `GRAPH_REPORT.md` 生成流程

---

## 3. 技术设计

### 3.1 影响范围
- **涉及模块**: `02_doc/agent/wiki_cluster.py` (FEAT-001 的扩展)
- **依赖关系**: networkx (degree_centrality)
- **向后兼容**: 不影响现有功能

### 3.2 实现方案

```python
def find_god_nodes(G, top_k=10):
    """找出最高连接度的节点"""
    centrality = nx.degree_centrality(G)
    sorted_nodes = sorted(centrality.items(), key=lambda x: x[1], reverse=True)
    return sorted_nodes[:top_k]
```

### 3.3 报告格式

```markdown
## God Nodes (核心枢纽)

这些节点连接度最高，是知识的"骨架"：

| 排名 | 节点 | 连接度 | 社区 |
|------|------|--------|------|
| 1 | [[概念名]] | 0.852 | 3 |
| 2 | [[概念名]] | 0.741 | 1 |
```

---

## 4. 执行记录（Slaver 领取后填写）

### 4.1 领取信息
- **领取者**: _待填写_
- **领取时间**: _待填写_
- **预计工时**: _待填写_
- **状态已更新**: [ ] 是

### 4.2 必需执行流程

#### 步骤 1: 更新状态为 in_progress
- [ ] 已更新 ticket 状态：`backlog` → `ready` → `in_progress`
- [ ] 已在本文件中记录领取信息

#### 步骤 2: 修改/补充设计文档
- [ ] 已阅读 Master 填写的技术设计
- [ ] 已补充详细设计（如需要）
- [ ] 已更新状态：`in_progress` → `design_review`
- [ ] 设计文档位置：_待填写_

#### 步骤 3: 编写测试
- [ ] 已编写单元测试
- [ ] 已更新状态：`design_review` → `testing`

#### 步骤 4: 提交 PR
- [ ] 代码已提交到分支：`feat/wiki-cluster`
- [ ] PR 已创建
- [ ] 已更新状态：`testing` → `review`
- [ ] 已通知 Master Review

### 4.3 执行状态
| 阶段 | 状态 | 完成时间 | 备注 |
|------|------|----------|------|
| 领取 | ✓/✗ | _待填写_ | - |
| 设计文档 | ✓/✗ | _待填写_ | - |
| 测试编写 | ✓/✗ | _待填写_ | - |
| PR 提交 | ✓/✗ | _待填写_ | - |

### 4.4 实现细节
_待填写_

---

## 5. Review 记录（Master 填写）

### 5.1 Review 检查清单
- [ ] 代码符合项目规范
- [ ] 测试覆盖充分
- [ ] 文档已更新
- [ ] 无安全漏洞
- [ ] 性能无显著退化
- [ ] **状态已更新**: `review` → `done`

### 5.2 Review 结果
- [ ] **批准合并**
- [ ] **需要修改**
- [ ] **拒绝**

**Reviewer**: Master Agent
**Review 时间**: _待填写_

---

**状态流转**: `backlog` → `ready` → `in_progress` → `design_review` → `testing` → `review` → `done`
