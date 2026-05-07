# TASK-097: CI 补全 JavaScript SDK 测试

## 元数据
- **状态**: done
- **类型**: devops
- **优先级**: P0
- **负责人**: Slaver
- **创建时间**: 2026-04-19
- **完成时间**: 2026-04-19
- **依赖**: 无

## 背景

`.github/workflows/ci.yml` 已有 Node.js、Shell、Python SDK 三个 job，
唯独缺少 **JavaScript SDK** 的 CI 覆盖。
`sdk/javascript/` 有 `npm test`（jest），`npm run build`（tsc），但从未在 CI 中运行过。
SDK 破坏无人感知。

## 验收标准

1. `ci.yml` 新增 Job 4：`JavaScript SDK (build / test)`
2. Job 包含：`npm ci` → `npm run build` → `npm test`
3. Push 到任意分支均触发
4. 本地确认 `sdk/javascript/` 测试可通过

## 实现

在 `ci.yml` 现有 Job 3（Python SDK）之后追加：

```yaml
  # ============================================================
  # Job 4: JavaScript SDK — build / test
  # ============================================================
  js-sdk:
    name: JavaScript SDK (build / test)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: sdk/javascript

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: sdk/javascript/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Build (tsc)
        run: npm run build

      - name: Test (jest)
        run: npm test
```

## 执行命令

```bash
# 本地先验证 SDK 测试是否通过
cd sdk/javascript && npm ci && npm run build && npm test
```
