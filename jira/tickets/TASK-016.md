# TASK-016: SDK 版本策略与发布流程

**优先级**: P2
**Round**: 14
**目标版本**: v2.6.0
**分支**: `feature/TASK-016-sdk-release-strategy`

---

## 背景

Python SDK (`sdk/python/`) 和 JS SDK (`sdk/javascript/`) 均已开发完成，tests 通过，但缺少：
- 统一版本策略（与 node core v2.x 的关系）
- PyPI / npm 发布配置
- RELEASING.md 发布说明文档
- GitHub Actions 自动发布 workflow

---

## 任务清单

### 1. 版本策略文档
- [ ] 创建 `sdk/VERSIONING.md`
  - SDK 使用独立 semver（1.x），与 node core (2.x) 解耦
  - 版本对应关系表（SDK 1.0.0 ↔ EKET Protocol 1.0.0）
  - 版本升级触发条件（API 变更 → minor/major，bug fix → patch）

### 2. Python SDK 发布配置
- [ ] `sdk/python/pyproject.toml` 补充完整 build system 配置（hatchling 或 setuptools）
- [ ] 验证 `python3 -m build` 可成功生成 dist/
- [ ] 创建 `sdk/python/RELEASING.md`（发布步骤：bump version → build → twine upload）

### 3. JS SDK 发布配置
- [ ] `sdk/javascript/package.json` 验证 `name`/`main`/`exports` 字段
- [ ] 验证 `npm pack` 可生成正确的 tarball
- [ ] 创建 `sdk/javascript/RELEASING.md`（发布步骤：bump version → npm pack → npm publish）

### 4. GitHub Actions 发布 workflow（可选，若时间允许）
- [ ] `.github/workflows/sdk-publish.yml`
  - 触发：push tag `sdk-python-v*` 或 `sdk-js-v*`
  - Python: build + twine upload to PyPI
  - JS: npm publish

---

## 验收标准

- [ ] `sdk/VERSIONING.md` 存在，策略清晰
- [ ] `python3 -m build` 在 sdk/python/ 下成功
- [ ] `npm pack` 在 sdk/javascript/ 下成功，产物合理
- [ ] 两个 RELEASING.md 存在
- [ ] 所有现有测试仍通过（无回归）

---

## 参考

- 现有 Python SDK: `sdk/python/setup.py`, `sdk/python/pyproject.toml`
- 现有 JS SDK: `sdk/javascript/package.json`
- EKET Protocol version: `sdk/python/eket_sdk/__init__.py` (`__protocol_version__ = "1.0.0"`)
