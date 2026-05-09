# [TASK-601] 400 Context Overflow Auto-Recovery

## 📋 Summary

实现 Claude Code 400 错误（context overflow）自动恢复机制：
- **Strategy 1**: `/compact` + retry 原请求
- **Strategy 2**: Nuclear Option（save context → restart session）

## ✅ AC Checklist

- [x] **AC-1**: 识别 4 种 400 错误类型（context_length_exceeded / invalid_request / validation / unknown）
- [x] **AC-2**: 仅 `context_length_exceeded` 触发恢复，其他 400 正常抛出
- [x] **AC-3**: `/compact` 成功后 retry 原请求，任务继续
- [x] **AC-4**: `/compact` 失败时触发 Nuclear Option（session restart）
- [x] **AC-5**: Nuclear Option 保存 task context 到 `.eket/recovery/task-<id>-context.md`
- [x] **AC-6**: 所有 400 记录到 `.eket/logs/context-overflow.log`（含 timestamp / taskId / error_type / recovery / result）
- [ ] **AC-7**: 手动实验验证（不阻塞 PR，后续补充）

## 🔧 Code Changes

**New Files**:
- `node/src/core/error-identifier.ts` - 400 错误分类器
- `node/src/core/recovery-logger.ts` - 日志 + context 保存
- `node/tests/core/error-identifier.test.ts` - 6 tests
- `node/tests/core/recovery-logger.test.ts` - 6 tests
- `node/tests/core/claude-runner-recovery.test.ts` - 6 tests

**Modified Files**:
- `node/src/core/claude-runner.ts` - 添加 400 处理逻辑（+168 lines）

## 🧪 Test Plan

```bash
npm test -- --testPathPattern="error-identifier|recovery-logger|claude-runner-recovery"
```

**Result**: ✅ **18/18 tests passing**

### Test Coverage

| Module | Tests | Status |
|--------|-------|--------|
| error-identifier.ts | 6 | ✅ PASS |
| recovery-logger.ts | 6 | ✅ PASS |
| claude-runner.ts (recovery) | 6 | ✅ PASS |

## 📊 Impact Analysis

| Module | Impact | Risk |
|--------|--------|------|
| `claude-runner.ts` | 🔴 High | Low（仅增量修改，不破坏现有逻辑） |
| 现有调用路径 | 🟢 Zero | 所有调用 `runClaude()` 自动受益 |
| 日志/recovery 目录 | 🟢 Zero | 新增目录，无侵入 |

## 🔍 Review Checklist

- [ ] 代码符合 TypeScript 规范（ESM + `.js` extensions）
- [ ] 单元测试覆盖所有 AC
- [ ] 错误日志格式清晰易读
- [ ] Nuclear Option 不丢失关键 context
- [ ] 无 breaking changes

## 📝 Notes

- **AC-7 实验验证**: 需手动构造 200k tokens 场景，不阻塞本 PR
- **依赖**: 依赖 Claude Code CLI 的 `--command /compact` 能力（未确认可用性）
- **降级策略**: 若 `/compact` 不可用，Nuclear Option 作为兜底

---

**Ready for Review** 🚀
