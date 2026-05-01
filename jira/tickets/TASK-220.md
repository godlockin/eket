# TASK-220: EscalateToMaster判决超时留zombie workflow + task-checkpoint CAS throws

**优先级**: P1
**类型**: Bugfix
**模块**: rust/crates/eket-engine/src/workflow.rs, node/src/core/task-checkpoint.ts
**来源**: 红队审查 Jeff P1 ×2
**工作量**: 0.5天

## 问题1：EscalateToMaster zombie（workflow.rs L329/363）
判决超时 fallback=EscalateToMaster 时，runner loop 退出但 status 仍为 Paused，
`finished_at` 未设置，workflow 永久卡住无法被 GC 或重试。

## 修复1
```rust
JudgmentFallback::EscalateToMaster => {
    warn!(...);
    // 将状态改为 Failed，设置 error 信息
    inst.status = WorkflowStatus::Failed;
    inst.error = Some("Judgment escalated to master: awaiting decision".into());
    inst.finished_at = Some(Utc::now());
    false
}
```

## 问题2：task-checkpoint.ts saveCheckpoint CAS 抛异常但 API 签名返回 Result
`saveCheckpoint` 遇到 CAS 冲突时 throw，而非 return `{success:false}`，
调用方检查 `result.success` 永远看不到 CAS 失败。

## 修复2
```typescript
} catch (e) {
  if (e instanceof CheckpointCASError) {
    return { success: false, error: e.message, casConflict: true };
  }
  throw e; // 非CAS错误继续抛
}
```

## 验收标准
- [x] EscalateToMaster 超时后 workflow status = Failed，finished_at 已设置
- [x] saveCheckpoint CAS 冲突返回 Result 而非 throw
- [x] 新增测试覆盖两个场景
- [x] 全部测试通过

## 实现记录
- `workflow.rs` L348: EscalateToMaster arm 内通过 `get_inst_arc!()` 获锁，设置 status=Failed、error、finished_at
- `task-checkpoint.ts` L72: catch CheckpointCASError → return `{success:false,error:e.message,casConflict:true}`
- Rust test: `test_escalate_to_master_sets_failed_status` — 判决50ms超时后验证 Failed + finished_at
- TS test: 替换旧 throw 断言 → casConflict result 断言（14/14 pass）
