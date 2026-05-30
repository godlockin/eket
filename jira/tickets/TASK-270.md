---
id: TASK-270
title: 建立失败日志系统 - 系统化记录项目失败教训
type: task
status: backlog
priority: P0
created: 2026-05-29
estimated_hours: 2
assignee: unassigned
labels: [knowledge-management, technical-debt, retrospective]
---

# TASK-270: 建立失败日志系统

## 背景

基于深层复利分析 (#4 Failure Archive),当前缺少系统化的失败记录机制:
- 过去的失败项目经验未沉淀
- 无法快速判断"这个方案我试过,不行"
- 技术进步后无法自动提示"X现在可行了"

## 目标

构建Failure Archive系统,将失败转化为资产。

## 验收标准

- [ ] `confluence/failure-archive/` 目录结构创建
- [ ] 失败案例模板 `confluence/failure-archive/TEMPLATE.md`
- [ ] 至少3个失败案例documented:
  - [ ] skeleton_analysis (MediaPipe性能不足)
  - [ ] [用户提供项目2]
  - [ ] [用户提供项目3]
- [ ] 索引文件 `confluence/failure-archive/index.md`
- [ ] (Optional) 自动检测at-risk项目脚本 `scripts/detect-at-risk-projects.sh`

## Deliverables

1. **README.md** - Failure Archive使用指南
2. **TEMPLATE.md** - 失败案例标准模板
3. **skeleton-analysis.md** - 第一个失败案例
4. **[project-2].md** + **[project-3].md** - 另外2个案例
5. **index.md** - 失败案例索引(按类型/原因分类)
6. **memory-index.md更新** - 添加failure-archive索引

## 技术方案

### 目录结构
```
confluence/
├── memory/          (已有)
└── failure-archive/ (新建)
    ├── README.md
    ├── TEMPLATE.md
    ├── index.md
    ├── skeleton-analysis.md
    ├── [project-2].md
    └── [project-3].md
```

### 失败案例模板结构
```markdown
# 失败案例 #NNN: [项目名]

## 初始目标
- [当时的愿景]

## 失败原因
1. **技术债**: [具体问题]
2. **范围蠕变**: [如何失控]
3. **外部依赖**: [被什么阻塞]

## 从中学到
- ✅ 应该: [教训]
- ❌ 不要: [反模式]

## 未来可以复活吗?
- [技术进步检查]
- [值得重新评估吗]

## 关联项目
- 类似失败: [...]
- 成功案例: [...]
```

### 自动检测at-risk项目(Optional)
```bash
# 检测条件:
# - last_commit > 90天
# - unresolved_todos > 10
# - 依赖库6个月无更新
```

## 依赖

需要用户提供:
- 另外2个失败/放弃的项目名称
- 每个项目的失败原因概要

## 预估工时

- 目录结构+模板: 30分钟
- skeleton_analysis案例: 30分钟
- 另外2个案例: 60分钟(各30分钟)
- 索引+README: 30分钟
- (Optional)检测脚本: 30分钟

**Total: 2-2.5小时**

## 相关文档

- `/Users/chenchen/working/claude_analysis/04_深层复利机会.md` - #4 失败日志系统
- `confluence/memory/lessons/borrowing-methodology.md` - 提取方法论
- `confluence/memory/retrospectives/` - 已有复盘经验
