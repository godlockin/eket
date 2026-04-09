# JavaScript SDK Release Guide

## Prerequisites

```bash
node >= 18.0.0
npm >= 9.0.0
```

需要 npm 账号并已 `npm login`，或配置 `NPM_TOKEN` 环境变量。

## Release Steps

### 1. Bump version

编辑 `package.json`：

```json
{
  "version": "1.0.1"
}
```

或使用 npm 内置命令（自动修改 package.json）：

```bash
cd sdk/javascript
npm version patch    # 1.0.0 → 1.0.1
npm version minor    # 1.0.0 → 1.1.0
npm version major    # 1.0.0 → 2.0.0
```

### 2. Commit version bump

```bash
git add package.json
git commit -m "chore(sdk-js): bump version to 1.0.1"
```

### 3. Create git tag

```bash
git tag sdk-js-v1.0.1
git push origin sdk-js-v1.0.1
```

### 4. Build

```bash
cd sdk/javascript
npm run build
# 生成 dist/ 目录
```

### 5. Verify package contents

```bash
npm pack --dry-run
# 检查打包文件列表是否符合预期（dist/, README.md, LICENSE）
```

### 6. Publish to npm

```bash
# 正式发布
npm publish

# 若是 scoped 包需 public
npm publish --access public
```

### 7. Verify

```bash
npm install eket-sdk@1.0.1
node -e "const sdk = require('eket-sdk'); console.log(sdk);"
```

---

## Version Rules

参见 `../VERSIONING.md`。

---

## Credentials

npm token 存储在 CI secrets（`NPM_TOKEN`），本地发布需先执行：

```bash
npm login
# 或
npm config set //registry.npmjs.org/:_authToken=$NPM_TOKEN
```
