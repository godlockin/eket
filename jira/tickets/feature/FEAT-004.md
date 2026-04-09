# Feature Ticket: FEAT-004 - 增量缓存机制

**创建时间**: 2026-04-09
**创建者**: Master Agent
**重要性**: medium
**优先级**: P1
**状态**: backlog
**标签**: `feature`, `cache`, `incremental-processing`, `llm-optimization`
**Epic**: EPIC-001
**分配给**: null

---

## 0. 任务元数据

### 0.1 重要性说明
medium: 优化 LLM 调用成本，提升效率

### 0.2 优先级说明
P1: 高优先级优化，可在 Phase 1 完成后立即开始

### 0.3 依赖关系
```yaml
blocks: []
blocked_by: []
related:
  - FEAT-001
  - FEAT-002
  - FEAT-003
external: []
```

### 0.4 背景信息
深度提炼书籍需要调用 Vertex AI，成本高。
增量缓存可避免重复调用，只处理变更文件。

### 0.5 技能要求
python, hashlib, json, file-system

### 0.6 预估工时
1h

---

## 2. 需求概述

### 2.1 功能描述

> 作为系统，我需要缓存 LLM 提取结果，避免重复调用，只处理变更文件。

### 2.2 验收标准

- [ ] 创建 `wiki_cache.py` 模块
- [ ] 实现 `compute_hash(filepath)` - SHA256 文件哈希
- [ ] 实现 `check_cache(filepath)` - 检查缓存命中
- [ ] 实现 `save_cache(filepath, extraction_data)` - 保存缓存
- [ ] 缓存目录：`wiki_cache/`
- [ ] 集成到 `wiki_enrich.py` 的 `enrich_book_page()`

---

## 3. 技术设计

### 3.1 缓存结构

```json
{
  "source_hash": "abc123...",
  "extraction": { ... },
  "updated_at": "2026-04-09T10:30:00"
}
```

### 3.2 集成逻辑

```python
def enrich_book_page(model, filepath):
    # 检查缓存
    hit, cached = check_cache(filepath)
    if hit:
        print(f"  Cache hit: {filepath.stem}")
        return cached

    # 正常 LLM 提取
    result = extract_insights(...)

    # 保存到缓存
    save_cache(filepath, result)
    return result
```

---

**状态流转**: `backlog` → `ready` → `in_progress` → `review` → `done`
