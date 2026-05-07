# TASK-160: JWT/Bearer Token 鉴权层（默认 off）

## 元数据
- **类型**: feature
- **优先级**: P1
- **状态**: done
- **创建**: 2026-04-21
- **完成**: 2026-05-06
- **依赖**: 无

## 背景

eket-server 暴露的 `/api/v1/*` 和 `/hooks/*` 无任何鉴权，内网可任意调用。生产部署时需要 token 保护。

## 验收标准

- [x] axum middleware：`Authorization: Bearer <token>` 校验
- [x] 配置：`EKET_AUTH_TOKEN` 环境变量；为空则鉴权关闭（默认 off）
- [x] 失败返回 `401 Unauthorized { "error": "invalid_token" }`
- [x] `eket server --auth-token <token>` CLI flag 也可配置
- [x] 白名单路径：`/ready` `/live` 不需要鉴权
- [x] 文档：README + PROTOCOL.md 注明如何开启

## 负责人
Rust Slaver（已完成）

---

## 实现记录

### 改动文件
1. `rust/crates/eket-cli/src/commands/server.rs`: 添加 `--auth-token` CLI flag
2. `rust/crates/eket-server/src/lib.rs`: 新增 5 个 integration tests
3. `README.md`: 添加鉴权配置章节
4. `rust/crates/eket-cli/build.rs`: 简化（移除 chrono 依赖）

### 测试覆盖
- **Unit tests** (auth.rs): 3 个 JWT 验证测试
- **Integration tests** (lib.rs): 5 个 middleware 测试
  - `auth_whitelist_paths_skip_auth`: 白名单路径跳过鉴权
  - `auth_protected_path_requires_token`: 受保护路径需要 token
  - `auth_valid_bearer_token_allowed`: 正确 token 允许访问
  - `auth_invalid_bearer_token_rejected`: 错误 token 拒绝
  - `auth_disabled_allows_all`: 鉴权关闭时允许所有请求
- **E2E 手动验证**: ✅ env var / CLI flag / Bearer header 全部通过

### 技术细节
- Middleware 已集成（lib.rs L478-481），无需重复实现
- Whitelist 包含 `/health` `/ready` `/live` `/sse/events`
- Error response: `{"error":"missing_token"}` 或 `{"error":"invalid_token"}`
- CLI flag 通过 `std::env::set_var` 设置环境变量
