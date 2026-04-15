# TASK-038: Layer 1 — Token 压缩率验证

**Ticket ID**: TASK-038
**Epic**: RULE-RETENTION
**标题**: 验证 CLAUDE.md 拆分后各角色 session 加载 token 数压缩 ≥ 40%
**类型**: task
**优先级**: P2
**重要性**: medium

**状态**: ready
**创建时间**: 2026-04-15
**创建者**: Master
**负责人**: 待领取

**依赖关系**:
- blocks: [TASK-041]
- blocked_by: [TASK-037]

**标签**: `docs`, `validation`, `layer1`

---

## 1. 需求概述

### 1.1 功能描述

作为 EKET 框架维护者，我需要量化验证 CLAUDE.md 拆分前后的 token 体积差异，确保压缩率达到目标（≥ 40%），以便评估 Layer 1 的实际效果。

### 1.2 验收标准

- [ ] 新建 `scripts/count-tokens.sh`，输出每个角色加载的文件 token 总数
- [ ] 对比报告：旧 CLAUDE.md token 数 vs 新 Master/Slaver 加载的文件 token 数
- [ ] Master 角色：`CLAUDE.md + MASTER-RULES.md` token 数 ≤ 原 CLAUDE.md × 0.85（Master 多加载一个文件，但 CLAUDE.md 本身缩小了）
- [ ] Slaver 角色：`CLAUDE.md + SLAVER-RULES.md` token 数 ≤ 原 CLAUDE.md × 0.85
- [ ] 验收命令：
  ```bash
  bash scripts/count-tokens.sh --role master  # 输出 token 数值
  bash scripts/count-tokens.sh --role slaver  # 输出 token 数值
  bash scripts/count-tokens.sh --compare      # 输出对比报告
  ```

---

## 2. 技术设计

### 2.1 影响文件

- `scripts/count-tokens.sh` — 新建（用字符数估算 token，或用 tiktoken 精确计算）

### 2.2 实现方案

简化版（字符数估算，1 token ≈ 4 chars）：

```bash
#!/usr/bin/env bash
# count-tokens.sh — 估算 EKET agent session 加载的 token 数

count_chars() {
  wc -c "$@" | tail -1 | awk '{print $1}'
}

case "$1" in
  --role)
    case "$2" in
      master)
        chars=$(count_chars CLAUDE.md template/docs/MASTER-RULES.md)
        echo "Master session: ~$((chars/4)) tokens ($chars chars)"
        ;;
      slaver)
        chars=$(count_chars CLAUDE.md template/docs/SLAVER-RULES.md)
        echo "Slaver session: ~$((chars/4)) tokens ($chars chars)"
        ;;
    esac
    ;;
  --compare)
    # 需要有 CLAUDE.md.bak 保存拆分前的原始文件
    if [[ -f CLAUDE.md.bak ]]; then
      old=$(count_chars CLAUDE.md.bak)
      new_m=$(count_chars CLAUDE.md template/docs/MASTER-RULES.md)
      new_s=$(count_chars CLAUDE.md template/docs/SLAVER-RULES.md)
      echo "Before: ~$((old/4)) tokens"
      echo "Master after: ~$((new_m/4)) tokens ($(( (old-new_m)*100/old ))% reduction)"
      echo "Slaver after: ~$((new_s/4)) tokens ($(( (old-new_s)*100/old ))% reduction)"
    else
      echo "No CLAUDE.md.bak found. Run before split to save baseline."
    fi
    ;;
esac
```

---

## 4. 执行记录

### 4.1 领取信息
- **领取者**: 待填写
- **领取时间**: 待填写
- **预计工时**: 1h

### 4.2 状态流转

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| 2026-04-15 | backlog → ready | Master | 初始创建，blocked_by TASK-037 |
