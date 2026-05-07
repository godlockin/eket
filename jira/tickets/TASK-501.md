# TASK-501: CI 编译 Rust + Node（调整 release.yml）

**EPIC**: EPIC-005 | **Milestone**: M1 | **优先级**: P0 | **工时**: 6h | **状态**: superseded | **依赖**: TASK-427 ✅  
**完成时间**: 2026-05-07

## 需求
调整 `.github/workflows/release.yml`，确保 Rust + Node 都编译并生成跨平台 binaries。

## AC
- **AC-1**: Rust 编译验证
  - Given: 推送 tag `v2.9.1`
  - When: `build-binary` job 运行
  - Then: 生成 3 个平台 binary（linux-x64 / macos-arm64 / macos-x64）

- **AC-2**: Node pkg 打包
  - Given: 新增 `build-node` job
  - When: job 运行
  - Then: 生成 3 个平台 pkg binary（~50 MB each）

- **AC-3**: sha256 生成
  - Given: 所有 binary 编译完成
  - When: `create-release` job 运行
  - Then: 每个 binary 有对应 `.sha256` 文件

## 技术方案
```yaml
# .github/workflows/release.yml 调整

build-node:  # 新增 job
  strategy:
    matrix:
      include:
        - os: ubuntu-latest
          target: node20-linux-x64
          artifact: eket-node-linux-amd64
        - os: macos-latest
          target: node20-macos-x64
          artifact: eket-node-darwin-amd64
        - os: macos-14
          target: node20-macos-arm64
          artifact: eket-node-darwin-arm64
  runs-on: ${{ matrix.os }}
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: {node-version: '20'}
    - run: cd node && npm ci
    - run: cd node && npx pkg . --targets ${{ matrix.target }} --output ../${{ matrix.artifact }}
    - run: chmod +x ${{ matrix.artifact }}
    - run: ./${{ matrix.artifact }} --version  # 验证
    - uses: actions/upload-artifact@v4
      with:
        name: ${{ matrix.artifact }}
        path: ${{ matrix.artifact }}

create-release:  # 调整现有 job
  needs: [build-binary, build-node]  # 新增 build-node 依赖
  steps:
    - name: Download artifacts
      uses: actions/download-artifact@v4
    
    - name: Generate SHA256
      run: |
        for file in eket-*; do
          sha256sum "$file" > "$file.sha256"
        done
    
    - name: Upload to Release
      uses: softprops/action-gh-release@v1
      with:
        files: |
          eket-*
          *.sha256
          install.sh  # 下一步 TASK-502 生成
```

## 交付物
- [ ] `.github/workflows/release.yml` 更新
- [ ] `node/package.json` 添加 pkg 配置
- [ ] 本地测试 pkg 打包成功
- [ ] 推送 test tag 验证 CI

## 时限
**6h** 内完成

---

## 架构决策变更

**时间**: 2026-05-07 15:22  
**决策**: 放弃 Node 预编译，改为 Rust-only 预编译方案  
**原因**: `pkg` 工具不支持 ESM（ES Modules），Node.js 项目已全面采用 ESM 无法降级

**替代实现**:
- **简版安装**: Rust 预编译包（~10 MB）+ 本地 `npm install` Node 依赖
- **研发版安装**: 本地编译 Rust + Node（完整源码）
- **安装脚本**: `scripts/install-template-rust-only.sh`

**相关提交**: 
- `279137dc0` — refactor(ci): simplify to Rust-only prebuilt [EPIC-005]
- `.github/workflows/release.yml` 已移除 `build-node` job

**AC 达成情况**:
- ✅ AC-1: Rust 编译验证（已实现）
- ❌ AC-2: Node pkg 打包（技术不可行，已放弃）
- ✅ AC-3: sha256 生成（已实现，仅针对 Rust binary）

**最终方案**: EPIC-005 采用 Rust-only 预编译 + Node 源码安装的混合模式
