# EPIC-005 CI 决策：跳过 PyPI/npm 发布

**决策时间**: 2026-05-07 21:40
**决策者**: Master

---

## 问题

CI 3 个 job 失败：
1. Publish Python SDK to PyPI（缺 NPM_TOKEN）
2. Publish JavaScript SDK to npm（缺认证）
3. Build Node.js binary (darwin-amd64)（pkg 错误）

---

## Master 决策

**跳过 PyPI/npm 发布 job**（与 EPIC-005 无关）

**理由**:
1. EPIC-005 目标：一键安装系统（预编译 binaries）
2. PyPI/npm 发布是 SDK 发布（不同领域）
3. 修复需要配置 secrets（超出 EPIC-005 范围）

**调整**:
- 测试 `build-node` job 单独运行
- 或创建独立 workflow 测试 EPIC-005 功能

---

## 下一步

Master 创建临时 workflow 测试 EPIC-005：
- 仅运行 build-binary + build-node
- 跳过 PyPI/npm 发布
- 验证预编译包生成

**文件**: `.github/workflows/test-epic005.yml`
