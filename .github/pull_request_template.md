<!--
EKET PR template — DO NOT remove section headers (CI 会逐项校验):
- "Tests:" 行必须含真实 Jest/TAP 输出 (e.g. `Tests: 1153 passed`)
- "Ref:" 行必须引用至少一个 ticket ID (FEAT|TASK|FIX|TEST|DEPL|T-DESIGN|EPIC)-NNN
- 单人开发时如需豁免 block-self-loop, 加 `solo-dev` label 并在 "AI-Review:" 行写上证据
-->

## 摘要
<!-- 1-3 句话说清楚改了什么、为什么 -->

## 变更类型
- [ ] feat：新功能
- [ ] fix：Bug 修复
- [ ] refactor：重构（不影响功能）
- [ ] test：测试
- [ ] docs：文档
- [ ] chore：构建 / 依赖 / 配置

## 变更点
- [ ]
- [ ]

## 验收标准 (AC)
- [ ] AC-1:
- [ ] AC-2:

## Artifact Verification (4-Level)

- [ ] L1 存在性：所有声称新增/修改的文件在 diff 中可见
- [ ] L2 实质性：无空函数体、无纯占位 stub（如有特殊原因请说明）
- [ ] L3 接线：新增模块已被正确 import/注册/export
- [ ] L4 数据流：核心路径有非纯-mock 的测试（如不适用请注明原因）

## 测试证据（必填，禁止 mock/fake）

> ⚠️ 无真实输出 = Master 直接 reject，不看代码

**测试命令输出**（粘贴 `npm test | tail -10` 的真实 stdout）：

```
Tests:
```

**验证清单**：

- [ ] 已运行真实测试（非 mock），命令输出已粘贴在上方
- [ ] 无新增 `jest.mock` / `jest.spyOn` 替换真实服务调用（或已说明理由）
- [ ] CI 绿灯（PR 底部 check 通过）

## 回滚
<!-- 如何回滚？feature flag / git revert / 数据迁移逆操作 -->

## AI-Review
<!-- 单人开发时必填一行 (block-self-loop 校验)，例如:
AI-Review: codex review - PASS, 0 issues
AI-Review: claude opus 4.5 - 2 nits addressed
-->

## Ref
<!-- 至少一个 ticket: TASK-NNN / FEAT-NNN / FIX-NNN / EPIC-XXX -->
Ref:
