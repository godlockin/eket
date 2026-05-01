# TASK-184: 统一认证机制——Node JWT与Rust静态token不兼容

**优先级**: P1
**类型**: Bug
**模块**: auth.rs + eket-server.ts
**来源**: 红队质疑 JeffDean

## 问题描述

Node.js用JWT（header.payload.signature），Rust用静态Bearer token字符串比较。Node生成的JWT在Rust层100%验证失败，代理请求全部401。当前因`EKET_AUTH_TOKEN`未配置而被掩盖。

## 验收标准

- [ ] 方案：Rust改支持JWT验证（HS256，共享`EKET_JWT_SECRET`）
- [ ] `auth.rs` 引入 `jsonwebtoken` crate，验证签名+exp
- [ ] Node侧 `EKET_JWT_SECRET` 与Rust侧共用同一env var
- [ ] 内部服务间调用（Node→Rust proxy）用短期JWT（exp=5min）
- [ ] `EKET_AUTH_TOKEN`（static token）保留作为向后兼容选项
- [ ] 单元测试：有效JWT通过；过期JWT拒绝；Node生成的token在Rust侧验证通过
