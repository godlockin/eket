# TASK-E16-01: Fact-Forcing Gate 实现

**EPIC**: EPIC-016  
**状态**: done  
**优先级**: P0  
**预估**: 2d  
**负责人**: 待分配  
**依赖**: 无

---

## 背景

借鉴 ECC 的 GateGuard Fact-Forcing 机制。核心理念：不问"确定吗"（AI 总是回答是），而是要求提供具体证据。

## 目标

实现 pre-tool-use hook，在关键操作前强制 fact-check。

## 范围

### 1. Fact-Forcing 触发场景

| 操作 | 强制检查 |
|------|----------|
| Edit/Write 文件 | 必须先 Read 过该文件 |
| 删除文件 | 必须 grep 反向引用 |
| 修改核心模块 | 必须列出影响范围 |
| 断言完成 | 必须有命令输出作为证据 |

### 2. 实现方式

```typescript
// node/src/hooks/pre-tool-use/fact-forcing-gate.ts
interface FactCheck {
  tool: 'Edit' | 'Write' | 'Bash';
  target: string;
  requiredEvidence: 'read_first' | 'grep_refs' | 'list_impact';
}

function checkFactForcing(toolCall: ToolCall): FactCheckResult {
  // 检查上下文中是否已有证据
  // 无证据 → 返回错误，要求先获取
}
```

### 3. Hook 配置

```json
{
  "matcher": "Edit|Write",
  "hooks": [{
    "command": "node dist/hooks/fact-forcing-gate.js",
    "timeout": 5000
  }],
  "id": "pre:edit:fact-forcing"
}
```

## 验收标准

- [ ] Edit 文件前未 Read → 阻止并提示
- [ ] 删除文件前未 grep → 阻止并提示
- [ ] 可通过 `ECC_FACT_FORCING=off` 临时禁用
- [ ] 单元测试覆盖核心场景

## 技术要点

- 参考 ECC `scripts/hooks/gateguard-fact-force.js`
- 状态追踪：记录当前 session 已 Read 的文件列表
- 错误信息需指导性：告诉用户需要先做什么

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-05-27 | 创建 Ticket | Master |
