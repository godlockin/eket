# Ticket 编号规则与范围规划

**最后更新**: 2026-05-07
**维护者**: Master

---

## 已用编号范围（避免冲突）

### EPIC 编号
- **已占用**: EPIC-001 ~ EPIC-004
- **下一个可用**: EPIC-005（刚分配）
- **预留**: EPIC-006 ~ EPIC-050（常规功能）
- **特殊保留**: EPIC-900+ （基础设施/框架升级）

### TASK 编号
- **已占用**: TASK-001 ~ TASK-415（主序列）
- **下一个可用**: TASK-416
- **EPIC-003 子任务**: TASK-229 ~ TASK-236b（已完成）
- **跳号区间**: TASK-283 ~ TASK-400（可能在 archive 中）

### FEAT 编号
- **已占用**: 未大规模使用
- **建议起点**: FEAT-001

### FIX 编号
- **已占用**: 未大规模使用
- **建议起点**: FIX-001

---

## 编号分配策略

### 原则
1. **EPIC**: 按创建顺序递增，不跳号
2. **TASK**: 主序列递增，EPIC 内子任务可带后缀（如 `TASK-231b`）
3. **FEAT/FIX**: 独立序列，与 TASK 互不冲突

### 检查命令
```bash
# 查看所有已用 EPIC 编号
find jira -type d -name 'EPIC-*' -o -type f -name 'EPIC-*.md' | \
  grep -oE 'EPIC-[0-9]+' | sort -u | sort -V

# 查看最新 TASK 编号
find jira/tickets -name 'TASK-*.md' | \
  sed 's/.*TASK-//' | sed 's/\.md$//' | \
  grep -E '^[0-9]+$' | sort -n | tail -5

# 全局搜索某编号是否冲突
grep -r "EPIC-005" jira/ confluence/
```

---

## 历史问题修复

**2026-05-07**: 
- 发现 EPIC-002 冲突（`jira/tickets/EPIC-002/` 已存在）
- 重命名新 EPIC 为 EPIC-005
- 教训：创建前必须全局检查 `find jira -name 'EPIC-*'`

---

## Master 创建 EPIC 前 Checklist

- [ ] 运行 `find jira -type d -name 'EPIC-*' | grep -oE 'EPIC-[0-9]+' | sort -V | tail -1`
- [ ] 下一个编号 = 最大值 + 1
- [ ] 创建后更新本文件
