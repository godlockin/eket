# TASK-508: 文档更新

**EPIC**: EPIC-005 | **Milestone**: M3 | **优先级**: P2 | **工时**: 3h | **状态**: ready | **依赖**: TASK-507

## 需求
更新 README + 创建安装指南，说明简版/研发版安装流程。

## AC
- **AC-1**: README 更新
  - Given: 主 README.md
  - When: 更新安装章节
  - Then: 首行显示一键安装命令

- **AC-2**: 安装指南
  - Given: 新建 `docs/installation.md`
  - When: 文档编写
  - Then: 包含简版/研发版说明 + 故障排查

## 技术方案

### README.md
```markdown
## 🚀 Quick Start

一键安装（下载预编译包）:
\`\`\`bash
curl -fsSL https://github.com/godlockin/eket/releases/latest/download/install.sh | bash
\`\`\`

开发者本地编译:
\`\`\`bash
git clone https://github.com/godlockin/eket.git
cd eket
bash scripts/dev-install.sh
\`\`\`
```

## 交付物
- [ ] README.md 更新
- [ ] `docs/installation.md` 创建

## 时限
**3h**
