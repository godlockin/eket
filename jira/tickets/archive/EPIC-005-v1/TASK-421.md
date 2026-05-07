# TASK-421: 统一 asset 命名 + sha256 生成

**EPIC**: EPIC-005 | **Milestone**: M2 | **优先级**: P0 | **工时**: 4h | **状态**: ready | **依赖**: TASK-420

## 需求
调整 `create-release` job，生成 sha256 文件并统一所有 asset 命名规范。

## AC
- **AC-1**: sha256 生成
  - Given: `create-release` job 下载所有 artifacts
  - When: 运行 sha256 生成步骤
  - Then: 每个 binary/js 文件都有对应 `.sha256` 文件

- **AC-2**: 命名规范
  - Given: release assets
  - When: 检查文件名
  - Then: 
    - Rust: `eket-rust-{platform}-{version}`
    - Node: `eket-node-{platform}-{version}.js`
    - sha256: `{filename}.sha256`

## 技术方案
```yaml
# create-release job 修改
create-release:
  needs: [build-node, build-binary]
  steps:
    - name: Download all artifacts
      uses: actions/download-artifact@v4
    
    - name: Generate SHA256
      run: |
        for file in eket-*; do
          sha256sum "$file" > "$file.sha256"
        done
    
    - name: Create Release
      uses: softprops/action-gh-release@v1
      with:
        files: |
          eket-rust-*
          eket-node-*.js
          *.sha256
```

## 交付物
- [ ] `.github/workflows/release.yml` 更新
- [ ] Release 页面验证（所有 assets 有 sha256）
