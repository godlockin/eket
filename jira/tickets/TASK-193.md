# TASK-193: WebSocket连接加认证——防止冒充任意agent

**状态**: dropped

**优先级**: P2
**类型**: Security
**模块**: node/src/api/eket-server.ts:308
**来源**: 红队质疑 JeffDean

## 问题描述

`/ws?instance_id=xxx` 无认证，任何客户端可冒充任意agent接管其WebSocket槽位。

## 验收标准

- [ ] WS握手时验证Bearer token或JWT（复用TASK-184的认证机制）
- [ ] `instance_id` 与token中的sub claim匹配验证
- [ ] 认证失败返回 `4401` close code
- [ ] 单元测试：无token被拒；有效token+匹配id通过；token与id不匹配拒绝
