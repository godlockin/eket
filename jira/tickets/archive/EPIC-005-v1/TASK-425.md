# TASK-425: 文档更新（README + 安装指南）

**EPIC**: EPIC-005 | **Milestone**: M3 | **优先级**: P2 | **工时**: 4h | **状态**: ready | **依赖**: TASK-423, TASK-424

## 需求
更新 README.md 和创建独立安装指南，覆盖新安装流程。

## AC
- **AC-1**: README 更新
  - Given: 主 README.md
  - When: 更新安装章节
  - Then: 
    - 首行显示一键安装命令
    - 移除旧的 `git clone + npm install` 流程
    - 链接到详细安装指南

- **AC-2**: 安装指南创建
  - Given: 新建 `docs/installation.md`
  - When: 文档编写
  - Then: 包含 5 级选择说明、故障排查、卸载步骤

- **AC-3**: 多语言支持
  - Given: 用户可能是中文/英文
  - When: 提供文档
  - Then: README 英文，`docs/installation-zh.md` 中文

## 技术方案

### README.md 更新
```markdown
## 🚀 Quick Start

一键安装：

\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/install.sh | bash
\`\`\`

详细安装指南：[installation.md](docs/installation.md)

### 手动安装

如需本地编译或自定义安装，参见 [installation.md#local-build](docs/installation.md#local-build)
```

### docs/installation.md 大纲
```markdown
# EKET 安装指南

## 1. 一键安装（推荐）
- 环境要求
- 安装命令
- 5 级选择说明
- 验证安装

## 2. 本地编译
- Rust 版编译
- Node 版编译
- Shell 版安装

## 3. 故障排查
- 网络问题
- 权限问题
- 平台不支持

## 4. 卸载
- 命令行卸载
- 手动清理
```

## 交付物
- [ ] `README.md` 更新
- [ ] `docs/installation.md` 创建（英文）
- [ ] `docs/installation-zh.md` 创建（中文）
- [ ] 更新 `CLAUDE.md` 引用新安装流程
