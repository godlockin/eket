# Requirement Analysis: EPIC-005

**分析时间**: 2026-05-07
**分析人**: Master
**状态**: draft_pending_expert_panel

---

## 1. 原始诉求（原文引用）

> rust 版和 node 版都需要 github action 预先编译好，安装脚本里默认下载预编译包，除非脚本发现有编译环境 + 代码 + 用户主动要求本地编译
>
> 我心中的一键安装应该是：
> 1. 下载某个脚本
> 2. 运行
> 3. 引导式安装：提示我完整安装（rust/node/shell）还是某个层次安装 -> 这里要校验系统环境，提示用户可以进行完整/某个层次的安装
> 4. 安装完成
> 5. 我打开 claude 或者其他工具，输入 "/eket " 或者通过命令 "召唤 eket 团队" 加载和唤醒 eket 团队

---

## 2. 受益人 × 场景矩阵

| Persona | 触发场景 | 当前痛点（证据） | 期望结果 |
|---------|---------|-----------------|---------|
| **新用户**（无开发环境） | 首次安装 EKET | 需手动 `git clone` + `npm install` + 配置环境变量，失败率高 | 一行命令安装，无需配置 |
| **开发者**（有 Rust/Node） | 本地开发/调试 | 想本地编译但安装脚本不支持 | 可选"本地编译模式" |
| **多项目用户** | 切换项目时唤醒 EKET | 需记住 `/eket-init` + `/eket-start` 等多个命令 | 统一入口 `/eket` 或自然语言 trigger |
| **CI/CD 环境** | 自动化流程集成 | 需安装完整 Node/Rust 工具链，CI 慢 | 下载预编译包，秒级启动 |

---

## 3. 验收标准（Given-When-Then）

**核心验收**：

- **AC-1 (新用户体验)**: 
  - Given: 全新 Linux/macOS 机器，仅有 curl/bash
  - When: 执行 `curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/install.sh | bash`
  - Then: 
    - 显示引导式菜单（5 个选项）
    - 自动下载对应预编译包（Node 或 Rust）
    - 安装完成后 `eket --version` 输出版本号
    - Claude Code 内 `/eket` 命令可用

- **AC-2 (环境检测)**:
  - Given: 机器已安装 Rust 1.76 + Node 20.x
  - When: 运行安装脚本
  - Then: 
    - 检测结果显示 ✅ Rust / ✅ Node / ✅ Shell
    - 提供选项 [1-5]，默认推荐 [1] 完整安装

- **AC-3 (预编译包发布)**:
  - Given: 推送 tag `v2.9.0` 到 GitHub
  - When: GitHub Actions 自动运行
  - Then: 
    - Release 页面出现以下 assets:
      - `eket-node-standalone-v2.9.0.js`
      - `eket-rust-linux-amd64-v2.9.0` (可选，Phase 2)
      - `eket-rust-darwin-arm64-v2.9.0` (可选)
    - 每个 asset < 50MB（压缩后）

- **AC-4 (本地编译 fallback)**:
  - Given: 用户选择 [5] 本地编译模式
  - When: 检测到 `node/` 源码 + npm
  - Then: 
    - 运行 `npm install && npm run build`
    - 创建符号链接 `eket -> node/dist/index.js`
    - 安装成功提示

- **AC-5 (Claude 唤醒)**:
  - Given: 已安装 EKET
  - When: 在 Claude Code 内输入 `/eket` 或 "召唤 EKET 团队"
  - Then:
    - 输出 EKET 系统状态（role / 当前 ticket / 可用命令）
    - 自动加载 `.claude/skills/eket/` skill

- **AC-6 (跨平台支持)**:
  - Given: Linux (amd64) / macOS (arm64/amd64) / Windows (WSL2)
  - When: 运行安装脚本
  - Then: 自动检测架构并下载对应预编译包

---

## 4. 非目标（Out of Scope）

- ❌ Windows 原生支持（本轮仅支持 WSL2）
- ❌ Docker 镜像打包（Phase 3）
- ❌ Homebrew / apt / yum 包管理器集成（Phase 4）
- ❌ GUI 安装向导（CLI only）
- ❌ 自动升级机制（本轮手动 `curl | bash` 覆盖安装）
- ❌ Rust 版完整功能对齐（可作 opt-in，非硬性要求）

---

## 5. 未知与假设

