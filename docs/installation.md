# EKET 安装指南

**版本**: v2.19+  
**最后更新**: 2026-05-24


---

## 📥 安装方式

EKET 提供两种安装方式，根据使用场景选择：

| 方式 | 适用人群 | 环境要求 | 安装时间 |
|------|---------|---------|---------|
| **简版安装** | 普通用户 | 仅需 curl/bash | ~30 秒 |
| **研发版安装** | 开发者 | Rust/Node 环境 | ~2-5 分钟 |

---

## 方式 1: 简版安装（推荐）

### 一键安装

```bash
curl -fsSL https://github.com/godlockin/eket/releases/latest/download/install.sh | bash
```

### 安装内容

1. **预编译 binaries**:
   - `eket-rust`（Rust 版，~10 MB，优先使用）
   - `eket-node`（Node.js 版，~50 MB，fallback）

2. **EKET Skills**:
   - 自动安装到 `~/.claude/skills/eket/`
   - Claude Code 中输入 `/eket` 或 "召唤 EKET 团队" 即可使用

### 验证安装

```bash
# 检查 binaries
eket-rust --version
eket-node --version

# 环境诊断
eket doctor

# 检查 skills
ls ~/.claude/skills/eket/SKILL.md
```

### 支持的平台

| 平台 | 架构 | 状态 |
|------|------|------|
| Linux | x86_64 (amd64) | ✅ 支持 |
| macOS | x86_64 (Intel) | ✅ 支持 |
| macOS | arm64 (Apple Silicon) | ✅ 支持 |
| Windows | WSL2 | ✅ 支持 |
| Windows | 原生 | ❌ 计划中 |

---

## 方式 2: 研发版安装（开发者）

### 前置要求

- **Rust**: ≥ 1.70（可选，编译 Rust 版）
- **Node.js**: ≥ 18（可选，编译 Node 版）
- **Git**: 任意版本

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/godlockin/eket.git
cd eket

# 2. 运行研发版安装脚本
bash scripts/dev-install.sh
```

### 安装内容

- 本地编译 Rust 版（`cargo build --release`）
- 本地编译 Node 版（`npm install && npm run build`）
- 符号链接到 `~/.local/bin/`
- 自动安装 skills

### 优点

- ✅ 可修改源码并立即生效
- ✅ 适合贡献代码
- ✅ 支持调试和性能分析

---

## 故障排查

### 问题 1: "curl: command not found"

**解决**:
```bash
# macOS
xcode-select --install

# Linux (Debian/Ubuntu)
sudo apt install curl

# Linux (RedHat/CentOS)
sudo yum install curl
```

### 问题 2: "Permission denied" 安装 binaries

**原因**: 写入 `/usr/local/bin/` 需要 sudo

**解决**:
- 简版 install.sh 会自动使用 `sudo mv`
- 如无 sudo 权限，修改脚本安装到 `~/.local/bin/`

### 问题 3: "Platform not supported"

**原因**: 不支持的操作系统或架构

**解决**:
- 检查平台: `uname -s && uname -m`
- 仅支持: Linux x64 / macOS x64 / macOS arm64
- Windows 用户请使用 WSL2

### 问题 4: SHA256 校验失败

**原因**: 下载文件被篡改或传输错误

**解决**:
```bash
# 重新下载
rm -f /tmp/eket-*
curl -fsSL <url>/install.sh | bash

# 或手动下载验证
curl -fsSL <url>/eket-rust-linux-amd64 -o /tmp/eket
curl -fsSL <url>/eket-rust-linux-amd64.sha256 -o /tmp/eket.sha256
sha256sum -c /tmp/eket.sha256
```

### 问题 5: Skills 未安装

**检查**:
```bash
ls -la ~/.claude/skills/eket/

# 如不存在，手动安装
curl -fsSL <release-url>/eket-skills.tar.gz | tar -xz -C ~/.claude/skills/
```

---

## 卸载

### 删除 binaries

```bash
sudo rm /usr/local/bin/eket-rust
sudo rm /usr/local/bin/eket-node
# 或
rm ~/.local/bin/eket-*
```

### 删除 skills

```bash
rm -rf ~/.claude/skills/eket/
```

### 删除配置（可选）

```bash
rm -rf ~/.eket/
```

---

## 升级

重新运行安装脚本即可覆盖旧版本：

```bash
curl -fsSL https://github.com/godlockin/eket/releases/latest/download/install.sh | bash
```

---

## 常见问题

**Q: 为什么有 Rust 和 Node 两个版本？**  
A: Rust 版更轻量（~10 MB）性能更好，Node 版作为 fallback。简版 install.sh 优先安装 Rust 版。

**Q: Skills 是什么？**  
A: Claude Code / MCP 的扩展文件，安装后可在 Claude 中输入 `/eket` 或 "召唤 EKET 团队" 启动框架。

**Q: 研发版和简版有什么区别？**  
A: 
- 简版：下载预编译包（快速，无需编译环境）
- 研发版：本地编译（可修改源码，适合开发者）
- 最终效果相同：都安装 binaries + skills

---

**维护者**: EKET Framework Team  
**更新频率**: 每次大版本更新时同步
