## 变更描述

<!-- 简述做了什么，为什么这样做 -->

## Artifact Verification (4-Level)

- [ ] L1 存在性：所有声称新增/修改的文件在 diff 中可见
- [ ] L2 实质性：无空函数体、无纯占位 stub（如有特殊原因请说明）
- [ ] L3 接线：新增模块已被正确 import/注册/export
- [ ] L4 数据流：核心路径有非纯-mock 的测试（如不适用请注明原因）

## 验证证据（必填，禁止 mock）

> ⚠️ 无真实输出 = Master 直接 reject，不看代码

**测试命令输出**（粘贴 `npm test | tail -10` 的真实 stdout）：

```
<!-- 在此粘贴输出，不得改写 -->
```

**验证清单**：

- [ ] 已运行真实测试（非 mock），命令输出已粘贴在上方
- [ ] 无新增 `jest.mock` / `jest.spyOn` 替换真实服务调用（或已说明理由）
- [ ] CI 绿灯（PR 底部 check 通过）

## 类型

- [ ] feat：新功能
- [ ] fix：Bug 修复
- [ ] refactor：重构（不影响功能）
- [ ] test：测试
- [ ] docs：文档
- [ ] chore：构建 / 依赖 / 配置

## 相关 Ticket

<!-- TASK-xxx 或 FEAT-xxx -->

## Master Review 注意事项

<!-- 有哪些地方需要重点审查，或者有争议的决策 -->