| ID | 类型 | 内容 | 阻塞级别 | 解除方式 |
|----|------|------|---------|---------|
| **U-1** | 未知 | Node 版打包后体积（ncc + node_modules） | P1 | 先跑一次 `ncc build` 测量 |
| **U-2** | 未知 | Rust 跨平台编译需要哪些 target（musl vs glibc） | P2 | 调研 `cross-rs` 或 GitHub Actions matrix |
| **U-3** | 未知 | Claude Code 是否支持通过自然语言触发命令 | P0 | 查阅文档或测试 |
| **A-1** | 假设 | 用户有网络访问 GitHub Releases | P1 | 提供离线包备用方案（Phase 2） |
| **A-2** | 假设 | Rust 版核心可在 2-3 周内完成 | P2 | Phase 1 先做 Node 预编译，Rust 并行开发 |
| **A-3** | 假设 | 预编译包可直接运行（无额外依赖） | P1 | ncc 打包时 bundle 所有 dependencies |

---

## 6. 风险与缓解

| 风险 | 可能性 H/M/L | 影响 H/M/L | 缓解策略 |
|------|-------------|-----------|---------|
| **Rust 版工作量爆炸** | H | M | **Phase 拆分**：Phase 1 仅 Node 预编译 + 引导安装；Rust 作 Phase 2 opt-in |
| **GitHub Actions 编译超时**（免费额度） | M | L | 使用 cache + 分阶段编译（先 Node 后 Rust） |
| **预编译包在旧系统无法运行**（glibc 版本） | M | M | Rust 用 `musl` target；Node 打包时指定 `--target=node16`（兼容性） |
| **安装脚本被防火墙拦截** | L | M | 提供 GitHub Pages 镜像 + 离线包下载 |
| **"/eket" 命令与已有命令冲突** | L | L | 向后兼容保留 `/eket-*` 系列，新命令作可选 alias |
| **"召唤 EKET 团队" 无法实现**（Claude 限制） | M | L | 降级为仅支持 `/eket`，文档说明 |

---

## 7. 技术方案草案（待架构师评审）

### 7.1 引导式安装脚本架构

```bash
# install.sh (主脚本)
├── detect_environment()      # 检测 Rust/Node/Shell 版本
├── show_menu()               # 显示 5 级选择菜单
├── download_prebuilt()       # 从 GitHub Releases 下载
│   ├── get_latest_version()
│   ├── detect_platform()     # Linux/macOS/Windows (WSL)
│   └── download_asset()      # curl + 校验 sha256
├── install_local_build()     # 本地编译模式 (fallback)
├── register_claude_command() # 写入 ~/.claude/commands/eket.sh
└── post_install()            # 提示 + 验证
```

### 7.2 GitHub Actions Workflow

```yaml
# .github/workflows/release.yml
name: Build and Release

on:
  push:
    tags: ['v*']

jobs:
  build-node:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - run: npm install && npm run bundle  # ncc build
      - run: chmod +x dist/eket-standalone.js
      - uses: actions/upload-release-asset@v1
        with:
          asset_name: eket-node-${{ matrix.os }}.js

  build-rust: # Optional Phase 2
    strategy:
      matrix:
        target: [x86_64-unknown-linux-musl, aarch64-apple-darwin]
    steps:
      - uses: actions-rs/toolchain@v1
      - run: cargo build --release --target ${{ matrix.target }}
      - uses: actions/upload-release-asset@v1
```

### 7.3 预编译包目录结构

```
GitHub Release v2.9.0:
├── eket-node-linux-amd64-v2.9.0.js         (Node 单文件)
├── eket-node-linux-amd64-v2.9.0.js.sha256
├── eket-node-darwin-arm64-v2.9.0.js        (macOS Apple Silicon)
├── eket-node-darwin-arm64-v2.9.0.js.sha256
├── eket-rust-linux-amd64-v2.9.0            (可选 Phase 2)
├── eket-rust-linux-amd64-v2.9.0.sha256
└── install.sh                              (安装脚本本身)
```

### 7.4 Claude 命令注册机制

```bash
# ~/.claude/commands/eket.sh (自动生成)
#!/bin/bash
EKET_BIN=$(which eket || echo "/usr/local/bin/eket")
$EKET_BIN "$@"

# 触发器别名（如果 Claude 支持）
# alias "召唤 EKET 团队"="eket team:summon"
```

---

## 8. 开放问题（需 Expert Panel 回答）

