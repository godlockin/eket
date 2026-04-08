# Level 1 Shell 脚本修复建议

**生成时间**: 2026-04-08
**相关报告**: [LEVEL1-SHELL-VALIDATION-REPORT.md](./LEVEL1-SHELL-VALIDATION-REPORT.md)

---

## 🔧 需要立即修复的问题 (P1)

### 1. cleanup-idle-agents.sh 路径拼写错误

**文件**: `scripts/cleanup-idle-agents.sh`
**行号**: 26
**当前代码**:
```bash
REGISTRY_FILE="$PROJECT_ROOT/.ەک/state/agent_registry.yml"
```

**问题**: 路径使用了 `.ەک/` (阿拉伯字符) 而非 `.eket/`

**修复**:
```bash
REGISTRY_FILE="$PROJECT_ROOT/.eket/state/agent_registry.yml"
```

**影响**: 🔴 **高** - 导致注册表文件路径错误，影响动态 Agent 清理功能

**修复命令**:
```bash
# 使用 Edit 工具修复
# old_string: REGISTRY_FILE="$PROJECT_ROOT/.ەک/state/agent_registry.yml"
# new_string: REGISTRY_FILE="$PROJECT_ROOT/.eket/state/agent_registry.yml"
```

---

### 2. 缺失执行权限的脚本

**文件**:
- `scripts/start-web-dashboard.sh` (当前权限: `644`)
- `scripts/update-version.sh` (当前权限: `644`)

**问题**: 无法直接执行

**修复命令**:
```bash
chmod +x scripts/start-web-dashboard.sh
chmod +x scripts/update-version.sh
```

**影响**: 🟡 **中** - 非核心脚本，但影响开发体验

**验证**:
```bash
ls -lh scripts/start-web-dashboard.sh scripts/update-version.sh
# 应显示: -rwxr-xr-x
```

---

## 📝 建议改进项 (P2)

### 1. hybrid-adapter.sh 错误处理策略注释

**文件**: `lib/adapters/hybrid-adapter.sh`
**行号**: 15

**当前代码**:
```bash
set -e
```

**建议**: 添加注释说明设计意图

**改进后**:
```bash
# 使用 set -e 严格模式，作为基础设施层需要快速失败（fail-fast）
# 与其他用户交互脚本的容错策略不同，这是有意设计
set -e
```

**影响**: 🟢 **低** - 提升代码可读性和可维护性

---

### 2. 统一参数解析方式

**影响范围**: 多个脚本

**现状**:
- `eket-start.sh`: 使用 `getopts` ✅
- 其他脚本: 使用位置参数 `$1`, `$2`

**建议**: 对于需要多个参数的脚本，统一使用 `getopts`

**示例重构** (`cleanup-idle-agents.sh`):

**当前**:
```bash
TIMEOUT=${1:-600}
DRY_RUN=${2:-false}
```

**建议**:
```bash
TIMEOUT=600
DRY_RUN=false

while getopts "t:dh" opt; do
    case $opt in
        t) TIMEOUT="$OPTARG" ;;
        d) DRY_RUN=true ;;
        h)
            echo "用法: $0 [-t timeout] [-d]"
            echo "  -t  超时阈值（秒，默认 600）"
            echo "  -d  启用干燥运行模式"
            exit 0
            ;;
    esac
done
```

**影响**: 🟢 **低** - 改进用户体验，非阻断性

---

## 🧪 测试建议 (P3)

### 引入 Bats 测试框架

**安装**:
```bash
brew install bats-core
```

**创建测试目录结构**:
```bash
mkdir -p tests/shell
```

