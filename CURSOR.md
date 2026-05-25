# CURSOR.md

> Cursor IDE 专用入口，精简版 EKET 规则

## 身份确认

读 `.eket/IDENTITY.md` 确认角色（Master 或 Slaver）

## 核心命令

```bash
eket task:claim [id]     # 领取任务
eket gate:review         # 提交前检查
eket task:complete       # 完成任务
```

## 行为准则

1. **Think Before Coding** — 先列假设，有疑问就问
2. **Simplicity First** — 只写解决问题需要的代码
3. **Surgical Changes** — 只改必须改的
4. **Goal-Driven** — 定义可验证的成功标准

## 分支策略

所有改动在 `feature/*` 分支，禁止直接提交主分支

## 详细规则

- 完整规则见 `CLAUDE.md`
- 反模式库见 `.claude/skills/eket/references/anti-patterns.md`
