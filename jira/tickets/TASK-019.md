# TASK-019: 已有项目初始化脚本 (init-existing)

**类型**: TASK
**状态**: done
**创建日期**: 2026-04-09
**完成日期**: 2026-04-09
**作者**: Master

---

## 需求描述

为已经开发一半的项目提供安全的 EKET Master 初始化能力，支持深度分析团队（9角色并行）。

## 验收标准

- [x] `scripts/init-existing.sh` - 5阶段安全初始化，不覆盖现有文件
- [x] `scripts/analyze-existing.sh` - 9角色深度分析，生成 DISPATCH.md
- [x] 9个角色模板：product/dev/security/blueteam/redteam/architect/tester/devops/end_user
- [x] end_user 动态用户画像推断 + 竞品视角声明
- [x] blueteam 增加业务连续性 + 竞品威胁建模
- [x] redteam 独立角色：攻击面 + 业务逻辑漏洞 + 供应链
- [x] CLAUDE.md 追加而非覆盖（idempotent）
- [x] .gitignore 追加（不重复）
- [x] python3 heredoc 替换多行占位符
- [x] 集成测试通过 / Node 1079/1079 无回归

## 产出文件

| 文件 | 说明 |
|------|------|
| `scripts/init-existing.sh` | 已有项目初始化 |
| `scripts/analyze-existing.sh` | 深度分析 + DISPATCH 生成 |
| `template/.eket/analysis-roles/product.md` | 产品经理角色模板 |
| `template/.eket/analysis-roles/dev.md` | 开发工程师角色模板 |
| `template/.eket/analysis-roles/security.md` | 安全工程师角色模板 |
| `template/.eket/analysis-roles/blueteam.md` | 蓝队角色模板 |
| `template/.eket/analysis-roles/redteam.md` | 红队角色模板（新增） |
| `template/.eket/analysis-roles/architect.md` | 架构师角色模板 |
| `template/.eket/analysis-roles/tester.md` | 测试工程师角色模板 |
| `template/.eket/analysis-roles/devops.md` | DevOps 角色模板 |
| `template/.eket/analysis-roles/end_user.md` | 终端用户角色模板（动态画像） |
| `docs/plans/2026-04-09-init-existing-design.md` | 设计文档 |
| `docs/plans/2026-04-09-init-existing-plan.md` | 实施计划 |

## 框架反哺价值

1. **9角色扩展** → `init-project.sh` 可扩充 Slaver 角色类型
2. **end_user 画像推断** → `instance:start` 自动检测用户角色
3. **多角色 alignment 模式** → Master PR review 可并行多角色审查
4. **DISPATCH.md 模式** → 可通用化为 subagent 调度模板
