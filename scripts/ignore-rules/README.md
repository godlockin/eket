# Ignore Rules System

## 概述

EKET 使用**规则驱动**的方式管理多个 ignore 文件（`.gitignore`, `.dockerignore`, `.claudeignore`），自动根据项目包含的语言/框架动态生成。

## 原理

```
项目语言检测
  ↓
读取 scripts/ignore-rules/*.rules 模板
  ↓
合并生成 .gitignore / .dockerignore / .claudeignore
```

## 规则文件

| 文件 | 优先级 | 用途 |
|------|--------|------|
| `10-system.rules` | 1 | 系统临时文件（.DS_Store, *.tmp, *.log） |
| `20-ide.rules` | 2 | IDE 配置（.idea/, .vscode/, *.iml） |
| `30-security.rules` | 3 | 敏感文件（.env, *.key, credentials.json） |
| `lang-rust.rules` | 4 | Rust 编译结果（target/, Cargo.lock） |
| `lang-node.rules` | 4 | Node.js（node_modules/, dist/, coverage/） |
| `lang-python.rules` | 4 | Python（__pycache__/, venv/, .pytest_cache/） |
| `lang-java.rules` | 4 | Java（*.class, target/, .gradle/） |
| `lang-go.rules` | 4 | Go（*.exe, vendor/, go.work） |
| `git-extra.rules` | 5 | Git 专用（.claude/worktrees/） |
| `docker-extra.rules` | 5 | Docker 专用 |
| `claude-extra.rules` | 5 | Claude Code 上下文优化（*.mp4, models/, *.db） |
| `90-project-specific.rules` | 9 | EKET 特定（.eket/*, outbox/, jira/） |

## 用法

### 生成所有 ignore 文件（自动检测语言）

```bash
bash scripts/sync-ignore-files.sh
```

### 使用 gitignore.io API（首次设置或缺少语言模板时）

```bash
bash scripts/sync-ignore-files.sh --use-gitignore-io
```

**优先级**：本地 `lang-*.rules` > gitignore.io API

gitignore.io 提供 400+ 模板（Python, Rust, Node, Java, Go, VisualStudio, Potlin）
- 发现新框架/工具需要忽略规则时（如 Terraform, Ansible）

**缓存机制**：API 响应保存到 `.gitignore-io-cache.rules`（可提交），后续生成无需网络。

### 仅生成指定语言规则

```bash
bash scripts/sync-ignore-files.sh --lang rust,node
```

### 检查是否需要更新（CI 用）

```bash
bash scripts/sync-ignore-files.sh --check  # exit 1 if dirty
```

## 添加新规则

1. 编辑对应规则文件（如 `scripts/ignore-rules/lang-rust.rules`）
2. 运行 `bash scripts/sync-ignore-files.sh` 重新生成
3. 提交规则文件 + 生成的 ignore 文件

**不要直接编辑** `.gitignore` / `.dockerignore` / `.claudeignore` — 会在下次生成时被覆盖。

## Pre-commit Hook

`.git/hooks/pre-commit-sync-ignore-files` 会在每次 commit 前自动检查 ignore 文件是否同步。如果手动编辑了 ignore 文件但未同步规则，commit 会被阻断。

跳过检查（不推荐）：
```bash
git commit --no-verify
```

## 语言检测逻辑

| 语言 | 检测标志文件 |
|------|------------|
| Rust | `rust/Cargo.toml` |
| Node.js | `node/package.json` 或 `package.json` |
| Python | `setup.py`, `requirements.txt`, `Pipfile`, `pyproject.toml` |
| Java | `pom.xml`, `build.gradle` |
| Go | `go.mod` |
| Ruby | `Gemfile` |
| PHP | `composer.json` |
| Docker | `Dockerfile` |

## 差异化策略

| 文件 | 包含规则 |
|------|---------|
| `.gitignore` | 通用 + 语言 + Git 专用 + 项目特定 |
| `.dockerignore` | 通用 + 语言 + Docker 专用（**不含** Git worktrees） |
| `.claudeignore` | 通用 + 语言 + Claude 专用（额外忽略 *.mp4, models/, *.db） |

Claude 专用规则额外忽略大文件（减少 token 消耗）：
- 媒体文件：`*.mp4`, `*.png`, `*.pdf`, `*.zip`
- 模型权重：`models/`, `weights/`, `checkpoints/`
- 数据集：`datasets/`, `*.csv`, `*.parquet`

## 示例

新增 C++ 语言支持：

1. 创建 `scripts/ignore-rules/lang-cpp.rules`：
   ```
   # C++ build artifacts
   *.o
   *.obj
   *.out
   *.exe
   build/
   cmake-build-*/
   ```

2. 更新 `sync-ignore-files.sh` 检测逻辑：
   ```bash
   [[ -f "$PROJECT_ROOT/CMakeLists.txt" ]] && langs+=("cpp")
   ```

3. 运行生成：
   ```bash
   bash scripts/sync-ignore-files.sh
   ```
