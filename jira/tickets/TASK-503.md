# TASK-503: CI 上传 Release assets

**EPIC**: EPIC-005 | **Milestone**: M1 | **优先级**: P0 | **工时**: 2h | **状态**: ready | **依赖**: TASK-502

## 需求
调整 `create-release` job，上传所有编译产物 + install.sh 到 GitHub Release。

## AC
- **AC-1**: assets 清单
  - Given: Release 创建
  - When: 检查 assets
  - Then: 包含所有文件（6 binaries + 6 sha256 + install.sh）

- **AC-2**: 命名规范
  - Given: assets 列表
  - When: 检查文件名
  - Then: 格式统一（`eket-{engine}-{platform}` + `.sha256`）

## 技术方案
```yaml
create-release:
  steps:
    - name: Upload assets
      uses: softprops/action-gh-release@v1
      with:
        files: |
          eket-rust-*
          eket-node-*
          *.sha256
          install.sh
        body: |
          ## 一键安装
          \`\`\`bash
          curl -fsSL https://github.com/godlockin/eket/releases/download/${{ github.ref_name }}/install.sh | bash
          \`\`\`
```

## 交付物
- [ ] `.github/workflows/release.yml` 更新
- [ ] Release 页面验证

## 时限
**2h**
