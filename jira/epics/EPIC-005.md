# EPIC-005: 一键安装系统 + 预编译包发布

**创建时间**: 2026-05-07
**更新时间**: 2026-05-07 13:00 ✅ **执行计划完成**
**状态**: ready_to_execute （12 TASK 就绪，等待 Slaver 团队）
**优先级**: P1-谕令
**预估工时**: 56.5h → 实际 **4-5 天**（3 Slaver 并行）
**关键发现**: 
- ✅ Rust 代码已存在，工作量降低 75%
- 🔴 发现 2 个 P0 阻塞（已创建 TASK-426/427）
- ⚖️ Node 预编译方案决策：**pkg 打包 + npm fallback**

---

## 概述

构建完整的 EKET 一键安装体验，包括：
1. 引导式安装脚本（环境检测 + 三层级选择）
2. GitHub Actions 自动编译发布（Node + Rust 预编译包）
3. 安装脚本优先下载预编译包，本地编译为 fallback
4. Claude Code / MCP 直接唤醒机制（`/eket` + "召唤 EKET 团队"）

---

## 原始需求

> rust 版和 node 版都需要 github action 预先编译好，安装脚本里默认下载预编译包，除非脚本发现有编译环境 + 代码 + 用户主动要求本地编译

期望流程：
```bash
# 1. 下载脚本
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/install.sh | bash

# 2. 引导式选择
┌─────────────────────────────────────────┐
│ EKET 安装向导                            │
├─────────────────────────────────────────┤
│ 检测到系统环境：                         │
│ - Rust ✅ (v1.76)                       │
│ - Node.js ✅ (v20.x)                    │
│ - Shell ✅ (Bash 5.x)                   │
│                                          │
│ 选择安装层次：                           │
│ [1] 完整安装（Rust + Node + Shell）      │
│ [2] Rust + Shell（轻量级）              │
│ [3] Node + Shell（标准版）              │
│ [4] Shell Only（最小化）                │
│ [5] 本地编译模式                         │
└─────────────────────────────────────────┘

# 3. 自动下载预编译包（除非选 5）
# 4. 注册 Claude 命令
# 5. 完成提示
```

---

## 子模块拆解（已完成拆分）

### Milestone 1: 核心安装流程（3 天，P0）
- **TASK-416**: 引导式安装脚本（环境检测 + 5 级菜单 + 下载）
- **TASK-417**: sha256 校验逻辑
- **TASK-418**: 本地编译 fallback
- **TASK-419**: Claude 命令注册

### Milestone 2: GitHub Actions 调整（1 天，P0）
- **TASK-420**: Node 预编译 job（ncc bundle）
- **TASK-421**: 统一 asset 命名 + sha256 生成
- **TASK-422**: 跨平台测试（Linux/macOS/WSL2）

### Milestone 3: 用户体验优化（1 天，P1）
- **TASK-423**: Skill description 更新（"召唤 EKET 团队" 触发）
- **TASK-424**: 安装后验证（`eket doctor`）
- **TASK-425**: 文档更新（README + 安装指南）

**依赖图**: `confluence/architecture/EPIC-005-dependency-graph.md`

---

## 验收标准（Draft）

- [ ] 新用户执行 `curl | bash` 后无需手动 `npm install`
- [ ] 安装脚本自动检测环境，提供 5 级选择
- [ ] GitHub Release 页面有 `eket-node-standalone.js` + `eket-rust-linux-amd64` 等 assets
- [ ] Claude Code 内输入 `/eket` 或 "召唤 EKET 团队" 可启动
- [ ] 本地编译模式（选项 5）仍可用于开发者

---

## 技术债与风险

| 风险项 | 可能性 | 影响 | 缓解策略 |
|-------|-------|------|---------|
| Rust 版工作量超预期（2-3 周） | H | M | Phase 先做 Node 预编译，Rust 作 opt-in |
| 跨平台编译 CI 配置复杂 | M | M | 借鉴 `tj/n` 等成熟项目 workflow |
| 预编译包体积过大（>50MB） | L | L | 使用 upx 压缩或分包下载 |
| Claude 命令冲突（已有 `/eket-*`） | L | L | 迁移到统一 `/eket` 入口 |

---

## 依赖 / 前置条件

- 无（新功能，独立模块）

---

## 后续待办

- [ ] 召唤 Expert Panel（至少：架构师 + DevOps + 前端/CLI）
- [ ] 产出 `requirement-analysis.md`（§1.2 模板）
- [ ] 绘制依赖图（Mermaid）
- [ ] 拆分为 INVEST ticket
- [ ] 分配到 Slaver 团队

---

**Master 下一步**: 召唤专家组进行需求分析。
