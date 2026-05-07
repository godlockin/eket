# TASK-423: Skill description 更新（间接触发）

**EPIC**: EPIC-005 | **Milestone**: M3 | **优先级**: P1 | **工时**: 2h | **状态**: ready | **依赖**: TASK-419

## 需求
更新 `.claude/skills/eket/SKILL.md` frontmatter，添加"召唤 EKET 团队"等触发关键词。

## AC
- **AC-1**: frontmatter 更新
  - Given: 编辑 SKILL.md
  - When: 更新 `description` 字段
  - Then: 包含关键词"召唤 EKET 团队、启动 eket、多智能体协作"

- **AC-2**: Claude 匹配测试
  - Given: 用户在 Claude Code 输入"召唤 EKET 团队"
  - When: Claude 搜索 skills
  - Then: 自动推荐 `eket` skill

## 技术方案
```yaml
---
name: eket
description: |
  EKET AI 智能体协作框架 (Master-Slaver 架构)
  
  触发关键词：
  - 召唤 EKET 团队
  - 启动 eket
  - 多智能体协作
  - eket 框架
  - 任务拆解 + 分配
  
  用途：需求分析、任务拆解、代码开发、PR 审核、进度跟踪
---
```

## 交付物
- [ ] `.claude/skills/eket/SKILL.md` 更新
- [ ] 测试 Claude 自动推荐
- [ ] 文档更新（如何通过自然语言唤醒）
