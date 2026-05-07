# TASK-151: Rust 安装脚本编译环境检查与降级策略

## 元数据
- **类型**: feature
- **优先级**: P1
- **状态**: done
- **创建**: 2026-04-21
- **依赖**: 无

## 背景

当前 `scripts/setup.sh` 和 `scripts/install-skill.sh` 均未检查 Rust 工具链是否存在。用户运行安装脚本时如果缺少 `rustc`/`cargo`，会得到一个难以理解的编译错误，没有任何引导。

验证确认：
- `setup.sh` 检查 bash/curl/git/node/docker，**无 rustc 检查**
- `install-skill.sh` 只复制文件，**无 Rust 相关逻辑**
- `rust/` 目录无 Makefile/install 脚本

## 验收标准

### 1. `setup.sh` 加入 Rust Level 检测

```bash
# Level 1.5（介于 Shell 和 Node 之间）
check_rust() {
  if command -v cargo &>/dev/null; then
    local ver=$(rustc --version | awk '{print $2}')
    echo_success "Rust $ver 已检测到"
    return 0
  else
    echo_warn "未检测到 Rust 工具链"
    return 1
  fi
}
```

### 2. 三种策略引导

```bash
# 策略 A：自动安装（交互确认）
install_rust_auto() {
  echo "是否自动安装 rustup？[y/N]"
  read answer
  if [[ "$answer" == "y" ]]; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
  fi
}

# 策略 B：降级到 Node.js 层（跳过 Rust 构建）
# 已有 Level 2 Node 实现可用，提示用户降级
fallback_to_node() {
  echo_warn "跳过 Rust 构建，使用 Node.js 层（功能子集）"
  echo "  性能：~1.5s 启动 vs Rust ~21ms"
  echo "  功能：部分命令不可用（见 SKILL.md）"
}

# 策略 C：仅安装 pre-built binary（如有 release artifact）
install_prebuilt() {
  # 从 GitHub Releases 下载对应平台 binary
  # 优先于编译安装
}
```

### 3. `install-skill.sh --update` 加入 Rust 构建步骤

```bash
build_rust_if_available() {
  if check_rust; then
    echo "构建 Rust binary..."
    cd rust && cargo build --release
    cp target/release/eket ~/.local/bin/eket
    echo_success "eket binary 已安装到 ~/.local/bin/eket"
  else
    echo_warn "无 Rust 工具链，跳过 binary 构建"
    echo "  运行 'setup.sh --level=rust' 安装工具链"
  fi
}
```

### 4. SKILL.md 文档更新

Quick Start 加入工具链检查步骤：
```
0. 检查环境：eket system:doctor（若命令不存在则先运行 setup.sh）
```

### 5. 失败降级矩阵

| 情况 | 行为 |
|------|------|
| rustc 存在 | 正常编译安装 |
| rustc 缺失 + 用户同意 | 自动 rustup 安装 |
| rustc 缺失 + 用户拒绝 | 提示 Node 降级路径 |
| 编译失败 | 打印错误 + 建议 `--skip-rust` |
| CI 环境 | 检查 `EKET_SKIP_RUST_BUILD=1` 环境变量 |

## 技术实现要点

- bash 脚本，兼容 macOS/Linux
- 检查 `EKET_SKIP_RUST_BUILD=1` 环境变量用于 CI 跳过
- rustup 安装后自动 `source ~/.cargo/env`
- 检查 `~/.cargo/bin` 是否在 PATH
- pre-built binary 下载：支持 `x86_64-unknown-linux-gnu`、`aarch64-apple-darwin`、`x86_64-apple-darwin`

## 负责人
待认领（推荐：DevOps 工程师 + Rust 工程师）
