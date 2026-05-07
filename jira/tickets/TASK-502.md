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
- [x] `scripts/install-template.sh` 模板文件（含平台检测 + sha256 校验 + skills 安装）
- [x] `.github/workflows/release.yml` 更新（3 个新步骤：skills 打包 + 变量注入 + release 文件列表）
- [x] 本地测试通过（envsubst 替换 + 语法检查 + tarball 验证）
- [ ] CI 测试（推送 test tag 验证）
- [ ] PR 描述

---

## 实施细节（Slaver A 填写）

### 领取信息
- **领取时间**: 2026-05-07 14:15
- **执行人**: Slaver A (DevOps Engineer)
- **预计完成**: 2026-05-07 22:15（8h）

### 分析报告

**依赖梳理**:
- ✅ TASK-501: `eket-{rust|node}-{platform}` 二进制已生成
- ✅ TASK-506: `scripts/lib/install-skills.sh` 逻辑可复用（嵌入模板）
- ✅ `.claude/skills/eket/` 目录结构完整（含 experts/references）

**关键设计决策**:
1. **占位符格式**: `{{VAR}}` → CI 用 `sed + envsubst` 两步转换
2. **二进制命名映射**:
   - Rust: `eket-{linux-x64, macos-arm64, macos-x64}`
   - Node: `eket-node-{linux-amd64, darwin-arm64, darwin-amd64}`
   - 模板需处理命名差异
3. **Skills 安装**: 下载 tarball 解压（简版），避免依赖 lib/install-skills.sh
4. **SHA256 硬编码**: 6 个平台 × 2 引擎 = 12 个变量注入

**风险缓解**:
- 变量非空校验（exit 1）
- sha256sum/shasum 兼容性处理（macOS 无 sha256sum）
- tarball 解压后验证 SKILL.md 存在

### 测试结果

#### 1. 本地变量替换测试
```bash
# 模拟 CI 环境
export VERSION="v2.9.1-test-502"
export RUST_LINUX_SHA256="abc1234567890def"
# ... 其他变量

sed 's/{{\([^}]*\)}}/\$\1/g' scripts/install-template.sh | envsubst > /tmp/test-install.sh
bash -n /tmp/test-install.sh  # ✅ 语法检查通过
```

**结果**: 
- ✅ VERSION 正确注入: `v2.9.1-test-502`
- ✅ SHA256_MAP 全部替换（6 个占位符）
- ✅ 语法无错误

#### 2. Skills tarball 测试
```bash
tar -czf eket-skills.tar.gz -C .claude/skills eket/
tar -xzf eket-skills.tar.gz -C test-extract/
ls test-extract/eket/SKILL.md  # ✅ 存在
```

**结果**:
- ✅ Tarball 大小: 85 KB
- ✅ 解压后目录结构正确（experts/ + references/ + SKILL.md）

#### 3. YAML 语法校验
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"
```

**结果**: ✅ 无语法错误

#### 4. CI 测试（待执行）
- [ ] 推送 `v2.9.1-test-502` tag
- [ ] 观察 GitHub Actions 运行
- [ ] 检查 Release 产物:
  - install.sh（变量已替换）
  - eket-skills.tar.gz（含 sha256）

### 实现细节

#### 文件清单
1. **scripts/install-template.sh** (207 行)
   - 平台检测（linux/darwin × amd64/arm64）
   - 下载 + sha256 校验（shasum/sha256sum 兼容）
   - Skills 安装（tarball 解压）
   - 主流程（Rust 优先，Node fallback）

2. **.github/workflows/release.yml** 修改（3 处）
   - Line 214-221: `Package skills` 步骤
   - Line 223-252: `Generate install.sh` 步骤（变量注入 + 验证）
   - Line 270-273: 更新 `files` 列表（+install.sh +eket-skills.tar.gz）

#### 关键代码片段

**变量注入逻辑**:
```yaml
# 读取 sha256（提取第一列）
RUST_LINUX_SHA256=$(awk '{print $1}' eket-linux-x64.sha256)

# 变量非空校验
for var in RUST_LINUX_SHA256 ...; do
  [ -z "${!var}" ] && echo "❌ 变量 $var 为空" && exit 1
done

# 占位符转换 + 替换
sed 's/{{\([^}]*\)}}/\$\1/g' scripts/install-template.sh | envsubst > install.sh
```

**二进制命名映射**:
```bash
# Rust: eket-linux-x64 vs 平台标识 linux-amd64
if [[ "$engine" == "rust" ]]; then
  case "$platform" in
    linux-amd64)   filename="eket-linux-x64" ;;
    darwin-arm64)  filename="eket-macos-arm64" ;;
    darwin-amd64)  filename="eket-macos-x64" ;;
  esac
else
  # Node: eket-node-linux-amd64（直接拼接）
  filename="eket-node-${platform}"
fi
```

### 经验沉淀

#### Pitfalls（踩坑）
1. **envsubst 占位符语法**
   - 问题: 模板用 `{{VAR}}`，envsubst 只识别 `$VAR`
   - 解决: `sed 's/{{\([^}]*\)}}/\$\1/g'` 预处理

2. **二进制命名不一致**
   - Rust: `eket-linux-x64`（x64 非 amd64）
   - Node: `eket-node-linux-amd64`
   - 解决: download_and_verify() 内部映射

3. **macOS sha256sum 缺失**
   - 问题: macOS 默认无 sha256sum 命令
   - 解决: `shasum -a 256` fallback

#### Patterns（最佳实践）
1. **变量验证**
   - CI 注入前 `for var in ...; do [ -z "${!var}" ] && exit 1`
   - 避免空占位符流入 install.sh

2. **模板预览**
   - CI 输出 `head -30 install.sh` 验证注入
   - 输出 grep 关键变量（VERSION/SHA256_MAP）

3. **Tarball 验证**
   - 打包后验证 SKILL.md 存在
   - 解压测试避免生产损坏

### 知识沉淀（通用）
无（此任务为 CI 特定实现，无可复用通用知识）

### 待办（下一步）
1. 推送 test tag: `git tag v2.9.1-test-502 && git push origin v2.9.1-test-502`
2. 观察 GitHub Actions: 检查 3 个新步骤是否通过
3. 下载 install.sh 验证:
   ```bash
   curl -fsSL <test-release-url>/install.sh -o /tmp/test.sh
   grep -E "(VERSION=|SHA256_MAP=)" /tmp/test.sh  # 无 {{}} 占位符
   ```
4. 端到端测试:
   ```bash
   bash /tmp/test.sh  # 验证下载 + 校验 + skills 安装
   ```

## 时限
**8h** 内完成