| ID | 问题 | 需要角色 | 紧急度 |
|----|------|---------|-------|
| **Q-1** | Claude Code 是否支持自然语言命令触发（"召唤 X"）？ | 前端/CLI 专家 | P0 |
| **Q-2** | Rust 版是否必须在 Phase 1 交付，还是可作 opt-in？ | 架构师 + 产品 | P0 |
| **Q-3** | 预编译包如何处理平台差异（glibc vs musl）？ | DevOps | P1 |
| **Q-4** | 安装脚本如何验证下载包完整性（签名 vs sha256）？ | 安全专家 | P1 |
| **Q-5** | ncc 打包后的 bundle 是否会丢失某些动态 require？ | Node.js 专家 | P2 |
| **Q-6** | 是否需要支持 Windows 原生（非 WSL）？ | 产品 | P2 |

---

## 9. 下一步

- [ ] **召唤专家组**：至少 3 人（架构师 + DevOps + 前端/CLI）
- [ ] **解答开放问题 Q-1 ~ Q-6**
- [ ] **细化 AC**（每条必须可执行验证）
- [ ] **拆分 Milestone + Ticket**（INVEST 校验）
- [ ] **绘制依赖图**（Mermaid）
- [ ] **Master Review** → 状态改为 `ready_for_planning`

---

**当前状态**: `draft_pending_expert_panel`  
**阻塞项**: 需解答 Q-1 (Claude 自然语言触发) 和 Q-2 (Rust 优先级)
# EPIC-005 需求分析更新（人类反馈后）

**更新时间**: 2026-05-07 12:30
**状态**: ready_for_expert_panel

---

## 人类反馈摘要

### 已确认决策

| 问题 | 决策 | 影响 |
|------|------|------|
| **Q-1** | 方案 C（`/eket` + skill 间接触发） | 两种唤醒方式并存 |
| **Q-2** | **Rust 代码已存在** + GHA 已有编译 | 工作量从 2-3 周降至 3-5 天 |
| **Q-3** | Rust 用 musl，Node 通用 target | 跨平台兼容性 |
| **Q-4** | sha256 校验 | 安全性基础保障 |
| **Q-5** | ncc 动态 require 问题先测试 | 迭代调整 |
| **Q-6** | 本轮仅 WSL2 | Windows 原生留 Phase 2 |

### 关键发现

✅ **Rust 代码已存在**：
- 位置：`rust/crates/*`（4 个 crate: core/engine/cli/server）
- GitHub Actions：`.github/workflows/release.yml` 已配置跨平台编译
- Matrix target：已支持 Linux/macOS/Windows

✅ **工作量大幅降低**：
- 原预估：2-3 周（从零开发 Rust 核心）
- 新预估：3-5 天（调整 workflow + 引导安装脚本）

---

## 更新后的技术方案

### 1. GitHub Actions 调整（最小化）

**现状**：`.github/workflows/release.yml` 已有 Rust 编译
**需调整**：
- 增加 Node.js 预编译 job（ncc bundle）
- 统一 asset 命名规范（`eket-{engine}-{os}-{arch}-{version}`）
- 增加 sha256 生成步骤

**修改点**：
```yaml
jobs:
  build-node:  # 新增
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, macos-14]  # macos-14 = Apple Silicon
    steps:
      - run: cd node && npm install && npx ncc build src/index.ts -o standalone
      - run: echo "#!/usr/bin/env node" | cat - standalone/index.js > eket-node-${{ matrix.os }}
      - run: sha256sum eket-node-${{ matrix.os }} > eket-node-${{ matrix.os }}.sha256

  build-binary:  # 已有，微调
    # 保持现有 Rust 编译逻辑
    # 新增 sha256 生成
```

### 2. 引导式安装脚本架构

