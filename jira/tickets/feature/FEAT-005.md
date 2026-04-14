# FEAT-005: Git Hook 集成

**创建时间**: 2026-04-09
**创建者**: Master Agent
**重要性**: low
**优先级**: P2
**状态**: backlog
**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:
**标签**: `feature`, `git-hook`, `automation`, `ci-cd`
**Epic**: EPIC-001
**分配给**: null

---

## 0. 任务元数据

### 0.1 重要性说明
low: 自动化优化，提升开发体验

### 0.2 优先级说明
P2: 正常优先级，可在核心功能完成后进行

### 0.3 依赖关系
```yaml
blocks: []
blocked_by:
  - FEAT-001
  - FEAT-004
related: []
external: []
```

### 0.4 背景信息
Git Hook 可在每次 commit 后自动更新图谱，保持知识库最新。

### 0.5 技能要求
python, git-hooks, subprocess

### 0.6 预估工时
0.5h

---

## 2. 需求概述

### 2.1 功能描述

> 作为开发者，我希望 commit 后自动更新知识图谱，保持图谱与文档同步。

### 2.2 验收标准

- [ ] 创建 `wiki_hook.py` 脚本
- [ ] 实现 post-commit hook 逻辑
- [ ] 自动运行 `wiki_enrich.py --incremental`
- [ ] 自动运行 `wiki_cluster.py`
- [ ] 安装 hook：`ln -s wiki_hook.py .git/hooks/post-commit`

---

## 3. 技术设计

```python
#!/usr/bin/env python3
"""Post-commit hook: 每次 commit 后自动更新图谱"""
import subprocess
import sys

def main():
    print("Updating knowledge graph after commit...")
    subprocess.run([sys.executable, 'wiki_enrich.py', '--incremental'], check=True)
    subprocess.run([sys.executable, 'wiki_cluster.py'], check=True)
    print("Graph updated!")

if __name__ == '__main__':
    main()
```

---

**状态流转**: `backlog` → `ready` → `in_progress` → `review` → `done`
