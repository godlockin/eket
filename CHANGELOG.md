# Changelog

All notable changes to the EKET Framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.1] - 2026-04-07

### Fixed
- **BUG-003**: OptimizedFileQueue 校验和逻辑错误 - 修复 timestamp 类型转换问题，支持新旧消息格式
- **BUG-009**: 清理僵尸脚本 `scripts/start.sh`，添加废弃警告
- **BUG-012**: 添加 `IDENTITY.md` 自动复制逻辑到 `scripts/init-project.sh`
- **BUG-015**: 修正 `template/.claude/commands/eket-init.sh` 中的文档路径引用

### Added
- **HTTP Server 安全增强**: 5 个生产级安全特性
  - Rate Limiting: 防止 API 滥用 (15分钟100次请求限制)
  - CORS 配置: 跨域请求支持，可通过环境变量配置
  - JSON Schema 验证: 所有 POST/PATCH 端点输入验证
  - 结构化日志: 使用 morgan 记录请求详情
  - 健康检查增强: 添加 Redis 和 WebSocket 依赖状态检查

### Changed
- 更新 `scripts/init.sh` 中的启动命令提示为最新格式
- 更新 `tests/dry-run/test-fallback-modes.sh` 测试逻辑

### Dependencies
- Added: `express-rate-limit@^7.0.0` - Rate limiting 中间件
- Added: `cors@^2.8.5` - CORS 支持
- Added: `ajv@^8.12.0` - JSON Schema 验证
- Added: `morgan@^1.10.0` - HTTP 请求日志

### Technical Debt
- 23 个历史遗留测试失败需要后续修复 (非本次修改引入)
- Agent 1 的 6 个核心模块 Bug 需要更深入修复

## [2.1.0] - 2026-04-07

### Added
- **Phase A**: EKET Protocol V1.0 完整规范
  - 13 章协议文档 (`docs/protocol/EKET_PROTOCOL_V1.md`)
  - OpenAPI 3.0 定义 (`docs/protocol/openapi.yaml`, 753 行)
  - JSON Schema 文件 (agent_registration, message, task)
  - 5 分钟快速入门指南

- **Phase B**: HTTP Server 实现
  - 15 个 REST API 端点 (完整 CRUD)
  - WebSocket 实时通信
  - JWT 认证 (7天 token 过期)
  - Redis 状态管理 (RedisHelper 封装)
  - Agent 注册/注销/心跳
  - 任务查询/更新/领取
  - 消息发送/接收
  - PR 提交/审核/合并

- **Phase D**: SDK 实现
  - Python SDK (`sdk/python/`, 900+ 行)
    - EketClient 完整客户端
    - 数据模型 (dataclass + enum)
    - 自定义异常体系
    - Context manager 支持
  - JavaScript/TypeScript SDK (`sdk/javascript/`, 1220+ 行)
    - 完整 async/await API
    - WebSocket 管理器
    - 40+ TypeScript 接口
    - 自动重连机制
    - Exponential backoff 重试

- **Phase C**: End-to-End 协作示例
  - Master Agent (TypeScript) 演示
  - Slaver Agent (Python) 演示
  - 完整工作流: 注册 → 任务 → PR → 合并
  - 自动化运行脚本
  - 详细文档 (15,000+ 字)

### Changed
- 项目版本从 v2.0.0 升级到 v2.1.0
- 文档审查: 归档 10 个过时的 v0.x 文档到 `docs/archive/`
- 更新所有核心文档到 v2.1.0

### Fixed
- Redis Helper 封装，解决连接池问题
- ESM 模块导入规范 (所有导入带 `.js` 扩展名)
- TypeScript 类型安全增强

## [2.0.0] - 2026-04-06

### Added
- Master-Slaver 架构实现
- 三仓库分离 (confluence/jira/code_repo)
- Redis + SQLite 双存储
- 四级降级连接管理
- 三级 Master 选举
- 消息队列 (Redis Pub/Sub + 文件降级)
- 断路器模式
- 二级缓存 (LRU + Redis)
- Instance Registry
- Agent Pool 管理
- Workflow Engine
- Event Bus
- 告警系统
- Knowledge Base
- Skills 系统
- Web Dashboard
- OpenCLAW Gateway
- HTTP Hook Server

### Changed
- 项目重构为模块化架构
- 依赖注入容器 (DIContainer)
- 统一错误处理 (Result<T> 模式)
- 完整的 TypeScript 类型定义

## [0.x] - 2024-2025

各版本历史详见 `docs/archive/v0.x/` 目录。

---

**维护者**: EKET Framework Team
**问题反馈**: GitHub Issues
