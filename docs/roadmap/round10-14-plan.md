# Round 10-14 Sprint 计划 - v3.0 产品化之路

**制定时间**: 2026-04-08
**修订时间**: 2026-04-09 (Round 13b 进行中)
**当前版本**: v2.4.0 (Round 13a 完成)
**目标版本**: v3.0.0 (生产级 AI 协作框架)

---

## 📊 总览

| Sprint | 主题 | Pillar | 周期 | 目标版本 |
|--------|------|--------|------|---------|
| Round 10 | CLI 体验改进 | Pillar 1 | 1 周 | v2.3.0 | ✅ 完成 |
| Round 11 | 文档站建设 | Pillar 1 | 1 周 | v2.3.0 | ✅ 完成 |
| Round 12 | Docker 化 | Pillar 2 | 1 周 | v2.3.0 | ✅ 完成 |
| Round 13a | 清账（测试100%+降级） | Pillar 2 | 1 周 | v2.4.0 | ✅ 完成 |
| Round 13b | CI/CD + 健康检查 | Pillar 5 | 1 周 | v2.5.0 | 🔄 进行中 |
| Round 14 | SDK 正式化 | Pillar 3 | 1 周 | v2.6.0 | ⚪ 待启动 |

---

## 🎯 Round 10: CLI 体验改进

**周期**: 1 周
**工作量**: 8-12 小时
**负责人**: 待分配

### 任务清单

| ID | 任务 | 描述 | 验收标准 |
|----|------|------|---------|
| CLI-001 | inquirer.js 集成 | 交互式配置向导 | 用户无需记忆参数 |
| CLI-002 | 命令别名 | 常用命令快捷方式 | `ekt start` = `ekt instance:start` |
| CLI-003 | 命令补全 | bash/zsh 自动补全 | tab 补全命令和参数 |
| CLI-004 | 错误消息优化 | 友好的错误提示 | 包含解决建议 |
| CLI-005 | 进度条 | 长时间操作显示进度 | 构建、部署等操作 |

### 交付物

- [x] 交互式启动向导
- [x] CLI 补全脚本
- [x] 错误消息优化文档
- [x] v2.3.0 发布（含 Mindset 注入）

---

## 🎯 Round 11: 文档站建设

**周期**: 1 周
**工作量**: 16-20 小时
**负责人**: 待分配

### 任务清单

| ID | 任务 | 描述 | 验收标准 |
|----|------|------|---------|
| DOC-001 | Docusaurus 搭建 | 文档站框架 | 本地运行成功 |
| DOC-002 | 首页设计 | 30 秒快速开始 | 突出核心卖点 |
| DOC-003 | 架构文档迁移 | 三级架构、核心模块 | 图表清晰 |
| DOC-004 | API 文档生成 | TypeDoc 集成 | 自动同步代码 |
| DOC-005 | 部署到 Vercel | 自动部署流水线 | push 即部署 |

### 交付物

- [x] docusaurus 文档站源代码
- [x] 8 篇核心文档迁移完成
- [x] v2.3.0 发布

---

## 🎯 Round 12: Docker 化

**周期**: 1 周
**工作量**: 12-16 小时
**负责人**: 待分配

### 任务清单

| ID | 任务 | 描述 | 验收标准 |
|----|------|------|---------|
| DCK-001 | Dockerfile 编写 | 多阶段构建 | 镜像 <200MB |
| DCK-002 | docker-compose.yml | 完整环境编排 | 一键启动所有服务 |
| DCK-003 | 多架构支持 | arm64/amd64 | GitHub Actions 构建 |
| DCK-004 | Docker Hub 发布 | 自动推送镜像 | `godlockin/eket:latest` |
| DCK-005 | 部署文档 | 完整部署指南 | 新手可跟随部署 |

### 交付物

- [x] Dockerfile（多阶段构建）
- [x] docker-compose.yml
- [x] 部署文档
- [x] v2.3.0 发布（Docker 化）

---

## 🎯 Round 13a: 清账 ✅

**周期**: 1 周
**工作量**: 8 小时
**目标版本**: v2.4.0
**状态**: ✅ 完成

### 任务清单