**示例测试文件** (`tests/shell/test_eket_start.bats`):
```bash
#!/usr/bin/env bats

setup() {
    export SCRIPT_PATH="./scripts/eket-start.sh"
}

@test "eket-start.sh exists" {
    [ -f "$SCRIPT_PATH" ]
}

@test "eket-start.sh is executable" {
    [ -x "$SCRIPT_PATH" ]
}

@test "eket-start.sh has correct shebang" {
    run head -1 "$SCRIPT_PATH"
    [[ "$output" == "#!/bin/bash" ]]
}

@test "eket-start.sh --help shows usage" {
    run bash "$SCRIPT_PATH" -h
    [ "$status" -eq 0 ]
    [[ "$output" =~ "用法" ]]
}

@test "eket-start.sh creates .eket directory" {
    # Mock test - requires sandbox environment
    skip "需要隔离环境"
}
```

**运行测试**:
```bash
cd tests/shell
bats test_eket_start.bats
```

---

## 📋 修复清单

### 立即执行（今天）

- [ ] 修复 `cleanup-idle-agents.sh` 路径拼写
- [ ] 添加执行权限到 `start-web-dashboard.sh`
- [ ] 添加执行权限到 `update-version.sh`
- [ ] 验证修复后脚本可执行

### 本周完成

- [ ] 为 `hybrid-adapter.sh` 添加 `set -e` 注释
- [ ] 审查所有脚本参数解析方式
- [ ] 统一复杂脚本使用 `getopts`

### 本月完成

- [ ] 引入 Bats 测试框架
- [ ] 编写 P0 脚本的自动化测试
- [ ] 建立 CI/CD 自动化验证流程

---

## 🚀 快速修复脚本

创建 `scripts/apply-validation-fixes.sh`:

```bash
#!/bin/bash
# 应用 Level 1 Shell 脚本验证修复

set -e

echo "=== 应用 Level 1 Shell 脚本修复 ==="
echo ""

# 1. 修复 cleanup-idle-agents.sh 路径拼写
echo "[1/3] 修复 cleanup-idle-agents.sh 路径拼写..."
sed -i.bak 's|\.ەک/|.eket/|g' scripts/cleanup-idle-agents.sh
rm -f scripts/cleanup-idle-agents.sh.bak
echo "✓ 已修复"
echo ""

# 2. 添加执行权限
echo "[2/3] 添加执行权限..."
chmod +x scripts/start-web-dashboard.sh
chmod +x scripts/update-version.sh
echo "✓ 已添加"
echo ""

# 3. 验证
echo "[3/3] 验证修复..."
if grep -q "\.eket/state/agent_registry\.yml" scripts/cleanup-idle-agents.sh; then
    echo "✓ cleanup-idle-agents.sh 路径正确"
else
    echo "✗ cleanup-idle-agents.sh 路径仍有问题"
    exit 1
fi

if [ -x scripts/start-web-dashboard.sh ] && [ -x scripts/update-version.sh ]; then
    echo "✓ 执行权限已正确设置"
else
    echo "✗ 执行权限设置失败"
    exit 1
fi

echo ""
echo "=== 所有修复已成功应用 ==="
echo ""
echo "建议:"
echo "  1. 运行 'git diff' 查看更改"
echo "  2. 测试修复后的脚本"
echo "  3. 提交更改: git add scripts/ && git commit -m 'fix: 修复 Level 1 Shell 脚本问题'"
```

**使用方法**:
```bash
bash scripts/apply-validation-fixes.sh
```

---

## 📊 预期影响

| 修复项 | 影响范围 | 风险等级 | 预计耗时 |
|--------|----------|----------|----------|
| 路径拼写修复 | `cleanup-idle-agents.sh` | 🟢 低 | 2 分钟 |
| 执行权限修复 | 2 个脚本 | 🟢 低 | 1 分钟 |
| 添加注释 | `hybrid-adapter.sh` | 🟢 低 | 5 分钟 |
| 统一参数解析 | 多个脚本 | 🟡 中 | 2 小时 |
| 引入 Bats 测试 | 新增测试目录 | 🟡 中 | 4 小时 |

---

**负责人**: 待分配
**优先级**: P1 (路径和权限修复)
**截止时间**: 2026-04-08 (今天)

---

**附录**: [完整验证报告](./LEVEL1-SHELL-VALIDATION-REPORT.md)
