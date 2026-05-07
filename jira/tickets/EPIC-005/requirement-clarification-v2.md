# EPIC-005 需求澄清 v2（人类对齐）

**对齐时间**: 2026-05-07 14:15
**关键纠正**: install.sh 自动生成机制

---

## 正确理解

### 1. 本地 repo 结构
```
eket/
├── rust/src/          # 纯源码（无 target/）
├── node/src/          # 纯源码（无 dist/）
├── sh/                # Shell 脚本源码
├── .github/workflows/ # CI 配置
└── scripts/           # 辅助脚本（非 install.sh）
```

**不包含**: 任何编译结果（dist / target / node_modules）

---

### 2. GitHub Actions 职责

**触发**: 推送代码或 tag

**流程**:
```
1. 编译 Rust → eket-rust-{platform}
2. 编译 Node → eket-node-{platform}
3. 生成 sha256 文件
4. 🆕 **动态生成 install.sh**:
   - 嵌入最新版本号
   - 嵌入下载链接（Release URLs）
   - 嵌入 sha256 值
5. 上传所有 assets 到 GitHub Release
```

---

### 3. install.sh 两个版本

#### 简版（普通用户）
- **生成方式**: GitHub Actions 自动生成
- **内容**: 
  - 下载预编译包（从 GitHub Releases）
  - 校验 sha256（值硬编码在脚本中）
  - 安装到 `~/.local/bin/` 或 `/usr/local/bin/`
  - **更新 Claude skills**（复制到 `~/.claude/skills/eket/`）

#### 研发版（开发者）
- **生成方式**: 本地脚本 `scripts/local-install.sh`（已存在？）
- **内容**:
  - 本地编译（cargo build / npm build）
  - 符号链接到 `~/.local/bin/`
  - **更新 Claude skills**

---

### 4. 最终行为（两版本共同）

**无论哪个版本，install 最终都做**:
1. 准备 EKET 执行文件（下载 or 编译）
2. **更新机器本地 skills**（`~/.claude/skills/eket/`）
3. 验证安装（`eket --version` / `eket doctor`）

**关键**: skills 更新是核心产物！

---

## 错误假设 vs 正确理解

| 项目 | 错误假设 | 正确理解 |
|------|---------|---------|
| **install.sh 位置** | repo root 静态文件 | GitHub Actions 动态生成 |
| **install.sh 维护** | Slaver 手写 | CI 模板 + 变量注入 |
| **sha256 校验** | install.sh 下载 .sha256 文件 | sha256 值硬编码在 install.sh 中 |
| **版本更新** | 手动修改脚本 | CI 自动注入版本号 |
| **核心产物** | 安装 binary | **安装 binary + 更新 skills** |

---

## 需要重新拆解的模块

### M1: GitHub Actions 自动化（新）
- 动态生成 install.sh（模板 + 变量注入）
- 编译 Rust + Node
- 上传 Release assets

### M2: install.sh 模板（新）
- 简版模板（下载预编译包 + 更新 skills）
- 研发版模板（本地编译 + 更新 skills）

### M3: Skills 更新逻辑（新）
- 复制 `.claude/skills/eket/` 到用户目录
- 注册 `/eket` 命令

### M4: 文档 + 测试
- README 更新
- eket doctor
- 跨平台测试

---

## 废弃的 TASK（基于错误假设）

- ~~TASK-416~~（引导式安装脚本）→ 改为 CI 模板
- ~~TASK-417~~（sha256 逻辑）→ 改为 CI 硬编码
- ~~TASK-419~~（Claude 命令）→ 改为 skills 安装
- ~~TASK-420~~（Node 预编译）→ 保留，但调整为 CI workflow
- ~~TASK-421~~（asset 规范）→ 保留，整合到 CI
- ~~TASK-422/423/424/425~~（部分保留，部分调整）

---

## 保留的产出（可复用）

- ✅ TASK-426（setup.sh sha256）→ 可作为 CI 模板参考
- ✅ TASK-427（complete.ts 编译）→ 必要修复
- ✅ TASK-418（本地编译）→ 研发版 install 可用

---

**下一步**: Master 重新拆解 8-10 个新 TASK，基于正确理解。
