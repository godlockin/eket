# Claude Code Setup 改进经验总结

**日期**: 2025-05-25  
**Epic**: 竞品研究与框架增强  
**状态**: ✅ 已完成

---

## 背景

研究 GitHub 上的 claude-code-setup 相关项目，识别 EKET 框架可借鉴的最佳实践，并实施改进。

## 研究的项目

| 项目 | 特点 | 借鉴价值 |
|------|------|----------|
| anthropics/claude-code-action | CI/CD 集成、安全控制 | PR 自动化模式 |
| PatrickJS/awesome-cursorrules | 规则模板库、社区共享 | 模板生态思路 |
| pontusab/cursor.directory | 分类目录、搜索功能 | 知识组织方式 |
| grapeot/devin.cursorrules | 深度工作流、多阶段任务 | 复杂任务分解 |

## 实施的改进

### Phase 1: 快速启动

1. **`scripts/quick-setup.sh`** - 30 秒一键安装
   - 平台检测 (macOS/Linux)
   - 二进制下载
   - Skills 安装
   - 验证检查

2. **`template/hooks/context-monitor.js`** - 上下文监控
   - PostToolUse 钩子
   - Token 估算
   - 70% 警告 / 85% 危急提醒
   - JSON 状态持久化

3. **`confluence/memory/MEMORY.md`** - 知识索引
   - 71+ 文件快速导航
   - 分类组织

### Phase 2: 防护与恢复

4. **`template/hooks/read-guard.js`** - 防盲改钩子
   - PreToolUse 拦截
   - 编辑前必须先读取
   - 白名单机制
   - warn/block 两种模式

5. **`template/.claude/commands/eket-save.sh`** - 会话保存
   - Git 状态快照
   - 进行中任务
   - 最近修改文件
   - 上下文使用情况

6. **`template/.claude/commands/eket-resume.sh`** - 会话恢复
   - 列出历史会话
   - 加载上下文
   - 继续工作建议

7. **`template/.claude/commands/eket-office-hours.sh`** - 需求分析
   - 六问框架（来自 gstack）
   - 强制回答核心问题
   - 生成分析报告

---

## 关键经验

### 1. Hook 是扩展点，不是约束点

**教训**: Hook 应该提供信息和建议，而不是强制阻止。默认用 `warn` 模式，让用户决定是否启用 `block`。

**原因**: 过度限制会导致用户绕过或禁用钩子，失去价值。

### 2. 会话状态比想象中重要

**教训**: Claude Code 会话中断后，恢复上下文非常困难。保存会话状态（git status、当前任务、最近文件）大幅降低恢复成本。

**实践**: 
- 每次重要工作后 `/eket-save`
- 新会话开始时 `/eket-resume`

### 3. 强制问答比自由发挥更有效

**教训**: 开发者跳过需求分析直接编码是常见问题。强制回答六个问题（office-hours）能显著提高需求清晰度。

**六问框架**:
1. 用户问题 - 解决什么？
2. 成功指标 - 如何衡量？
3. 最小版本 - MVP 是什么？
4. 风险识别 - 可能出什么错？
5. 依赖关系 - 依赖谁？谁等你？
6. 验证方式 - 如何验收？

### 4. 项目级隔离是基础原则

**教训**: 所有状态文件（数据库、日志、会话）必须在项目目录内（`.eket/`），不能放全局目录（`~/.eket/`）。

**原因**: 
- 多项目并行时互不干扰
- 项目可独立备份/迁移
- 符合 "项目即容器" 原秒内完成核心流程。超过这个时间，流失率急剧上升。

**实践**: `quick-setup.sh` 实现了：
```bash
curl -fsSL https://... | bash  # 一行命令
```

---

## 后续改进方向

| 优先级 | 改进 | 状态 |
|--------|------|------|
| P1 | Hook 配置自动化（安装时自动添加到 settings.json） | 待做 |
| P2 | 知识图谱可视化（基于 MEMORY.md 生成关系图） | 待做 |
| P3 | 会话分析仪表板（统计工作模式、效率） | 待做 |

---

## 相关文件

- `scripts/quick-setup.sh`
- `template/hooks/context-monitor.js`
- `template/hooks/read-guard.js`
- `template/.claude/commands/eket-*.sh`
- `confluence/memory/MEMORY.md`
- `confluence/memory/lessons/claude-code-setup-comparison.md`

---

*由 claude-code-setup 研究驱动 | EKET v2.9.0-alpha*