| ID | 任务 | 描述 | 状态 |
|----|------|------|------|
| FIX-001 | openclaw-adapter 降级修复 | Redis 不可用时优雅降级到内存模式 | ✅ |
| FIX-002 | agent routes 测试修复 | 18 个测试修复，全部通过 | ✅ |
| FIX-003 | 版本对齐 | package.json/CLAUDE.md/CHANGELOG 统一 v2.4.0 | ✅ |
| FIX-004 | confluence 清理 | 移除错误数据，重建 progress-tracker.md | ✅ |

### 交付物

- [x] openclaw-adapter.ts 优雅降级
- [x] 1072/1072 tests 全部通过
- [x] v2.4.0 发布

---

## 🎯 Round 13b: CI/CD + 健康检查 🔄

**周期**: 1 周
**工作量**: 12 小时
**目标版本**: v2.5.0
**状态**: 🔄 进行中

### 任务清单

| ID | 任务 | 描述 | 状态 |
|----|------|------|------|
| TASK-013 | GitHub Actions CI | .github/workflows/ci.yml | 🔄 PR #1 open |
| TASK-014 | 健康检查端点 | /health /ready /live (EketServer + WebDashboardServer) | ✅ PR #2 open |
| TASK-015 | Roadmap 文档对齐 | 版本号与实际状态同步 | 🔄 本次 |

### 交付物

- [x] .github/workflows/ci.yml
- [x] /health /ready /live 端点
- [x] 1079/1079 tests 全部通过
- [ ] 分支保护规则配置
- [ ] v2.5.0 发布

---

## 🎯 Round 14: SDK 正式化 ⚪

**周期**: 1 周
**工作量**: 12-16 小时
**目标版本**: v2.6.0
**状态**: ⚪ 待启动

### 任务清单

| ID | 任务 | 描述 | 验收标准 |
|----|------|------|---------|
| SDK-001 | Python SDK 版本策略 | semver + PyPI 发布流程 | RELEASING.md 完成 |
| SDK-002 | SDK examples 完善 | 覆盖核心用例 | 5+ example 脚本可运行 |
| SDK-003 | SDK tests 完善 | 单测覆盖率 >80% | pytest 通过 |
| SDK-004 | SDK 文档 | API reference + quickstart | docs-site 集成 |

### 交付物

- [ ] sdk/python/RELEASING.md
- [ ] sdk/python/examples/ (5+ 脚本)
- [ ] sdk/python/tests/ 完善
- [ ] v2.6.0 发布

---

## 📊 依赖关系

```
Round 10 (CLI) ─────┬────→ Round 12 (Docker) ──→ Round 13 (监控)
                    │
Round 11 (文档) ─────┘
                              ↓
                    Round 14 (CI/CD)
```

**关键路径**: CLI → Docker → 监控 → CI/CD

---

## 🎯 验收标准汇总

### v2.3.0 (Round 10-12 完成) ✅

- [x] 交互式 CLI 向导可用
- [x] 文档站上线，核心文档完成
- [x] Docker 镜像可用，docker-compose 一键启动

### v2.4.0 (Round 13a 完成) ✅

- [x] 1072/1072 tests 全部通过
- [x] openclaw-adapter 优雅降级
- [x] 版本号统一

### v2.5.0 (Round 13b 进行中) 🔄

- [x] GitHub Actions CI 运行（PR #1）
- [x] 健康检查端点 /health /ready /live（PR #2）
- [ ] 分支保护启用

### v2.6.0 (Round 14) ⚪

- [ ] Python SDK 正式发布
- [ ] SDK 版本策略定义
- [ ] SDK 文档完整

---

## 💡 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Docusaurus 主题定制耗时 | 中 | 使用现成主题，后定制 |
| Docker 镜像大小超标 | 中 | 多阶段构建，alpine 基础 |
| Prometheus 指标定义复杂 | 低 | 先实现核心指标 |
| semantic-release 配置复杂 | 中 | 参考成熟项目配置 |

---

## 📝 任务认领方式

每个 Round 开始时：
1. Master 创建任务看板
2. Slaver 认领任务
3. 每日站会同步进度
4. Round 结束发布版本

---

## 🔗 相关文档

- [v3.0 战略规划](v3.0-strategy.md)
- [Round 9 完成报告](round9-complete.md)
- [路线图](README.md)

---

**状态**: 待启动
**下一步**: 用户确认 Round 10 优先级，启动 Sprint
