# TASK-408: 修复 agent-mailbox 测试抖动

## 元数据
- **状态**: todo
- **类型**: bugfix
- **优先级**: P2
- **agent_type**: code
- **estimate_hours**: 1.5
- **parent_epic**: EPIC-004

## 详细描述

`tests/agent-mailbox.test.ts` 偶发失败，Jest 报告：
- `A worker process has failed to exit gracefully and has been force exited`
- `Cannot log after tests are done. Did you forget to wait for something async in your test?`

根因分析：
1. 阅读 `tests/agent-mailbox.test.ts`，找到未正确 teardown 的 async 资源
2. 检查是否有 `setTimeout`/`setInterval` 未 `clearTimeout`/`clearInterval`
3. 检查 Redis/SQLite 连接是否在 `afterAll` 中正确关闭
4. 添加 `jest.useFakeTimers()` 或确保 `afterAll` 等待所有 pending async

修复后：
- 运行 `npm test -- --testPathPattern=agent-mailbox --detectOpenHandles` 确认无泄漏
- 连续运行 3 次确认无抖动

## 验收标准
- [ ] AC-1: `--detectOpenHandles` 无 warning
- [ ] AC-2: 连续 3 次 `npm test` 全绿
- [ ] AC-3: 不引入新的 lint 问题

---
agent_type: code
estimate_hours: 1.5
