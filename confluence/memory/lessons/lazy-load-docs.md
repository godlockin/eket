---
name: lazy-load-docs
type: lesson
created: 2026-05-27
source: context-optimization-session
tags: [context-management, documentation, performance, agent]
confidence: high
---

# 大文档按需加载机制

> 大文档 (>200 行) 必须有快速索引，避免一次性加载占用上下文

## 问题

Claude Code Agent 上下文有限 (168k tokens)，一次性加载大文档会:
1. 占用宝贵的上下文空间
2. 导致后续操作空间不足
3. 引发 context overflow (400 错误)

## 解决方案

### 1. 文档分层设计

```
L0: 索引层 (MEMORY-INDEX.md)     ~200 行    → 始终加载
L1: 摘要层 (文件顶部 50 行)      ~50 行/文件 → 按需加载
L2: 详情层 (完整文件)            变长       → 仅查询时加载
```

### 2. 索引文件规范

**MEMORY-INDEX.md 格式**:

```markdown
## patterns/ (12 files)
| 文件 | 摘要 |
|------|------|
| dual-track-router.md | 双轨路由器 - Rust/JS 自动切换 |
| four-level-degradation.md | 四级降级策略 |
```

**关键**: 每个文件一行摘要，不超过 30 字

### 3. 文件头部快速摘要

**每个 >200 行的文件必须有**:

```markdown
# 文件标题

> 一句话摘要 (TL;DR)

## Quick Reference
- 关键点 1
- 关键点 2
- 关键点 3

---
(详细内容在下方)
```

### 4. 自动检查脚本

```bash
#!/bin/bash
# scripts/check-lazy-load.sh

THRESHOLD=200

for file in confluence/memory/**/*.md; do
  lines=$(wc -l < "$file")
  if [ "$lines" -gt "$THRESHOLD" ]; then
    # 检查是否有 TL;DR 或 Quick Reference
    if ! grep -q -E "^> |^## Quick|^## TL;DR" "$file"; then
      echo "WARNING: $file ($lines lines) missing quick summary"
    fi
  fi
done
```

## 最佳实践

### Agent 加载文档顺序

1. **首先**: 读 MEMORY-INDEX.md 确定需要哪些文件
2. **其次**: 只读相关文件的 L1 摘要 (前 50 行)
3. **最后**: 仅在需要详情时读完整文件

### Agent Prompt 模板

```markdown
## 文档查阅规则

1. 先读 `confluence/memory/MEMORY-INDEX.md` 找到相关文件
2. 使用 `head -50` 读取文件摘要
3. 只有确认需要详情时才读完整文件
4. 单次会话不要读取超过 3 个完整大文档
```

## 验证清单

- [ ] MEMORY-INDEX.md 存在且更新
- [ ] 所有 >200 行文件有 Quick Reference
- [ ] check-lazy-load.sh 无警告输出
- [ ] Agent 会话 context 使用率 < 70%

## 收益

| 指标 | 无索引 | 有索引 |
|------|--------|--------|
| 初始 context | ~50k tokens | ~10k tokens |
| 查询响应 | 需读全文 | 先索引后定位 |
| Context overflow 风险 | 高 | 低 |

---

**关联**: 
- [context-defense-guide.md](context-defense-guide.md)
- [context-optimization-lessons-2026-05-10.md](context-optimization-lessons-2026-05-10.md)
