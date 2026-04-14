# TASK-013: GitHub Actions CI 流水线

**创建时间**: 2026-04-09
**创建者**: Master Agent
**版本**: v2.5.0
**优先级**: P0
**状态**: open
**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:
**分支**: feature/TASK-013-github-actions-ci

## 背景

项目目前没有 CI/CD，每次合并依赖人工运行测试。Round 13b 目标是建立自动化基础。

## 验收标准

- [ ] `.github/workflows/ci.yml` 存在并可运行
- [ ] 触发条件：push 到任意分支、PR 到 main/testing
- [ ] 步骤：checkout → setup-node 20 → `cd node && npm ci` → `npm run build` → `npm test`
- [ ] 使用 `NODE_OPTIONS=--experimental-vm-modules` 环境变量
- [ ] 测试结果上传为 Artifact（可选）
- [ ] 本地验证：yaml 语法正确，逻辑合理

## 技术要求

```yaml
# 参考结构
name: CI
on:
  push:
    branches: ['**']
  pull_request:
    branches: [main, testing, miao]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: node/package-lock.json
      - run: cd node && npm ci
      - run: cd node && npm run build
      - run: cd node && npm test
        env:
          NODE_OPTIONS: --experimental-vm-modules
```

## 不在范围内

- Docker Hub 推送（14 Round）
- 分支保护规则配置（TASK-014）
- semantic-release（已砍）

## 交付物

- `.github/workflows/ci.yml`
- PR 到 miao 分支
