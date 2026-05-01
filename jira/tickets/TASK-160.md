# TASK-160: JWT/Bearer Token 鉴权层（默认 off）

## 元数据
- **类型**: feature
- **优先级**: P1
- **状态**: ready
- **创建**: 2026-04-21
- **依赖**: 无

## 背景

eket-server 暴露的 `/api/v1/*` 和 `/hooks/*` 无任何鉴权，内网可任意调用。生产部署时需要 token 保护。

## 验收标准

- [ ] axum middleware：`Authorization: Bearer <token>` 校验
- [ ] 配置：`EKET_AUTH_TOKEN` 环境变量；为空则鉴权关闭（默认 off）
- [ ] 失败返回 `401 Unauthorized { "error": "invalid_token" }`
- [ ] `eket server --auth-token <token>` CLI flag 也可配置
- [ ] 白名单路径：`/ready` `/live` 不需要鉴权
- [ ] 文档：README + PROTOCOL.md 注明如何开启

## 负责人
待认领（推荐：Rust 工程师 + DevOps）
