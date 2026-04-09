# SDK Versioning Strategy

## Overview

EKET SDK（Python & JavaScript）使用**独立 semver**，与 node core（v2.x）完全解耦。

```
node core:    2.x.x  （框架核心，独立演进）
EKET SDK:     1.x.x  （SDK，独立演进）
EKET Protocol: 1.x.x （协议规范，SDK 实现的标准）
```

---

## SDK 版本与 EKET Protocol 对应关系

| SDK 版本     | EKET Protocol | 说明                          |
|-------------|---------------|-------------------------------|
| 1.0.0       | 1.0.0         | 初始稳定版本，完整 v1 协议支持  |
| 1.1.0       | 1.0.x         | 新功能，向后兼容               |
| 2.0.0       | 2.0.0         | 协议 major 升级，破坏性变更    |

> Python SDK 1.0.0 + JS SDK 1.0.0 均对应 **EKET Protocol 1.0.0**。

---

## 版本升级规则（Semantic Versioning）

### MAJOR（不兼容变更）
触发条件：
- 移除或重命名公开 API（方法、类、参数）
- 修改现有参数类型或返回类型
- 对应 EKET Protocol major 版本升级

示例：`1.x.x → 2.0.0`

### MINOR（向后兼容新功能）
触发条件：
- 新增公开 API、方法、参数（可选）
- 新增对 EKET Protocol minor 新特性的支持
- 性能优化（不影响接口）

示例：`1.0.x → 1.1.0`

### PATCH（向后兼容 bug fix）
触发条件：
- Bug 修复，不影响公开接口
- 文档、注释修正
- 内部实现优化（接口不变）

示例：`1.0.0 → 1.0.1`

---

## SDK 与 node core 解耦说明

- node core（`node/`）版本为 `2.x.x`，遵循框架自身演进节奏
- SDK（`sdk/python/`、`sdk/javascript/`）版本为 `1.x.x`，遵循协议演进节奏
- 两者**互不依赖版本号**，可独立发布
- SDK 通过 HTTP/WebSocket 与 EKET Gateway 通信，不直接依赖 node core 代码

---

## 发布 Tag 规范

```
sdk-python-v1.0.0    # Python SDK 发布 tag
sdk-js-v1.0.0        # JavaScript SDK 发布 tag
v2.6.0               # node core 发布 tag（不影响 SDK）
```

---

## 当前版本状态

| 组件           | 版本  | 状态       |
|----------------|-------|------------|
| Python SDK     | 1.0.0 | 稳定       |
| JavaScript SDK | 1.0.0 | 稳定       |
| EKET Protocol  | 1.0.0 | 稳定       |
| node core      | 2.x.x | 独立演进   |
