# EPIC-006: 全项目优化与清理

**创建时间**: 2026-05-11  
**优先级**: P0  
**状态**: `in_progress`  
**负责人**: Master  
**预计完成**: 2026-05-18（1 周）

---

## 背景

Master 综合 Review 发现 12 项关键改进点，按 P0-P2 优先级拆解执行。

**Review 发现**:
- 2,702 MD | 7,656 TS | 178 Shell 文件
- 1,133 TODO/FIXME 技术债
- 文件组织混乱（37 个文件散落）
- 防御系统缺失（导致 Master 失误）

---

## 目标

### P0（立即修复，已完成）
1. ✅ 创建顶层 README.md（Cancelled - 已存在）
2. ✅ 清理远程 feature 分支
3. ✅ 合并 template 目录（Cancelled - 已删）
4. ✅ Git Branch Check Hook（TASK-623）
5. ✅ Pre-Task Check Script（TASK-626）
6. ✅ Agent Dispatch Template（TASK-627）

### P1（本周完成）
7. 补充 node/src API 文档（TASK-614）
8. 实现 Slaver heartbeat daemon（TASK-615）
9. 添加 health_check.sh（TASK-616）
10. 创建 workspace root package.json（TASK-617）✅
11. CI 文件归属检查（TASK-624）
12. PR review 自动化（TASK-628）
13. 决策审计日志（TASK-629）
14. HTML 自动渲染（TASK-630）✅

### P2（下 Sprint）
15. 清理 TODO/FIXME（TASK-618）
16. shellcheck 修复（TASK-619）
17. 消息队列持久化（TASK-620）
18. 升级脚本（TASK-621）
19. 错误码文档（TASK-622）

---

## 子任务状态

| Ticket | 标题 | 优先级 | 状态 | 实际耗时 |
|--------|------|--------|------|---------|
| TASK-611 | README.md | P0 | ✅ Cancelled | 0h |
| TASK-612 | 清理分支 | P0 | ✅ Done | 0.25h |
| TASK-613 | 合并 template | P0 | ✅ Cancelled | 0h |
| TASK-623 | Branch hook | P0 | ✅ Done | 0.25h |
| TASK-626 | Pre-task check | P0 | ✅ Done | 1h |
| TASK-627 | Agent template | P0 | ✅ Done | 0.17h |
| TASK-614 | API 文档 | P1 | 📋 Ready | - |
| TASK-615 | Heartbeat | P1 | 📋 Ready | - |
| TASK-616 | Health check | P1 | 📋 Ready | - |
| TASK-617 | Workspace pkg | P1 | ✅ Done | 0.25h |
| TASK-618 | TODO 清理 | P2 | 📋 Ready | - |
| TASK-619 | Shellcheck | P2 | 📋 Ready | - |
| TASK-620 | 队列持久化 | P2 | 📋 Ready | - |
| TASK-621 | 升级脚本 | P2 | 📋 Ready | - |
| TASK-622 | 错误码文档 | P2 | 📋 Ready | - |
| TASK-624 | CI check | P1 | 📋 Ready | - |
| TASK-628 | PR auto | P1 | 📋 Ready | - |
| TASK-629 | 审计日志 | P1 | 📋 Ready | - |
| TASK-630 | HTML 渲染 | P1 | ✅ Done | 2.5h |

**总预估**: 56h  
**已完成**: 4.4h  
**进度**: 7.9%

---

## 验收标准

- [ ] P0 tickets 全部完成并合并 ✅
- [ ] P1 tickets 全部完成并合并
- [ ] P2 tickets 完成设计文档
- [ ] 全部 PR 通过 CI
- [ ] 运行 `npm test` 全绿
- [ ] 更新 confluence/memory/ 经验教训

---

**创建者**: Master  
**关联**: outbox/reviews/comprehensive-project-review.md
