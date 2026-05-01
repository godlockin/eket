# TASK-110a: task:create 命令 - Socratic 引导式 ticket 创建

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P1
- **负责人**: Slaver
- **创建时间**: 2026-04-20
- **完成时间**: 2026-04-20
- **依赖**: 无

## 背景

新建 `task:create` 命令，接受原始描述，AI 推断补全 + Socratic 引导。无需 LLM API，使用规则推断。

## 详细描述

从描述关键词推断 type 和 priority，检测缺口后通过 readline 交互式补全，自动计算下一个 TASK 编号，生成含澄清记录章节的 ticket 文件。

## 验收标准

- [x] inferType: bug/fix → bug，重构 → refactor，文档 → chore，其余 → feature
- [x] inferPriority: 紧急/P0/生产 → P0，重要/P1 → P1，其余 → P2
- [x] 描述 < 50 字 → 询问详细描述
- [x] 验收标准为空 → 询问
- [x] 自动扫描 jira/tickets/ 计算下一个编号
- [x] ticket 含澄清记录章节
- [x] ≥3 单测，全部通过

## 实现

- `node/src/commands/task-create.ts` — 主实现
- `node/tests/commands/task-create.test.ts` — 19 个单测
- `node/src/index.ts` — 注册命令

## PR

https://github.com/godlockin/eket/pull/118
