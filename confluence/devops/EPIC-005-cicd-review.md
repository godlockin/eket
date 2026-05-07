# EPIC-005 CI/CD 评审

**评审人**: DevOps Engineer  
**评审时间**: 2026-05-07  
**评审范围**: GitHub Actions 现状 + 预编译发布 + 安装脚本部署  
**参考文档**: 
- `.github/workflows/release.yml` (207 lines, 8KB)
- `scripts/setup.sh` (489 lines, 已有引导安装逻辑)
- `jira/tickets/EPIC-005/requirement-analysis.md`

---

## 1. 现有 Workflow 分析

### 1.1 已有 Job 清单

| Job | 功能 | 运行平台 | 产出 | 耗时预估 |
|-----|------|---------|------|---------|
| `publish-pypi` | PyPI 发布 | ubuntu-latest | Python SDK | ~2 min |
| `publish-npm` | npm 发布 | ubuntu-latest | JS SDK | ~3 min |
| `build-binary` | Rust 跨平台编译 | matrix (3 平台) | 3 个 binary | ~5 min/平台 |
| `create-release` | GitHub Release | ubuntu-latest | Release notes + assets | ~1 min |

**总耗时**: ~18 min（并行执行，最长 5 min）  
**并行度**: 3 个 job 并行（publish-pypi / publish-npm / build-binary）

### 1.2 Rust 编译 Matrix 配置

✅ **已覆盖平台**:
```yaml
matrix:
  include:
    - os: ubuntu-latest
      target: x86_64-unknown-linux-gnu
      artifact: eket-linux-x64
    - os: macos-latest
      target: aarch64-apple-darwin
      artifact: eket-macos-arm64
    - os: macos-latest
      target: x86_64-apple-darwin
      artifact: eket-macos-x64
```

**评估**: 
- ✅ 覆盖主流平台（Linux x64 + macOS arm64/x64）
- ❌ **缺失**: Windows binary（需求分析明确 "本轮仅 WSL2"，可接受）
- ✅ artifact 命名规范清晰（`eket-{os}-{arch}`）
- ❌ **问题**: 未生成 sha256 校验文件（需新增）

### 1.3 需新增 Job

**TASK-420 前置工作**:

```yaml
# 新增 Job: build-node
build-node:
  name: Build Node.js standalone (${{ matrix.os }})
  runs-on: ${{ matrix.os }}
  strategy:
    matrix:
      include:
        - os: ubuntu-latest
          artifact: eket-node-linux-x64
        - os: macos-latest
          artifact: eket-node-darwin-x64      # Intel
        - os: macos-14                        # Apple Silicon (GitHub Actions)
          artifact: eket-node-darwin-arm64
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '24'
    - run: cd node && npm ci
    - run: cd node && npm test                # 编译前测试
    - run: npx -y ncc build node/src/index.ts -o standalone
    - name: Create executable
      run: |
        echo "#!/usr/bin/env node" | cat - standalone/index.js > ${{ matrix.artifact }}.js
        chmod +x ${{ matrix.artifact }}.js
    - name: Generate sha256
      run: sha256sum ${{ matrix.artifact }}.js > ${{ matrix.artifact }}.js.sha256
    - uses: actions/upload-artifact@v4
      with:
        name: ${{ matrix.artifact }}
        path: |
          ${{ matrix.artifact }}.js
          ${{ matrix.artifact }}.js.sha256
```

**预估新增 CI 时间**: 
- ncc 打包: ~30s/平台
- Matrix 并行 (3 平台): ~1 min
- 总增加: **~2 min**（并行于 Rust 编译）

---

## 2. Release Asset 规范

### 2.1 当前命名

**Rust binary**:
- ✅ 清晰: `eket-linux-x64`, `eket-macos-arm64`, `eket-macos-x64`
- ❌ **问题**: 无版本号后缀

**Python/JS SDK**:
- ✅ 由 PyPI/npm 自动管理版本

### 2.2 推荐命名规范

统一格式: `eket-{engine}-{os}-{arch}-{version}`

| 类型 | 示例 | 说明 |
|------|------|------|
| Rust binary | `eket-rust-linux-x64-v2.9.1` | 可执行文件 |
| Node standalone | `eket-node-darwin-arm64-v2.9.1.js` | 单文件 JS |
| sha256 | `*.sha256` | 同目录，同名 + `.sha256` 后缀 |

**调整建议**:
```yaml
# .github/workflows/release.yml (L131)
- name: Rename binary
  run: |
    VERSION=${GITHUB_REF_NAME}  # v2.9.1
    cp rust/target/${{ matrix.target }}/release/eket \
       eket-rust-${{ matrix.artifact }}-${VERSION}
```

### 2.3 sha256 生成方式

**现状**: ❌ 未生成

**方案 A**: 每个 asset 单独生成 `.sha256` 文件
```bash
sha256sum eket-rust-linux-x64-v2.9.1 > eket-rust-linux-x64-v2.9.1.sha256
```

**方案 B**: 统一 `checksums.txt`
```bash
sha256sum eket-* > checksums.txt
```

