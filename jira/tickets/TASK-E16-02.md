# TASK-E16-02: Hook Profile 分层

**EPIC**: EPIC-016  
**状态**: ready  
**优先级**: P0  
**预估**: 2d  
**负责人**: 待分配  
**依赖**: 无

---

## 背景

借鉴 ECC 的 Hook Profile 机制，支持按环境差异化配置 hooks。

## 目标

实现三档 hook profile + 细粒度禁用机制。

## 范围

### 1. Profile 定义

| Profile | 场景 | 启用的 Hooks |
|---------|------|-------------|
| `minimal` | 快速开发/调试 | 仅安全类（secret scan） |
| `standard` | 日常开发（默认） | 安全 + 质量门禁 |
| `strict` | PR/发布前 | 全部 hooks |

### 2. 环境变量

```bash
# Profile 选择
EKET_HOOK_PROFILE=minimal|standard|strict  # 默认 standard

# 细粒度禁用
EKET_DISABLED_HOOKS=fact-forcing,pr-size  # 逗号分隔

# 调试
EKET_HOOK_DEBUG=true  # 输出 hook 执行日志
```

### 3. 实现

```typescript
// node/src/hooks/hook-flags.ts
export function shouldRunHook(hookId: string, options: HookOptions): boolean {
  const profile = getHookProfile(); // 从环境变量
  const disabledList = getDisabledHooks();
  
  if (disabledList.includes(hookId)) return false;
  if (!options.profiles.includes(profile)) return false;
  
  return true;
}

// hook 定义时指定 profiles
const factForcingHook = {
  id: 'fact-forcing',
  profiles: ['standard', 'strict'], // minimal 不启用
  run: async () => { ... }
};
```

### 4. 配置文件

```yaml
# .eket/hooks.yml
profiles:
  minimal:
    - secret-scan
  standard:
    - secret-scan
    - fact-forcing
    - pr-size-check
  strict:
    - secret-scan
    - fact-forcing
    - pr-size-check
    - lint-check
    - test-coverage
```

## 验收标准

- [ ] `EKET_HOOK_PROFILE=minimal` 时仅运行安全 hooks
- [ ] `EKET_DISABLED_HOOKS=x,y` 可禁用指定 hooks
- [ ] `EKET_HOOK_DEBUG=true` 输出执行日志
- [ ] 默认 profile 为 `standard`
- [ ] 单元测试覆盖 profile 切换

## 技术要点

- 参考 ECC `scripts/lib/hook-flags.js`
- Profile 优先级：环境变量 > 配置文件 > 默认值
- 日志格式：`[HOOK:profile:hookId] message`

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-05-27 | 创建 Ticket | Master |
