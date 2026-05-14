# TASK-637: Rust CI Pipeline - 跨平台自动编译

**Epic**: EPIC-007  
**Priority**: P2  
**Status**: 📋 Backlog  
**Estimate**: 3h  
**Agent Type**: devops  
**Category**: 🔧 CI/CD  

---

## Goal

配置 GitHub Actions 自动编译 Rust 二进制（Mac + Linux），发布到 Releases。

---

## Acceptance Criteria

**AC-1**: 双平台编译  
- Given: PR 合并到 main
- When: CI workflow 触发
- Then: 生成 `eket-context-monitor-{darwin,linux}-{amd64,arm64}` 四个二进制

**AC-2**: 自动发布  
- Given: Tag push（v*）
- When: Release workflow 触发
- Then: 二进制附加到 GitHub Release

**AC-3**: 构建缓存  
- Given: 连续两次 CI 运行
- When: 第二次运行
- Then: Cargo 依赖缓存命中，构建时间 < 3min

**AC-4**: 校验和  
- Given: 二进制发布
- When: 生成 artifacts
- Then: 同时生成 SHA256SUMS 文件

---

## Implementation Sketch

```yaml
# .github/workflows/rust-build.yml
name: Rust Context Monitor

on:
  push:
    branches: [main, testing]
    tags: ['v*']
  pull_request:
    paths:
      - 'rust/crates/context-mon/**'

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: x86_64-apple-darwin
          - os: macos-latest
            target: aarch64-apple-darwin
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
          - os: ubuntu-latest
            target: aarch64-unknown-linux-gnu
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}
      
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: rust/crates/context-mon
      
      - name: Build
        run: |
          cd rust/crates/context-mon
          cargo build --release --target ${{ matrix.target }}
      
      - name: Rename binary
        run: |
          cp target/${{ matrix.target }}/release/eket-context-monitor \
             eket-context-monitor-${{ matrix.target }}
      
      - name: Generate checksum
        run: |
          sha256sum eket-context-monitor-${{ matrix.target }} > \
            eket-context-monitor-${{ matrix.target }}.sha256
      
      - uses: actions/upload-artifact@v4
        with:
          name: eket-context-monitor-${{ matrix.target }}
          path: |
            eket-context-monitor-${{ matrix.target }}
            eket-context-monitor-${{ matrix.target }}.sha256
  
  release:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: build
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/download-artifact@v4
      
      - uses: softprops/action-gh-release@v1
        with:
          files: |
            eket-context-monitor-*/eket-context-monitor-*
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Observability

**Logs**: CI build logs  
**Metrics**: 
- 构建时间（target: < 5min with cache）
- 二进制大小（target: < 5MB stripped）

---

## Rollback Plan

禁用 workflow 或恢复 Node.js 实现。

---

## Test Strategy

**CI**: 模拟 PR 触发，验证 4 平台编译  
**Release**: 手动 tag push 测试发布流程  
**Cache**: 连续两次 push 验证缓存命中率  

---

**Blocked By**: TASK-636  
**Blocks**: None  
**Created**: 2026-05-14
