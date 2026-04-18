# EKET Protocol

**版本**: 见 [`VERSION`](VERSION)
**状态**: Draft — Phase 0 / Task 0.2 产出

---

## 定位

本目录是 EKET **双引擎（Shell / Node）的共同契约**。任何对共享 FS 状态的读写操作，两边引擎都必须：

1. 从本目录读 schema
2. 按 schema 校验
3. 按 `conventions/` 约定的方式写入（原子、加锁）
4. 记录审计

**协议版本不兼容时，Shell 和 Node 启动应报错并拒绝运行**。

---

## 目录

```
protocol/
├── VERSION                          # 协议版本号（SemVer）
├── schemas/                         # 数据结构定义
│   ├── ticket.meta.schema.yml       # ticket Markdown 元数据块
│   ├── message.schema.json          # 消息队列消息
│   ├── node.profile.schema.json     # 节点身份（Phase 1）
│   └── heartbeat.schema.json        # 心跳文件
├── state-machines/                  # 状态转移合法性
│   └── ticket-status.yml
└── conventions/                     # 实现约定
    ├── atomic-write.md
    ├── file-locking.md
    └── node-id.md
```

---

## 版本策略

- **MAJOR**: FS 结构不兼容变更（字段删除、状态重命名）
- **MINOR**: 新增字段、新增状态、新增可选规范
- **PATCH**: 文档修订、澄清、typo

**跨版本兼容性**：
- MINOR 向后兼容：旧引擎可读新数据但可能忽略新字段
- MAJOR 不兼容：必须双引擎同步升级

---

## 使用方

### Shell 引擎
```bash
# lib/state/schema.sh
schema_validate "ticket" "$field" "$value"
```
Shell 使用 `yq` / `jq` / `ajv-cli`（如可用）做校验，降级时做基本字段存在性检查。

### Node 引擎
```typescript
// node/src/core/state/schema.ts
import { validate } from './schema.js';
validate('ticket', data);
```
Node 使用 `ajv` 做完整 JSON Schema 校验。

### 启动校验
两侧引擎启动时：
1. 读 `protocol/VERSION`
2. 对比自身兼容版本列表
3. 不兼容则拒绝启动并提示升级

---

## 贡献

修改协议遵循以下流程：
1. 提 Issue 说明变更动机
2. 同时修改 `schemas/` / `state-machines/` / `VERSION`
3. **同时提交** Shell 和 Node 的对应实现
4. 通过 [等价性测试](../tests/dual-engine/) 才能合并

**禁止**单独修改 schema 不改实现、或单独改实现不改 schema。
