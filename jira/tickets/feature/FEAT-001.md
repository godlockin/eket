# FEAT-001: 图谱构建与社区检测

**创建时间**: 2026-04-09
**创建者**: Master Agent
**重要性**: high
**优先级**: P0
**状态**: ready
**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:
**标签**: `feature`, `graph-analysis`, `leiden`, `community-detection`
**Epic**: EPIC-001
**分配给**: null

---

## 0. 任务元数据

### 0.1 重要性说明
high: 核心图谱分析能力，是 v2 升级的基石

### 0.2 优先级说明
P0: 紧急核心功能，Phase 1 的第一要务

### 0.3 依赖关系
```yaml
blocks:
  - FEAT-002  # God Nodes 依赖社区检测结果
  - FEAT-003  # 惊喜连接依赖社区检测结果
blocked_by: []
related: []
external: []
```

### 0.4 背景信息
现有知识库包含 756 本书、2430 个概念页面，但缺乏全局视角。
需要构建图结构并检测社区，以发现隐藏的知识集群。

### 0.5 技能要求
python, networkx, graspologic, graph-theory

### 0.6 预估工时
1.5h

---

## 1. 状态流转记录

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| 2026-04-09 | backlog → ready | Master | 初始创建，准备被领取 |
| 2026-04-09T14:00 | ready → in_progress | Slaver(aa0b0752) | 子 Agent 领取任务 |

---

## 2. 需求概述

### 2.1 功能描述

> 作为知识管理者，我需要自动检测知识库中的社区/集群，以便理解知识的宏观结构。

### 2.2 验收标准

- [ ] 创建 `wiki_cluster.py` 脚本
- [ ] 从 `obsidian/` 目录扫描所有 `.md` 文件构建图
- [ ] 节点：页面（书籍/概念/人物）
- [ ] 边：`[[wikilinks]]` 引用关系
- [ ] 使用 Leiden 算法进行社区检测
- [ ] 将社区 ID 写入节点属性
- [ ] 输出图结构到 `graph.json`
- [ ] 运行时间 < 5 分钟（756 本书）

---

## 3. 技术设计

### 3.1 影响范围
- **涉及模块**: `02_doc/agent/wiki_cluster.py` (新增)
- **依赖关系**: graspologic, networkx
- **向后兼容**: 不影响现有功能

### 3.2 实现方案

```python
# 核心流程
1. 扫描 obsidian/**/*.md
2. 提取 [[wikilinks]] 作为边
3. 构建 networkx.Graph()
4. 运行 graspologic.cluster.leiden()
5. 导出 graph.json (node-link data)
```

### 3.3 图构建逻辑

```python
def build_graph_from_wiki(obsidian_dir):
    G = nx.Graph()

    # 节点：每个 md 文件
    for md_file in obsidian_dir.glob('**/*.md'):
        G.add_node(md_file.stem, type=md_file.parent.name, path=str(md_file))

    # 边：[[wikilink]] 引用
    import re
    for md_file in obsidian_dir.glob('**/*.md'):
        content = md_file.read_text()
        links = re.findall(r'\[\[([^\]]+)\]\]', content)
        for link in links:
            if link in [n.stem for n in obsidian_dir.glob('**/*.md')]:
                G.add_edge(md_file.stem, link, relation='wikilink')

    return G
```

### 3.4 社区检测

```python
from graspologic import cluster

def detect_communities(G):
    communities = cluster.leiden(G, weight='weight')
    for node, comm_id in communities:
        G.nodes[node]['community'] = comm_id
    return G, communities
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
- [ ] 已更新 ticket 状态：`ready` → `in_progress`
- [ ] 已在本文件中记录领取信息

#### 步骤 2: 修改/补充设计文档
- [ ] 已阅读 Master 填写的技术设计
- [ ] 已补充详细设计（如需要）
- [ ] 已更新状态：`in_progress` → `design_review`
- [ ] 设计文档位置：_待填写_

#### 步骤 3: 编写测试
- [ ] 已编写单元测试（图构建测试、社区检测测试）
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

**状态流转**: `ready` → `in_progress` → `design_review` → `testing` → `review` → `done`