**推荐**: **方案 A**（单文件校验）
- ✅ 下载脚本易于验证（`curl -L asset.sha256 | sha256sum -c`）
- ✅ 部分下载场景友好（只下某个平台）
- ❌ 方案 B 需下载完整 checksums.txt

---

## 3. 安装脚本部署策略

### 3.1 现有 `scripts/setup.sh` 能力

✅ **已实现**:
- 环境检测（Rust/Node/Docker 版本）
- 分层安装（Level 1-4）
- 预编译 binary 下载逻辑（L165-204）
- 本地编译 fallback（L243-287）
- PATH 自动配置（L259-274）

❌ **缺失**（对比 EPIC-005 需求）:
- 引导式菜单（5 级选择）：现有逻辑是 `--level=X` 参数，非交互菜单
- sha256 校验（L193 仅下载，未校验）

### 3.2 安装脚本放置位置评估

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **repo root** (`install.sh`) | 简单（1 个文件），`curl \| bash` 直达 | 需 clone 整个 repo 或依赖 raw.githubusercontent | ⭐⭐ |
| **GitHub Pages** | CDN 加速，自定义域名，专业 | 需配置 Pages + 维护成本高 | ⭐⭐⭐ |
| **raw.githubusercontent.com** | 零配置，天然 CDN，已可用 | 限流风险（60 req/h/IP），无版本控制 | ⭐⭐⭐⭐ |
| **Release Assets** | 与 binary 版本绑定，稳定 | 需每次 release 上传，无"latest"链接 | ⭐⭐⭐ |

**推荐**: **raw.githubusercontent.com + Release Assets 双轨**

1. **主流程**: `curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/install.sh | bash`
   - 永远指向 main 分支最新版本
   - 脚本内自动下载 latest release assets

2. **版本锁定**: `curl -fsSL https://github.com/godlockin/eket/releases/download/v2.9.1/install.sh | bash`
   - 每次 release 将 `install.sh` 作为 asset 上传
   - 用户可锁定特定版本

### 3.3 安全性评估

#### 3.3.1 curl 下载安全

**现有问题** (`setup.sh` L193):
```bash
curl -fsSL "$download_url" -o "$tmp_bin" 2>/dev/null
# ❌ 未校验 sha256
```

**修复方案**:
```bash
download_with_verify() {
  local url=$1 dest=$2
  curl -fsSL "$url" -o "$dest" || return 1
  curl -fsSL "$url.sha256" -o "$dest.sha256" || return 1
  
  # 平台兼容（macOS / Linux sha256sum 差异）
  if command -v sha256sum >/dev/null; then
    echo "$(cat $dest.sha256)  $dest" | sha256sum -c -
  elif command -v shasum >/dev/null; then
    echo "$(cat $dest.sha256)  $dest" | shasum -a 256 -c -
  else
    echo "⚠️  警告: 无 sha256 校验工具，跳过验证"
    return 0
  fi
}
```

#### 3.3.2 HTTPS 强制

✅ 已使用 `https://`（L167, L185）  
✅ curl 参数 `-f` 会在 HTTP 错误时失败

#### 3.3.3 代码签名（未来）

❌ **不在本轮范围**（Phase 2）
- macOS: `codesign` + notarization
- Linux: GPG 签名

### 3.4 离线安装场景

**场景**: 企业内网 / 防火墙环境

**现有支持**:
```bash
# setup.sh L244-248
if [ -d "rust/" ] && command -v cargo; then
  cd rust && cargo build --release
  # 本地编译，无需网络
fi
```

**优化建议** (TASK-421):
```bash
# 支持离线包
# 1. 用户提前下载 eket-offline-v2.9.1.tar.gz
# 2. 解压后运行 install.sh --offline
```

---

## 4. 待办事项

### 4.1 TASK-420 前置工作

- [ ] **配置 ncc 依赖**: 
  ```bash
  cd node && npm install -D @vercel/ncc
  # 或使用 npx（无需本地安装）
  ```
- [ ] **测试 ncc 打包**:
  ```bash
  npx @vercel/ncc build node/src/index.ts -o standalone
  du -sh standalone/index.js  # 预估体积
  node standalone/index.js system:doctor  # 验证可执行
  ```
  **预期体积**: 5-15 MB（含 node_modules）

- [ ] **验证动态 require** (U-5):
  - 检查 `better-sqlite3` 等 native 模块是否可正常打包
  - ncc 对动态 require（如 `require(configPath)`）支持有限，需测试

### 4.2 TASK-421 Workflow 模板草稿

**新增 step** (基于 §2.3):
```yaml
# build-binary job 末尾新增
- name: Generate sha256 for binary
  run: sha256sum ${{ matrix.artifact }} > ${{ matrix.artifact }}.sha256

# build-node job 末尾新增
- name: Generate sha256 for Node
  run: sha256sum ${{ matrix.artifact }}.js > ${{ matrix.artifact }}.js.sha256

# create-release job 修改
- name: Create GitHub Release
  uses: softprops/action-gh-release@v2
  with:
    files: |
      artifacts/**/*
      install.sh  # 新增：安装脚本作为 asset
```

