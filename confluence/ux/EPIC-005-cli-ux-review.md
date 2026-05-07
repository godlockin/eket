# EPIC-005 CLI UX 评审（简化版）

**评审人**: Master（CLI 专家超时，基于需求分析补充）  
**评审时间**: 2026-05-07  
**状态**: simplified（非完整评审）

---

## 1. 环境检测清单

| 检测项 | 命令 | 成功判据 | 失败提示 |
|--------|------|---------|---------|
| Rust | `cargo --version` | exit 0 + version ≥ 1.70 | "未安装 Rust，推荐选择 [3] Node + Shell" |
| Node | `node --version` | exit 0 + version ≥ 18 | "未安装 Node.js，推荐选择 [2] Rust + Shell" |
| Shell | `echo $SHELL` | bash/zsh | "不支持的 shell: $SHELL" |

---

## 2. 菜单交互流程（基于需求）

```
┌─────────────────────────────────────────┐
│ EKET 安装向导                            │
├─────────────────────────────────────────┤
│ 检测到环境：                             │
│   ✅ Rust 1.76.0                        │
│   ✅ Node.js 20.11.0                    │
│   ✅ Bash 5.2                           │
│                                          │
│ 选择安装层次：                           │
│ [1] 完整安装（Rust + Node + Shell）★    │
│ [2] Rust + Shell（轻量级，~10 MB）      │
│ [3] Node + Shell（标准版，~50 MB）      │
│ [4] Shell Only（最小化）                │
│ [5] 本地编译模式（开发者）               │
│                                          │
│ 请输入选项 [1-5]: _                     │
└─────────────────────────────────────────┘
```

**推荐逻辑**:
- 有 Rust + Node → 推荐 [1]
- 仅 Rust → 推荐 [2]
- 仅 Node → 推荐 [3]
- 都无 → 推荐 [4]

---

## 3. 安装后验证

### `eket --version` 输出
```
EKET v2.9.0
Engine: rust (优先级最高)
Fallback: node → shell
Platform: darwin-arm64
```

### `eket doctor` 检查项
1. ✅ 二进制可执行性
2. ✅ 环境变量（OPENCLAW_API_KEY）
3. ✅ Redis 连接（可选）
4. ✅ SQLite 权限
5. ✅ Git 配置
6. ✅ Claude 命令（`~/.claude/commands/eket.sh`）
7. ✅ Skill 安装
8. ✅ 磁盘空间（> 1GB）

---

## 4. UX 改进建议（基于人类反馈）

### 菜单文案
- ✅ 显示每个选项的体积（Rust 10 MB / Node 50 MB）
- ✅ 根据检测结果自动标记推荐项（★）
- ✅ 添加"按 Ctrl+C 取消安装"提示

### 错误提示
- ✅ 下载失败时提供重试选项
- ✅ sha256 校验失败时解释原因（MITM / 传输错误）
- ✅ 权限不足时提示 `sudo` 或修改安装路径

### 失败回滚
- ✅ 安装失败时自动删除已下载文件
- ✅ 提供卸载脚本（`bash install.sh --uninstall`）

---

**评审状态**: ⚠️ 简化版（CLI 专家超时）  
**建议**: TASK-416 Slaver 可参考本文档基础设计，后续迭代优化
