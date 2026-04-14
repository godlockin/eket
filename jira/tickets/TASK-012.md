# TASK-012: 文档归档与维护

**负责人**: Slaver E (Documentation Specialist)
**优先级**: P1
**预估**: 3-4 小时
**目标**: 文档健康评分 65/100 → 85/100
**状态**: done
**completed_at**: 2026-04-14T00:00:00Z
**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 任务
1. 归档 13 个过时文档到 docs/archive/v2.x/
2. 更新 18 个需刷新的文档
3. .gitignore 完善（运行时数据分离）
4. 文档质量验证（断链检查，更新索引）

## .gitignore 新增
```gitignore
node/.eket/data/
node/.eket/logs/
node/.eket/inboxes/
node/.eket/*/queue/
node/.eket/non-existent-queue/
**/test-*.db
**/test-*.json
```

## 产出
- 13 个文档归档
- 18 个文档更新
- .gitignore 完善
- `docs/audit/TASK-012-documentation-health-improvement.md`

## 验收标准
- 文档健康评分 ≥ 85/100
- 无运行时数据泄漏风险
- docs/INDEX.md 更新
