# TASK-091: k6/ 评估 — 归档或集成 CI

## 元数据
- **状态**: ready
- **类型**: chore
- **优先级**: P2
- **负责人**: 待领取
- **创建时间**: 2026-04-19
- **依赖**: 无

## 背景

`k6/` 目录包含两个负载测试脚本（`load-test.js` 9.2K，`quick-test.js` 1.1K），
但当前 CI 未集成，也无对应 benchmark 目标。需评估其价值：
- 是否仍能正常运行（对 eket 的 HTTP API）？
- 是否应集成进 CI pipeline（如 performance 检查）？
- 还是应该归档？

## 验收标准

**方案 A（推荐）：集成**
1. 在 `node/package.json` 添加 `"bench": "k6 run k6/quick-test.js"` 脚本
2. 确认 k6 脚本目标 URL 指向正确的 eket HTTP API 端口
3. 更新 `docs/performance/PERFORMANCE_TESTING.md` 说明如何运行
4. `k6/` 保留在项目根

**方案 B：归档**
1. 将 `k6/` 移入 `docs/archive/k6/`
2. 在 `docs/archive/INDEX.md` 更新条目

Slaver 执行前先运行 `k6 run k6/quick-test.js` 验证可用性，再决定方案。

## 执行命令

```bash
# 验证 k6 是否安装
k6 version
# 检查脚本内容
cat k6/quick-test.js
# 尝试运行（需要 web:dashboard 先启动）
```
