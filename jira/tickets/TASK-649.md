# TASK-649: DAGSlaverBridge 鉴权机制

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P2  
**预估**: 1d  
**依赖**: TASK-642  
**层级**: L2 Node.js  
**来源**: Adversarial Review (安全)

---

## 问题描述

`DAGSlaverBridge.sendTaskAssignment` 无身份验证，任意进程可伪造 heartbeat 领取任务。

## 验收标准

- [x] 任务分发时附带签名 token
- [x] Slaver 领取时验证 token
- [x] Token 有时效性（默认 5 分钟）
- [x] 无效 token 拒绝并告警

## 实现方案

### Token 生成
```typescript
// Master 分发时
const token = crypto.createHmac('sha256', EKET_SECRET)
  .update(`${taskId}:${slaverId}:${timestamp}`)
  .digest('hex');

const assignment = {
  taskId,
  slaverId,
  timestamp,
  token,  // 附带签名
};
```

### Token 验证
```typescript
// Slaver 领取时
function verifyAssignment(assignment: TaskAssignment): boolean {
  const { taskId, slaverId, timestamp, token } = assignment;
  
  // 检查时效性
  if (Date.now() - timestamp > 5 * 60 * 1000) {
    return false;
  }
  
  // 验证签名
  const expected = crypto.createHmac('sha256', EKET_SECRET)
    .update(`${taskId}:${slaverId}:${timestamp}`)
    .digest('hex');
    
  return token === expected;
}
```

### 环境变量
- `EKET_SECRET`: 签名密钥（必填，≥32 字符）
- `EKET_TOKEN_TTL`: Token 有效期（默认 300 秒）

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket (安全 Review P2) | Master |
| 2026-06-01 | 实现完成: auth-token.ts + 25 tests | Slaver |

---

## 实现详情

### 新增文件
- `node/src/utils/auth-token.ts` - HMAC-SHA256 token 生成/验证
- `node/tests/utils/auth-token.test.ts` - 25 个测试用例

### 修改文件
- `node/src/core/agent-mailbox.ts`:
  - `TaskAssignmentMessage` 新增 `authToken`, `authTimestamp` 字段
  - `createTaskAssignmentMessage()` 自动生成 token（如启用）
  - `sendTaskAssignment()` 传递 slaverId 用于签名
  - 新增 `verifyTaskAssignmentMessage()` 供 Slaver 验证

### API
```typescript
// Master 发送任务（自动签名）
await sendTaskAssignment(slaverId, { taskId, subject, description, assignedBy });

// Slaver 验证任务
const result = verifyTaskAssignmentMessage(message, slaverId);
if (!result.valid) {
  throw new Error(`Auth failed: ${result.reason}`);
}
```

### 测试覆盖
- Token 生成/验证
- 过期检测 (TTL)
- 签名篡改检测
- 重放攻击防护 (slaverId 绑定)
- 向后兼容 (auth 未启用时放行)
