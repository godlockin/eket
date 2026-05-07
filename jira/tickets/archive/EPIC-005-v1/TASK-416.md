# TASK-416: 引导式安装脚本核心逻辑

**EPIC**: EPIC-005  
**Milestone**: M1 - 核心安装流程  
**优先级**: P0  
**预估工时**: 8h  
**状态**: ready  
**依赖**: 无  

---

## 需求描述

实现 `install.sh` 主脚本，包含环境检测、5 级选择菜单、预编译包下载逻辑。

---

## 验收标准（AC）

- **AC-1**: 环境检测功能
  - Given: 机器已安装 Rust 1.76 + Node 20.x
  - When: 运行 `bash install.sh`
  - Then: 输出显示 `✅ Rust 1.76.0` / `✅ Node.js 20.11.0` / `✅ Bash 5.2`

- **AC-2**: 5 级选择菜单
  - Given: 环境检测完成
  - When: 显示菜单
  - Then: 
    - 菜单包含 5 个选项（完整/Rust+Shell/Node+Shell/Shell/本地编译）
    - 根据检测结果自动推荐（有 Rust+Node 推荐 [1]）
    - 用户输入 1-5 后继续流程

- **AC-3**: 预编译包下载
  - Given: 用户选择 [1] 完整安装
  - When: 脚本执行下载
  - Then:
    - 自动检测平台（linux-amd64 / darwin-arm64 等）
    - 从 GitHub Releases 下载对应包（`eket-rust-*` / `eket-node-*.js`）
    - 调用 `download_with_verify()` 进行 sha256 校验（TASK-417 提供）

- **AC-4**: 错误处理
  - Given: 网络异常或 sha256 校验失败
  - When: 下载失败
  - Then: 显示友好错误提示，询问是否重试或切换到本地编译模式

---

## 技术方案

### 文件结构
```bash
install.sh
├── detect_environment()   # 检测 Rust/Node/Shell 版本
├── show_menu()            # 显示 5 级选择菜单
├── install_rust()         # 下载 Rust 预编译包
├── install_node()         # 下载 Node 预编译包
├── install_shell()        # 安装 Shell 脚本版
└── main()                 # 主流程
```

### 关键函数

#### detect_environment()
```bash
detect_environment() {
  RUST_VERSION=""
  NODE_VERSION=""
  SHELL_TYPE=""
  
  if command -v cargo &>/dev/null; then
    RUST_VERSION=$(cargo --version | awk '{print $2}')
    echo "✅ Rust $RUST_VERSION"
  else
    echo "❌ Rust 未安装"
  fi
  
  if command -v node &>/dev/null; then
    NODE_VERSION=$(node --version | sed 's/v//')
    echo "✅ Node.js $NODE_VERSION"
  else
    echo "❌ Node.js 未安装"
  fi
  
  SHELL_TYPE=$(basename "$SHELL")
  echo "✅ Shell: $SHELL_TYPE"
}
```

#### show_menu()
```bash
show_menu() {
  cat << EOF
┌─────────────────────────────────────────┐
│ EKET 安装向导                            │
├─────────────────────────────────────────┤
│ 检测到环境：                             │
│ $(echo_status Rust)                      │
│ $(echo_status Node)                      │
│ $(echo_status Shell)                     │
│                                          │
│ 选择安装层次：                           │
│ [1] 完整安装（Rust + Node + Shell）★     │
│ [2] Rust + Shell（轻量级）              │
│ [3] Node + Shell（标准版）              │
│ [4] Shell Only（最小化）                │
│ [5] 本地编译模式（开发者）               │
└─────────────────────────────────────────┘
EOF
  
  read -p "请输入选项 [1-5]: " CHOICE
}
```

#### install_rust()
```bash
install_rust() {
  PLATFORM=$(detect_platform)  # 调用 detect_platform()
  URL="https://github.com/godlockin/eket/releases/latest/download/eket-rust-${PLATFORM}"
  DEST="/usr/local/bin/eket-rust"
  
  echo "正在下载 Rust 版 EKET..."
  download_with_verify "$URL" "$DEST" || {
    echo "❌ 下载失败，是否切换到本地编译？[y/N]"
    read -r RETRY
    [[ "$RETRY" == "y" ]] && install_local_build
  }
  
  chmod +x "$DEST"
  echo "✅ Rust 版安装完成: $DEST"
}
```

---

## 实现细节

### 平台检测逻辑
```bash
detect_platform() {
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)
  
  case "$OS" in
    linux)
      case "$ARCH" in
        x86_64) echo "linux-amd64" ;;
        aarch64) echo "linux-arm64" ;;
        *) echo "linux-$ARCH" ;;
      esac
      ;;
    darwin)
      case "$ARCH" in
        arm64) echo "darwin-arm64" ;;
        x86_64) echo "darwin-amd64" ;;
        *) echo "darwin-$ARCH" ;;
      esac
      ;;
    *)
      echo "❌ 不支持的操作系统: $OS"
      exit 1
      ;;
  esac
}
```

### 下载 URL 模板
```
https://github.com/godlockin/eket/releases/latest/download/eket-{engine}-{platform}
例如：
- eket-rust-linux-amd64
- eket-node-darwin-arm64.js
```

---

## 依赖

- **TASK-417**: 提供 `download_with_verify()` 函数（sha256 校验）
- **TASK-418**: 提供 `install_local_build()` 函数（本地编译 fallback）

---

## 测试计划

### 单元测试（手动）
```bash
# 测试环境检测
bash -c 'source install.sh && detect_environment'

# 测试平台检测
bash -c 'source install.sh && detect_platform'

# 测试菜单显示
bash -c 'source install.sh && show_menu'
```

### 集成测试
```bash
# 完整安装流程（需先 mock GitHub Releases）
bash install.sh  # 选择 [1]，验证下载 + 安装
```

---

## 注意事项

1. **权限处理**: `/usr/local/bin/` 需 sudo，提示用户输入密码
2. **退出码**: 所有错误路径返回非 0 退出码
3. **日志输出**: 关键步骤输出日志到 stderr，便于 CI 捕获
4. **向后兼容**: 保留对现有 `scripts/install-eket.sh` 的调用（作为 fallback）

---

## 交付物

- [ ] `install.sh` 文件（repo root）
- [ ] 单元测试脚本 `tests/install-test.sh`
- [ ] 文档更新 `docs/installation.md`

---

**Slaver 领取后**：先阅读 TASK-417/418，了解依赖函数签名，再开始实现。
