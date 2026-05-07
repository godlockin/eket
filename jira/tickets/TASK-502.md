# TASK-502: CI 动态生成 install.sh（简版）

**EPIC**: EPIC-005 | **Milestone**: M1 | **优先级**: P0 | **工时**: 8h | **状态**: ready | **依赖**: TASK-501, TASK-506

## 需求
创建 install.sh 模板（`scripts/install-template.sh`），GitHub Actions 注入变量后生成最终 install.sh。

## AC
- **AC-1**: 模板创建
  - Given: 创建 `scripts/install-template.sh`
  - When: 文件包含占位符 `{{VERSION}}` / `{{RUST_LINUX_URL}}` / `{{RUST_LINUX_SHA256}}` 等
  - Then: 模板可被 CI 变量替换

- **AC-2**: CI 变量注入
  - Given: GitHub Actions 运行
  - When: 执行 `envsubst` 或 `sed` 替换变量
  - Then: 生成最终 `install.sh`（所有占位符被替换）

- **AC-3**: 下载 + skills 更新
  - Given: 用户运行生成的 `install.sh`
  - When: 脚本执行
  - Then:
    - 检测平台（linux-amd64 / darwin-arm64 等）
    - 下载对应 binary
    - 校验 sha256（值硬编码）
    - 调用 `install_skills()`（TASK-506 产出）

## 技术方案

### 模板文件（scripts/install-template.sh）
```bash
#!/bin/bash
# EKET 安装脚本（简版 - 下载预编译包）
# 本文件由 GitHub Actions 自动生成，请勿手动修改

VERSION="{{VERSION}}"  # CI 注入，如 v2.9.1

# 硬编码 sha256（CI 注入）
RUST_LINUX_AMD64_SHA256="{{RUST_LINUX_SHA256}}"
RUST_DARWIN_ARM64_SHA256="{{RUST_DARWIN_ARM_SHA256}}"
NODE_LINUX_AMD64_SHA256="{{NODE_LINUX_SHA256}}"
# ... 其他平台

# 下载 URL（CI 注入）
BASE_URL="https://github.com/godlockin/eket/releases/download/${VERSION}"

detect_platform() {
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)
  
  case "$OS-$ARCH" in
    linux-x86_64) echo "linux-amd64" ;;
    darwin-arm64) echo "darwin-arm64" ;;
    darwin-x86_64) echo "darwin-amd64" ;;
    *) echo "unsupported" ;;
  esac
}

download_and_verify() {
  local url=$1
  local dest=$2
  local expected_sha=$3
  
  curl -fsSL "$url" -o "$dest" || return 1
  
  actual_sha=$(sha256sum "$dest" 2>/dev/null || shasum -a 256 "$dest" | awk '{print $1}')
  
  if [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "❌ SHA256 校验失败"
    rm -f "$dest"
    return 1
  fi
  
  echo "✅ 校验通过"
  return 0
}

install_binaries() {
  PLATFORM=$(detect_platform)
  
  # Rust binary
  download_and_verify \
    "${BASE_URL}/eket-rust-${PLATFORM}" \
    "/tmp/eket-rust" \
    "${RUST_${PLATFORM^^}_SHA256}" || exit 1
  
  sudo mv /tmp/eket-rust /usr/local/bin/
  
  # Node binary（类似）
  # ...
}

install_skills() {
  # 调用 TASK-506 产出的 scripts/lib/install-skills.sh
  source "$(dirname "$0")/scripts/lib/install-skills.sh" 2>/dev/null || {
    # fallback: 内嵌 skills 安装逻辑
    curl -fsSL "${BASE_URL}/eket-skills.tar.gz" | tar -xz -C ~/.claude/skills/
  }
}

main() {
  echo "EKET 安装脚本 ${VERSION}"
  install_binaries
  install_skills
  echo "✅ 安装完成！运行 'eket --version' 验证"
}

main
```

### CI 变量注入（release.yml）

```yaml
create-release:
  steps:
    - name: Generate install.sh
      run: |
        # 提取版本号
        VERSION=${GITHUB_REF#refs/tags/}
        
        # 计算 sha256
        RUST_LINUX_SHA256=$(sha256sum eket-rust-linux-amd64 | awk '{print $1}')
        RUST_DARWIN_ARM_SHA256=$(sha256sum eket-rust-darwin-arm64 | awk '{print $1}')
        # ... 其他平台
        
        # 替换模板
        export VERSION RUST_LINUX_SHA256 RUST_DARWIN_ARM_SHA256
        envsubst < scripts/install-template.sh > install.sh
        chmod +x install.sh
    
    - name: Upload install.sh
      uses: softprops/action-gh-release@v1
      with:
        files: install.sh
```

## 交付物
- [ ] `scripts/install-template.sh` 模板文件
- [ ] `.github/workflows/release.yml` 更新（变量注入逻辑）
- [ ] 测试 CI 生成的 install.sh
- [ ] PR 描述

## 时限
**8h** 内完成
