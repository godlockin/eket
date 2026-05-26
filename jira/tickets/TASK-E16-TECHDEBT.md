# TASK-E16-TECHDEBT: EPIC-016 AB Review 发现的 P1/P2 技术债

**EPIC**: EPIC-016  
**状态**: backlog  
**优先级**: P1  
**预估**: 1d  
**负责人**: 待分配  
**依赖**: TASK-E16-HOTFIX

---

## 背景

AB 对抗 Review 中 B 组发现的 P1/P2 问题，非阻塞但应后续修复。

## 问题清单

### P1 边界条件

1. **TokenMeter 负数 token 无验证**
   - 文件：`node/src/core/token-meter.ts:87-98`
   - 修复：`if (tokens < 0) throw new Error(...)`

2. **Fact-Forcing 路径规范化不完整**
   - 文件：`node/src/hooks/pre-tool-use/fact-forcing-gate.ts:138-141`
   - 修复：使用 `path.normalize()` 处理 `//`、`../`、Unicode

### P2 运维风险

3. **Hook Profile 无效配置静默降级**
   - 文件：`node/src/hooks/hook-flags.ts:142-155`
   - 修复：非 debug 模式也输出 `console.warn`

4. **Dispatcher firstFailure 可能 undefined**
   - 文件：`node/src/hooks/pre-bash-dispatcher.ts:335`
   - 修复：检查 `executed.length === 0` 返回明确信息

5. **SessionTracker 内存泄漏风险**
   - 文件：`node/src/hooks/pre-tool-use/fact-forcing-gate.ts:58-65`
   - 修复：添加 TTL 和定期清理机制

## 验收标准

- [ ] 所有 P1 问题修复
- [ ] 所有 P2 问题修复
- [ ] 新增边界测试用例

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-05-27 | 创建 Tech Debt Ticket | Master (AB Review) |
