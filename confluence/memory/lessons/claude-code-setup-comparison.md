# Claude Code Setup 方案对比分析

## 研究背景

**日期**: 2026-05-19  
**目的**: 分析 GitHub 上流行的 claude-code-setup 方案，提取可借鉴的改进点

---

## 主要方案分析

### 1. centminmod/my-claude-code-setup

**核心特色**：Memory Bank 系统（双重记忆架构）

| 特性 | 描述 | EKET 对比 |
|------|------|-----------|
| **Memory Bank 文件** | `CLAUDE-*.md` 系列文件按主题分割 | ✅ 已有类似设计 (`confluence/memory/`) |
| **Progressive Disclosure** | 按需加载记忆文件，不预加载 | ⚠️ 可借鉴：减少初始上下文 |
| **3 种模板** | Compact/Memory Bank/Progressive | ⚠️ 可借鉴：提供多种复杂度选择 |
| **Git Worktree 集成** | `clx`, `cx` shell 函数快速创建隔离会话 | ✅ 已有 worktree 支持 |
| **Z.AI 集成** | 替代 API 降低成本 | ❌ 不需要（EKET 有自己的降级机制） |

**可借鉴点**：
1. HTML 注释 0 token 技巧
2. `clx` 函数简化 worktree 创建
3. 多模板策略（compact/standard/enterprise）

---

### 2. garrytan/gstack

**核心特色**：23 个工具模拟虚拟工程团队

| 角色 | 工具 | EKET 对比 |
|------|------|-----------|
| **CEO** | `/office-hours`, `/plan-ceo-review` | ⚠️ 可借鉴：强制性问题框架 |
| **Eng Manager** | `/plan-eng-review`, `/retro` | ✅ 类似功能在 Master 角色 |
| **Designer** | `/design-review`, `/design-shotgun` | ⚠️ 可借鉴：多变体生成 |
| **QA** | `/qa`, `/qa-only` | ✅ 已有测试流程 |
| **Release Eng** | `/ship`, `/land-and-deploy`, `/canary` | ⚠️ 可借鉴：部署后监控 |
| **Staff Eng** | `/review`, `/investigate` | ✅ 已有 Review 流程 |

**创新亮点**：
1. **Skill Chaining** - 技能自动串联
2. **Continuous Checkpoint** - WIP 自动提交
3. **Parallel Sprints** - 支持 10-15 并发会话
4. **Prompt Injection Defense** - 多层防护

**可借鉴点**：
1. `/office-hours` 强制问题框架
2. `/investigate` 先调查后修复规则
3. 部署后 `/canary` 监控

---

### 3. lucasrosati/claude-code-memory-setup

**核心特色**：Obsidian + Graphify 知识图谱

| 特性 | 描述 | EKET 对比 |
|------|------|-----------|
| **单一 Vault** | 跨项目统一知识库 | ❌ EKET 是项目隔离设计 |
| **Graphify** | tree-sitter AST → 知识图谱 | ⚠️ 可借鉴：结构化代码索引 |
| **三层查询** | Graph → Vault → Raw Code | ✅ 类似设计理念 |
| **71.5x Token 减少** | 通过结构化查询 | ⚠️ 可借鉴：token 优化策略 |

**可借鉴点**：
1. `/resume` + `/save` 会话命令
2. AST 级别的代码索引（无 LLM 成本）
3. 三层查询优先级

---

### 4. tomascortereal/claude-code-setup

**核心特色**：103 个 slash commands + GSD 框架

| 组件 | 数量 | EKET 对比 |
|------|------|-----------|
| **Agents** | 21 | ✅ 已有 Master/Slaver 体系 |
| **Skills** | 62 + 34 | ✅ 已有 experts 体系 |
| **Hooks** | 8 | ⚠️ 可借鉴：生命周期钩子 |
| **Plugins** | 20 | ✅ 已有插件机制 |

**关键 Hooks**：
- `global-memory-symlink.sh` - 项目记忆符号链接
- `gsd-context-monitor.js` - 上下文监控
- `gsd-prompt-guard.js` - 提示注入防护
- `gsd-read-guard.js` - 编辑前强制读取

**可借鉴点**：
1. Hook 系统完整性
2. Context Monitor 持续监控
3. Read Guard 防止盲改

---

## EKET 改进建议

### 高优先级（立即可用）

#### 1. 简化项目接入流程

**当前问题**：`scripts/setup.sh` 功能强大但复杂，新用户需要理解 4 个 Level

**改进方案**：
```bash
# 30 秒快速安装（类似 gstack）
curl -fsSL https://github.com/godlockin/eket/releases/latest/download/quick-setup.sh | bash
```

