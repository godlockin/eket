# TASK-001: 修复 http-hook-server 测试失败

**类型**: Bug Fix
**优先级**: P0
**状态**: ready
**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:
**分配给**: 待领取
**预估工时**: 2 小时

---

## 问题描述

`http-hook-server.test.ts` 有 33 个测试失败，所有失败都是因为 `EADDRINUSE` 错误 - 端口被占用。

## 根本原因

测试之间服务器未正确清理，导致端口无法释放。`afterEach` 钩子可能未正确执行或等待时间不够。

## 技术方案

### 方案 1: 改进服务器清理逻辑
```typescript
afterEach(async () => {
  if (server) {
    await server.stop();
    server = null;
  }
  // 等待端口释放
  await new Promise(resolve => setTimeout(resolve, 100));
});
```

### 方案 2: 使用动态端口分配
```typescript
const getRandomPort = () => 20000 + Math.floor(Math.random() * 10000);
let testPort = getRandomPort();
```

### 方案 3: 添加端口检查机制
```typescript
const waitForPortRelease = async (port: number, timeout = 5000) => {
  // 实现端口释放检查
};
```

## 验收标准

- [ ] 39/39 测试全部通过
- [ ] 无 EADDRINUSE 错误
- [ ] 测试可以连续运行多次
- [ ] 测试时间 <60 秒

## 相关文件

- `node/tests/http-hook-server.test.ts`
- `node/src/hooks/http-hook-server.ts`

## 参考

- 测试输出: `/private/tmp/.../b9dlo9xo6.output`
- 错误分析: 端口 20580-20602 全部被占用

---

**角色要求**: QA / Backend
**技能要求**: Jest, TypeScript, HTTP Server
**依赖**: 无
