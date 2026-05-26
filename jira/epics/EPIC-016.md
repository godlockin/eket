# EPIC-016: 借鉴 ECC 工程实践

**创建时间**: 2026-05-27  
**状态**: planning  
**优先级**: P1  
**预估工时**: 10d  
**来源**: ECC 项目分析（专家组评审）

---

## 背景

分析 [ECC (Everything Claude Code)](https://github.com/affaan-m/ECC) 项目后，识别出多个高价值借鉴点。ECC 是 harness-native 智能体操作系统，获 Anthropic 黑客马拉松冠军。

## 核心借鉴点

| 优先级 | 借鉴点 | 预估 |
|--------|--------|------|
| P0 | Fact-Forcing Gate（基于事实决策） | 2d |
| P0 | Hook Profile 分层 | 2d |
| P1 | Token 预算仪表盘 | 2d |
| P1 | Dispatcher 聚合模式 | 1d |
| P2 | SKILL.md 模板规范化 | 1d |
| P2 | Context Graph 知识存储 | 3d |

## 核心原则

**所有判断决策必须基于已知信息，禁止基于想象/假设**

## Ticket 清单

- TASK-E16-01: Fact-Forcing Gate 实现
- TASK-E16-02: Hook Profile 分层
- TASK-E16-03: Token 预算仪表盘
- TASK-E16-04: Hook Dispatcher 聚合
- TASK-E16-05: Memory 模板规范化

## 验收标准

- [ ] pre-edit hook 强制 fact-check
- [ ] 支持 minimal/standard/strict 三档 profile
- [ ] Dashboard 显示 token 用量 + 色阶
- [ ] hooks 聚合执行，减少进程开销
- [ ] `confluence/memory/` 结构统一

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-05-27 | 创建 EPIC | Master |
