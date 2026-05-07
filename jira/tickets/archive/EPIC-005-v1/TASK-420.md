# TASK-420: Node 预编译 GitHub Actions job

**EPIC**: EPIC-005 | **Milestone**: M2 | **优先级**: P0 | **工时**: 6h | **状态**: ready | **依赖**: 架构师评审

## 需求
在 `.github/workflows/release.yml` 中新增 `build-node` job，使用 ncc 打包 Node 版为单文件。

## AC
- **AC-1**: job 配置
  - Given: 推送 tag `v2.9.1-test`
  - When: GitHub Actions 运行
  - Then: `build-node` job 成功，产物上传到 artifacts

- **AC-2**: 跨平台编译
  - Given: matrix 包含 `ubuntu-latest` / `macos-latest` / `macos-14`
  - When: job 运行
  - Then: 生成 3 个平台的预编译包

- **AC-3**: 产物命名
  - Given: job 完成
  - When: 检查 artifacts
  - Then: 文件名格式 `eket-node-{os}-{arch}.js`

## 技术方案
```yaml
# .github/workflows/release.yml 新增
jobs:
  build-node:
    name: Build Node.js standalone binary
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            platform: linux-amd64
          - os: macos-latest
            platform: darwin-amd64
          - os: macos-14
            platform: darwin-arm64
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: cd node && npm ci
      
      - name: Build with ncc
        run: |
          cd node
          npx ncc build src/index.ts -o standalone --minify
      
      - name: Create executable
        run: |
          echo "#!/usr/bin/env node" > eket-node-${{ matrix.platform }}.js
          cat node/standalone/index.js >> eket-node-${{ matrix.platform }}.js
          chmod +x eket-node-${{ matrix.platform }}.js
      
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: eket-node-${{ matrix.platform }}
          path: eket-node-${{ matrix.platform }}.js
```

## 交付物
- [ ] `.github/workflows/release.yml` 更新
- [ ] 测试 workflow（推送 test tag）
- [ ] 验证 artifact 可执行性
