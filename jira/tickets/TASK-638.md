# TASK-638: DAG 日志脱敏

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P2  
**预估**: 0.5d  
**依赖**: TASK-633, TASK-634  
**层级**: L1 Rust, L2 Node  
**来源**: Adversarial Review (安全)

---

## 问题描述

`dag-executor.ts:533-537` 和 Rust 执行器日志记录完整 `script` 内容，可能含密码/token。

**风险**: 敏感信息泄露到日志文件。

## 验收标准

- [x] Node.js 日志截断 script 到 100 字符 + `...`
- [x] Rust 日志同样截断
- [x] 检测常见敏感模式并打码（`API_KEY=***`）
- [x] 添加 `--verbose` 选项显示完整内容（默认关闭）

## 脱敏方案

```typescript
function sanitizeScript(script: string): string {
  // 截断
  const truncated = script.length > 100 
    ? script.slice(0, 100) + '...' 
    : script;
  
  // 打码敏感信息
  return truncated
    .replace(/(?:API_KEY|TOKEN|PASSWORD|SECRET)=\S+/gi, '$1=***')
    .replace(/Bearer \S+/g, 'Bearer ***');
}
```

## 实现详情

### Node.js (`node/src/core/dag-executor.ts`)

- 新增 `sanitizeScript(script, maxLength=100)` 函数
- 新增 `ExecuteOptions.verbose` 选项（默认 false）
- 脱敏模式覆盖：
  - `API_KEY|TOKEN|PASSWORD|SECRET|PRIVATE_KEY|ACCESS_KEY|AUTH=value`
  - `Bearer token`
  - `Basic base64`
  - GitHub PAT (`ghp_xxx`)
  - Slack token (`xoxb-xxx`)

### Rust (`rust/crates/eket-engine/src/dag/executor.rs`)

- 新增 `sanitize_script(script, max_len)` 函数
- 新增 `mask_sensitive(s)` 内部函数
- 在 `DryRunExecutor` 中应用脱敏
- 新增 `regex = "1"` 依赖

### 测试覆盖

- Node.js: 13 个测试用例（截断、各类敏感模式、组合场景）
- Rust: 7 个测试用例（截断、各类敏感模式）

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket (安全 Review) | Master |
| 2026-06-01 | 实现 Node.js + Rust 脱敏，添加测试 | Slaver |
