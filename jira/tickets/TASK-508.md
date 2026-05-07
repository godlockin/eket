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
- [x] README.md 更新
- [x] `docs/installation.md` 创建

## 时限
**3h**

---

## 领取信息

**Slaver**: Slaver B (Technical Writer)  
**领取时间**: 2026-05-07 14:30  
**预计完成**: 2026-05-07 17:30

---

## 分析报告

### 需求分析

**核心需求**:
1. 更新 README.md 安装章节，展示一键安装命令
2. 创建详细安装指南 `docs/installation.md`
3. 区分简版（预编译）和研发版（本地编译）

**技术方案**:
- README: 替换 Quick Start 章节（L38-69），提供简化流程 + 链接
- installation.md: 全面覆盖（安装方式对比、验证、平台支持、故障排查、FAQ）

---

## 实现细节

### 文件变更

**README.md**:
- 移除详细的 Rust/Shell/Node 启动说明
- 简化为两种路径：一键安装 vs 开发者编译
- 添加验证命令（`eket-rust --version`, `eket doctor`）
- 链接到详细指南

**docs/installation.md** (新建):
- 安装方式对比表格（适用人群、环境要求、时间）
- 简版安装：一键命令 + 安装内容 + 验证步骤 + 平台支持
- 研发版安装：前置要求 + 步骤 + 优点
- 故障排查：5 个常见问题（curl/权限/平台/SHA256/skills）
- 卸载 + 升级说明
- FAQ（3 个核心问题）

### 关键设计决策

1. **安装命令统一**: 使用 `eket-rust`/`eket-node` 区分版本，避免混淆
2. **验证流程明确**: 三步验证（binaries + doctor + skills）
3. **故障排查前置**: 常见问题提前告知，减少安装失败
4. **平台支持透明**: 明确列出支持/计划中的平台

---

## 测试结果

### 格式验证

```bash
# README 章节检查
✅ Quick Start 章节更新
✅ 链接指向 docs/installation.md

# installation.md 大纲检查
✅ 包含安装方式、简版、研发版、故障排查章节
✅ Markdown 格式正确
```

### AC 验收

- **AC-1**: ✅ README 首行显示一键安装命令
- **AC-2**: ✅ installation.md 包含简版/研发版说明 + 故障排查

---

## PR 提交

**分支**: `feature/task-508-doc-update`  
**Commit**: `docs: update installation guide with simple/dev install paths`  
**文件变更**: 
- `README.md` (修改)
- `docs/installation.md` (新建)

**PR 描述**:
```markdown
## 变更说明

更新安装文档，区分简版（预编译）和研发版（本地编译）两种安装路径。

### 主要变更

1. **README.md Quick Start 简化**:
   - 一键安装命令置顶
   - 简化为两种路径（简版 vs 研发版）
   - 添加验证命令示例

2. **新建 docs/installation.md**:
   - 安装方式对比表格
   - 详细步骤（简版 + 研发版）
   - 平台支持说明
   - 故障排查（5 个常见问题）
   - 卸载/升级/FAQ

### AC 验收

- ✅ AC-1: README 首行显示一键安装命令
- ✅ AC-2: installation.md 包含简版/研发版 + 故障排查

### 测试

- Markdown 格式验证通过
- 链接检查通过
```

---

## 知识沉淀

### 经验教训

1. **文档分层原则**:
   - README: 快速开始 + 核心链接
   - 专题文档: 详细步骤 + 故障排查
   - 避免 README 过于冗长

2. **安装指南必备要素**:
   - 前置要求明确
   - 验证步骤完整
   - 故障排查前置
   - 平台支持透明

3. **技术写作技巧**:
   - 表格对比适用场景
   - 代码块带注释
   - FAQ 覆盖核心疑问

### 可复用模式

- 安装文档模板（简版 vs 研发版结构）
- 故障排查章节（问题-原因-解决三段式）
- 平台支持表格（OS-架构-状态）

---

**完成时间**: 2026-05-07 15:45  
**实际工时**: 1.25h  
**状态**: ✅ 已完成