新增 `quick-setup.sh`：
1. 检测环境（Node/Rust）
2. 下载预编译 binary
3. 安装 skills 到 `~/.claude/skills/eket/`
4. 创建 `CLAUDE.md` 符号链接
5. 运行 `/eket-init` 初始化向导

#### 2. 添加 Context Monitor Hook

**参考**：tomascortereal 的 `gsd-context-monitor.js`

**实现**：
```javascript
// hooks/context-monitor.js
// PostToolUse 时检查 context 使用率
// 超过 80% 时自动触发 /compact
```

#### 3. 添加 Read Guard Hook

**参考**：gsd-read-guard.js

**实现**：
```javascript
// hooks/read-guard.js
// 编辑文件前强制先读取
// 防止"改了但没看"的盲改问题
```

#### 4. 简化 Memory 结构

**当前**：`confluence/memory/` 下按主题分类
**改进**：添加 `MEMORY.md` 索引文件（类似 centminmod）

```markdown
# MEMORY.md - 项目记忆索引

## Quick Links
- [架构决策](confluence/memory/decisions/)
- [经验教训](confluence/memory/lessons/)
- [陷阱警告](confluence/memory/pitfalls/)
```

### 中优先级（增强体验）

#### 5. 添加 `/resume` 和 `/save` 命令

**参考**：lucasrosati 的会话管理

```bash
# /resume - 加载上次会话上下文
# /save - 保存当前会话状态到 .eket/sessions/
```

#### 6. 添加 `/office-hours` 问题框架

**参考**：gstack 的强制性问题

**实现**：在需求分析阶段强制回答 6 个核心问题：
1. 这解决什么用户问题？
2. 成功指标是什么？
3. 最小可行版本是什么？
4. 有什么风险？
5. 依赖什么外部系统？
6. 完成后如何验证？

#### 7. 添加部署后监控 `/canary`

**参考**：gstack 的 canary 检测

**实现**：
```bash
# /canary - 部署后监控
# 检查：console errors, performance regression, API errors
```

### 低优先级（长期规划）

#### 8. 知识图谱集成

**参考**：Graphify 的 AST 解析

**可选实现**：
- 使用 tree-sitter 生成代码结构图
- 保存到 `.eket/graph.json`
- 查询时优先使用图而非原始代码

#### 9. 多模板策略

**参考**：centminmod 的 3 种模板

**实现**：
```
template/
├── minimal/      # 小项目（~100 行 CLAUDE.md）
├── standard/     # 中项目（~300 行，当前默认）
└── enterprise/   # 大项目（完整功能）
```

---

## 与竞品的差异化优势

### EKET 独有优势

| 特性 | EKET | 竞品 |
|------|------|------|
| **Master/Slaver 协作** | ✅ 完整的多实例协作体系 | ❌ 大多是单实例 |
| **三仓库分离** | ✅ confluence/jira/code 清晰分离 | ❌ 混合在一起 |
| **分析报告审批** | ✅ 开发前强制分析报告 | ❌ 直接开发 |
| **四级降级架构** | ✅ Shell → Node → Redis → SQLite | ❌ 单一技术栈 |
| **渐进式安装** | ✅ 4 Level 按需安装 | ❌ 全量安装 |
| **防任务熔断** | ✅ 长文档分块规则 | ❌ 无此机制 |

### 需要补齐的短板

| 特性 | 当前状态 | 改进方向 |
|------|----------|----------|
| 快速安装脚本 | 30 秒 → 2 分钟 | 添加 `quick-setup.sh` |
| Context 监控 | 手动检查 | 添加自动 hook |
| Read Guard | 无 | 添加编辑前强制读取 |
| 会话恢复 | 手动 | 添加 `/resume` `/save` |

---

## 实施路线图

### Phase 1: Quick Wins（1-2 天）

- [ ] 创建 `quick-setup.sh` 一键安装脚本
- [ ] 添加 `MEMORY.md` 索引文件
- [ ] 添加 Context Monitor Hook

### Phase 2: Enhanced Safety（3-5 天）

- [ ] 添加 Read Guard Hook
- [ ] 添加 `/resume` `/save` 命令
- [ ] 添加 `/office-hours` 问题框架

### Phase 3: Long-term（1-2 周）

- [ ] 知识图谱 POC
- [ ] 多模板策略
- [ ] 部署后监控 `/canary`

---

## 参考资源

- [centminmod/my-claude-code-setup](https://github.com/centminmod/my-claude-code-setup)
- [garrytan/gstack](https://github.com/garrytan/gstack)
- [lucasrosati/claude-code-memory-setup](https://github.com/lucasrosati/claude-code-memory-setup)
- [tomascortereal/claude-code-setup](https://github.com/tomascortereal/claude-code-setup)

---

**标签**: `#research` `#setup` `#comparison` `#improvement`