```bash
# install.sh (新文件)
main() {
  detect_environment    # 检测 Rust/Node/Shell 版本
  show_menu             # 显示 5 级选择菜单
  case $USER_CHOICE in
    1) install_rust && install_node && install_shell ;;
    2) install_rust && install_shell ;;
    3) install_node && install_shell ;;
    4) install_shell ;;
    5) install_local_build ;;  # 本地编译模式
  esac
  register_claude_command
  post_install
}

install_rust() {
  PLATFORM=$(detect_platform)  # linux-amd64 / darwin-arm64 等
  download_with_verify \
    "https://github.com/godlockin/eket/releases/latest/download/eket-rust-${PLATFORM}" \
    "/usr/local/bin/eket-rust"
}

install_node() {
  download_with_verify \
    "https://github.com/godlockin/eket/releases/latest/download/eket-node-${PLATFORM}.js" \
    "/usr/local/bin/eket-node"
  chmod +x /usr/local/bin/eket-node
}

install_local_build() {
  if [ -d "rust/" ] && command -v cargo; then
    cd rust && cargo build --release
    ln -sf $(pwd)/target/release/eket /usr/local/bin/eket-rust
  fi
  if [ -d "node/" ] && command -v npm; then
    cd node && npm install && npm run build
    ln -sf $(pwd)/dist/index.js /usr/local/bin/eket-node
  fi
}

download_with_verify() {
  URL=$1
  DEST=$2
  curl -fsSL $URL -o $DEST
  curl -fsSL $URL.sha256 -o $DEST.sha256
  echo "$(cat $DEST.sha256) $DEST" | sha256sum -c || {
    echo "❌ 校验失败，删除下载文件"
    rm -f $DEST $DEST.sha256
    exit 1
  }
}
```

### 3. Claude 命令注册

```bash
# ~/.claude/commands/eket.sh (自动生成)
#!/bin/bash

# 优先级：rust > node > shell
if command -v eket-rust &>/dev/null; then
  exec eket-rust "$@"
elif command -v eket-node &>/dev/null; then
  exec eket-node "$@"
elif command -v eket &>/dev/null; then
  exec eket "$@"  # shell fallback
else
  echo "❌ EKET 未安装，请运行 install.sh"
  exit 1
fi
```

### 4. Skill 间接触发

```yaml
# .claude/skills/eket/SKILL.md (更新 frontmatter)
---
name: eket
description: |
  EKET AI 智能体协作框架。
  触发关键词：召唤 EKET 团队、启动 eket、eket 团队、多智能体协作
---
```

---

## 更新后的 Milestone 拆分

### Milestone 1: 核心安装流程（3 天）
- TASK-416: 引导式安装脚本（detect + menu + download）
- TASK-417: sha256 校验逻辑
- TASK-418: 本地编译 fallback
- TASK-419: Claude 命令注册脚本

### Milestone 2: GitHub Actions 调整（1 天）
- TASK-420: 增加 Node 预编译 job
- TASK-421: 统一 asset 命名 + sha256 生成
- TASK-422: 测试跨平台编译（Linux/macOS/WSL2）

### Milestone 3: 用户体验优化（1 天）
- TASK-423: Skill description 更新（间接触发）
- TASK-424: 安装后验证脚本（`eket doctor`）
- TASK-425: 文档更新（README + 安装指南）

---

## 验收标准更新

**AC-3 修订**（预编译包发布）：
- Given: 推送 tag `v2.9.1` 到 GitHub
- When: GitHub Actions 自动运行
- Then: 
  - Release 页面出现 assets（**Rust 已有**，Node 新增）:
    - ✅ `eket-rust-linux-amd64`（已有）
    - ✅ `eket-rust-darwin-arm64`- 🆕 `eket-node-darwin-arm64.js`（新增）
    - 🆕 各自对应的 `.sha256` 文件
  - 每个 asset < 50MB

**AC-5 修订**（Claude 唤醒）：
- 方案 C 实现：
  - `/eket` → 直接调用 `~/.claude/commands/eket.sh`
  - "召唤 EKET 团队" → skill description 匹配，Claude 自动推荐

---

## 风险更新

| 风险 | 原评估 | 新评估 | 变化原因 |
|------|--------|--------|---------|
| Rust 版工作量爆炸 | H (2-3 周) | **L (已解除)** | ✅ 代码已存在 |
| GitHub Actions 编译超时 | M | **L** | ✅ 已有 workflow |
| 预编译包旧系统不兼容 | M | **M (不变)** | 需验证 musl target |
| ncc 打包丢失 require | M | **M (不变)** | 待测试 |

---

## 下一步

- [ ] Master 召唤专家组（架构 + DevOps + CLI，≥3 人）
- [ ] 验证现有 release.yml 的 target 配置
- [ ] 测试 ncc 打包（U-1 解除）
- [ ] 拆分 9 个 TASK ticket（M1-M3）
- [ ] 初始化 Slaver 团队

---

**状态**: `ready_for_expert_panel`  
**阻塞项**: 无（所有 P0 问题已解决）
