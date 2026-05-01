# TASK-409: Node.js 24 兼容性升级

## 元数据
- **状态**: todo
- **类型**: infra
- **优先级**: P2
- **agent_type**: devops
- **estimate_hours**: 2
- **parent_epic**: EPIC-004
- **deadline**: 2026-06-02

## 背景

GitHub Actions 将于 2026-06-02 强制将 `actions/checkout@v4` 从 Node.js 20 切换到 Node.js 24。
CI workflow 已报 deprecation warning。

## 详细描述

1. 检查所有 `.github/workflows/*.yml` 中的 actions 版本
2. 升级需要升级的 actions（`actions/checkout`、`actions/setup-node` 等）
3. 在 CI matrix 中添加 Node.js 24 测试
4. 本地用 Node 24 运行 `npm test` 确认兼容性
5. 如有不兼容，修复或记录

## 验收标准
- [ ] AC-1: 所有 workflow 使用最新 actions 版本
- [ ] AC-2: CI matrix 包含 Node 20 + Node 24
- [ ] AC-3: 测试在 Node 24 下全绿或已记录不兼容项

---
agent_type: devops
estimate_hours: 2
