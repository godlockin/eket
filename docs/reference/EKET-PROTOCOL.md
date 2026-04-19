# EKET 协议参考

> **协议正本**：项目根目录 [`protocol/`](../../protocol/)（Shell / Node / SDK 共同契约）

## 目录结构

| 路径 | 说明 |
|------|------|
| `protocol/schemas/` | JSON Schema 定义（数据结构契约） |
| `protocol/conventions/` | 文件系统读写约定（原子操作、加锁规范） |
| `protocol/state-machines/` | 状态机定义（Task/Instance 生命周期） |
| `protocol/VERSION` | 当前协议版本（`0.1.0-draft`） |

## 版本说明

当前版本：`0.1.0-draft`，Shell 与 Node 引擎均依赖此协议。
协议版本不兼容时，两端启动应报错并拒绝运行。

## OpenAPI 规范

[openapi.yaml](openapi.yaml) — HTTP API 接口规范（与 protocol/ 的 JSON Schema 互补，非重复）