### 4.3 TASK-422 测试环境准备

**测试矩阵**:
| 平台 | 测试点 | 验收标准 |
|------|--------|---------|
| Ubuntu 22.04 | ncc 打包 + sha256 | 产物 < 20MB，校验通过 |
| macOS 13 (Intel) | 同上 | 产物 < 20MB，校验通过 |
| macOS 14 (M1) | 同上 | 产物 < 20MB，校验通过 |
| WSL2 (Ubuntu) | curl \| bash 安装 | eket --version 输出正确 |

**GitHub Actions 测试**:
```yaml
# 测试 workflow（不发布）
name: Test Build
on: pull_request
jobs:
  test-node-build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, macos-14]
    steps:
      - uses: actions/checkout@v4
      - run: npx @vercel/ncc build node/src/index.ts -o standalone
      - run: du -sh standalone/index.js
      - run: node standalone/index.js system:doctor
```

---

## 5. 风险与建议

### 5.1 已识别风险

| 风险 | 严重性 | 缓解措施 |
|------|--------|---------|
| **ncc 打包体积过大** (>50MB) | P2 | Phase 1 先测试，超标时拆分 dependencies 或用 esbuild |
| **better-sqlite3 native 模块** | P1 | ncc 不支持 native 模块，需改用 `--external better-sqlite3` + 运行时安装 |
| **sha256 平台差异** (macOS/Linux) | P3 | 脚本兼容 `sha256sum` / `shasum -a 256` |
| **GitHub raw.githubusercontent 限流** | P2 | 文档提示企业用户自建镜像 |
| **安装脚本执行权限** | P3 | GitHub Release 的 `install.sh` 需 `chmod +x`（下载后） |

### 5.2 P0 安全问题

🔴 **发现**:
```bash
# scripts/setup.sh L193
curl -fsSL "$download_url" -o "$tmp_bin" 2>/dev/null
# ❌ 无 sha256 校验！MITM 攻击风险
```

**修复**: 见 §3.3.1，**必须在 TASK-421 前完成**

### 5.3 优化建议

#### 5.3.1 ncc 替代方案

**问题**: ncc 对 ESM + native 模块支持有限

**备选**:
1. **esbuild**: 更快（~10x），支持 ESM，但需手动处理 native 模块
   ```bash
   npx esbuild node/src/index.ts --bundle --platform=node --outfile=dist/eket.js
   ```

2. **pkg**: 打包 Node.js runtime + 代码为单二进制
   ```bash
   npx pkg node/dist/index.js -t node20-linux-x64,node20-macos-arm64
   # 产物 ~40MB（含 Node runtime）
   ```

**推荐**: Phase 1 先用 **ncc**（成熟，addyosmani 验证），遇问题再切 esbuild

#### 5.3.2 CI 缓存优化

**现状**: Rust 已有 cargo cache（L118-123）  
**新增**: Node ncc cache
```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('node/package-lock.json') }}
```

---

## 6. 总结

### 6.1 现状评分

| 维度 | 评分 | 说明 |
|------|------|------|
| **Workflow 完整度** | ⭐⭐⭐⭐ | Rust 编译已完善，缺 Node 预编译 |
| **安全性** | ⭐⭐ | ❌ sha256 校验缺失（P0），HTTPS ✅ |
| **可维护性** | ⭐⭐⭐⭐⭐ | Matrix 清晰，职责分离 |
| **用户体验** | ⭐⭐⭐ | setup.sh 可用，但缺交互菜单 |

### 6.2 关键交付物

**TASK-420** (Node 预编译):
- [ ] ncc 打包脚本
- [ ] GitHub Actions job
- [ ] 体积 < 20MB 验证

**TASK-421** (安装脚本):
- [ ] sha256 校验逻辑（P0 安全）
- [ ] 引导式菜单（5 级选择）
- [ ] install.sh 作为 Release asset

**TASK-422** (跨平台测试):
- [ ] 3 平台 CI matrix
- [ ] WSL2 手动验证

### 6.3 预估时间

| 任务 | 预估 | 依据 |
|------|------|------|
| TASK-420 | 3-4h | ncc 配置 (1h) + workflow 编写 (1h) + 测试 (2h) |
| TASK-421 | 4-5h | sha256 逻辑 (2h) + 菜单重构 (2h) + asset 上传 (1h) |
| TASK-422 | 2-3h | CI matrix (1h) + 手动测试 (2h) |
| **总计** | **9-12h** | 对齐需求分析预估（M2: 1 天） |

---

**评审结论**: 
- ✅ 技术方案可行，现有 workflow 基础良好
- 🔴 **P0 修复**: sha256 校验必须在 TASK-420 前完成
- ⚠️ **关注点**: ncc 打包 better-sqlite3 兼容性，建议 TASK-420 优先验证
- 📋 **建议**: Phase 1 聚焦 Node 预编译 + 安全加固，Rust 版本已稳定可直接使用

**下一步**: Master 审核本评审 → 拆分 TASK-420/421/422 → 分配 Slaver
