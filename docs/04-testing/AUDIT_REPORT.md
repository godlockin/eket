# EKET 框架审计与修复报告

**审计日期**: 2026-03-23
**审计版本**: v0.5.0 → v0.6.0
**审计范围**: 全框架文档、脚本、配置

---

## 问题汇总

| 类别 | 数量 | 严重性 |
|------|------|--------|
| 版本不一致 | 5 | 中 |
| 术语不一致 | 2 | 高 |
| 脚本路径错误 | 3 | 高 |
| 缺失 Skill 文件 | 1 | 低 |
| set -e 风险 | 11 | 中 |
| 未跟踪文件 | 1 | 低 |

---

## 1. 版本不一致问题 ⚠️

### 发现的问题

| 文件 | 当前版本 | 应为版本 | 状态 |
|------|---------|---------|------|
| `CLAUDE.md` | v0.5.0 | v0.6.0 | 需更新 |
| `docs/02-architecture/SKILLS_SYSTEM.md` | v0.2.0 | v0.6.0 | 需更新 |
| `docs/02-architecture/MASTER_SLAYER_ROLES.md` | v0.4.0 | v0.6.0 | 需更新/归档 |
| `docs/01-getting-started/DESIGN_PHILOSOPHY.md` | v0.5.0 | v0.6.0 | 需更新 |
| `template/.eket/version.yml` | 待确认 | v0.6.0 | 需更新 |
| `docs/05-reference/expert-review.md` | v0.1.0 | 归档 | 需归档 |

### 影响

- 用户可能阅读到过期文档
- 版本历史混乱
- 新功能未在旧文档中说明

### 修复方案

1. 更新所有文档版本到 v0.6.0
2. 归档 v0.1-v0.4 的旧文档到 `docs/archive/`
3. 在 README.md 中添加版本说明

---

## 2. 术语不一致问题 🔴

### 问题描述

框架中存在两套术语系统混用：

| 术语系统 | 使用位置 | 状态 |
|---------|---------|------|
| **Master/Slaver** | MASTER_SLAYER_ROLES.md, 部分脚本 | ❌ 已弃用 |
| **Coordinator/Executor** | CLAUDE.md v0.5+, 新文档 | ✅ 推荐 |
| **去中心化 Agent** | DESIGN_PHILOSOPHY.md | ✅ 推荐 |

### 风险

1. **概念混淆**: 新用户阅读不同文档会得到不同架构理解
2. **实现偏差**: 开发者可能按照过时术语实现
3. **维护困难**: 两套术语增加维护成本

### 修复方案

1. 归档 `MASTER_SLAYER_ROLES.md` 到 `docs/archive/`
2. 在归档文件中添加"已弃用"说明
3. 更新脚本中的 Master/Slaver 引用
4. 创建术语迁移指南

---

## 3. 脚本路径错误 🔴

### load-agent-profile.sh (第 100 行)

**问题代码**:
```bash
SKILL_FILE="skills/${skill}.yml"
```

**实际路径**:
```
template/skills/requirements/user_interview.yml
template/skills/design/api_design.yml
```

**影响**: Skill 文件检查始终失败，Skills 加载逻辑无效

**修复**:
```bash
SKILL_FILE="template/skills/${skill}.yml"
# 或根据 skill 自动推断分类
SKILL_FILE="template/skills/$(echo $skill | cut -d'/' -f1)/${skill}.yml"
```

### 其他路径问题

| 脚本 | 问题路径 | 正确路径 | 状态 |
|------|---------|---------|------|
| load-agent-profile.sh | skills/${skill}.yml | template/skills/... | 需修复 |
| load-dynamic-agent.sh | template/agents/dynamic/ | ✅ 正确 | 正常 |

---

## 4. 缺失 Skill 文件 ⚠️

### SKILLS_SYSTEM.md 中定义但缺失

| Skill | 分类 | 状态 |
|------|------|------|
| `user_story_mapping` | requirements | ❌ 缺失 |
| `ui_ux_design` | design | ❌ 缺失 |
| `icon_design` | design | ❌ 缺失 |
| `integration_test` | testing | ❌ 缺失 |
| `performance_test` | testing | ❌ 缺失 |
| `kubernetes_deploy` | devops | ❌ 缺失 |
| `monitoring_setup` | devops | ❌ 缺失 |
| `user_guide` | documentation | ❌ 缺失 |
| `release_notes` | documentation | ❌ 缺失 |

### 影响

- 文档与实际不一致
- Agent 配置引用这些 Skills 时会失败

### 修复方案

**优先级 1** (核心技能):
- [ ] user_story_mapping.yml
- [ ] integration_test.yml

**优先级 2** (扩展技能):
- [ ] ui_ux_design.yml
- [ ] kubernetes_deploy.yml

**优先级 3** (可选技能):
- [ ] icon_design.yml
- [ ] performance_test.yml
- [ ] monitoring_setup.yml
- [ ] user_guide.yml
- [ ] release_notes.yml

---

## 5. set -e 风险 ⚠️

### 使用 set -e 的脚本 (11 个)

```
scripts/init-project.sh
scripts/cleanup-project.sh
scripts/recommend-tasks.sh
scripts/manage.sh
scripts/load-agent-profile.sh
scripts/init-three-repos.sh
scripts/start.sh
scripts/prioritize-tasks.sh
scripts/load-dynamic-agent.sh
scripts/init.sh
scripts/cleanup-idle-agents.sh
```

### 风险

`set -e` 导致脚本在第一个错误处立即退出，可能：
1. 清理脚本中途退出，留下脏数据
2. 初始化脚本部分完成，状态不一致
3. 错误信息不清晰，难以调试

### 已处理的脚本 ✅

- `tests/run-unit-tests.sh` - 已移除 `set -e`，使用显式错误处理
- `scripts/prioritize-tasks.sh` - 使用 `set -e` 但有适当处理
- `scripts/recommend-tasks.sh` - 使用 `set -e` 但有适当处理

### 建议

1. 移除 `set -e`，使用显式错误检查
2. 或至少在关键操作前使用 `set +e` 临时禁用
3. 添加错误处理和回滚逻辑

---

## 6. 未跟踪文件 ⚠️

### 文件列表

| 文件 | 说明 | 建议 |
|------|------|------|
| `sys_init/目标设定_v1.md` | 原始需求文档 | 移动到 `docs/archive/` 或 `references/` |

---

## 7. 架构设计隐患 🟡

### 7.1 动态 Agent 注册表格式

**问题**: `load-dynamic-agent.sh` 使用 `sed` 修改 YAML

```bash
sed -i '' "/^dynamic_agents:/a\\
$AGENT_ENTRY" "$REGISTRY_FILE"
```

**风险**:
- sed 处理 YAML 不可靠
- 可能导致 YAML 格式错误
- macOS/Linux sed 语法不一致

**建议**: 使用 `yq` 或其他 YAML 解析器

### 7.2 Agent 清理脚本依赖

**问题**: `cleanup-idle-agents.sh` 依赖 grep 解析 YAML

```bash
STATUS=$(grep "^status:" "$agent_file" | cut -d: -f2 | tr -d ' ')
```

**风险**:
- 如果 YAML 格式变化 (如缩进不同)，解析失败
- 无法处理多行值

### 7.3 Skills 加载无缓存

**问题**: 每次加载都读取文件

**建议**: 添加简单的缓存机制

---

## 8. 文档完整性问题 🟡

### 缺少运行时文档

| 文档 | 说明 | 状态 |
|------|------|------|
| `runtime/AGENT_RUNTIME.md` | Agent 运行时行为 | ❌ 缺失 |
| `runtime/COMMUNICATION_PROTOCOL.md` | 通信协议详解 | ❌ 缺失 |
| `runtime/MEMORY_SYSTEM.md` | 记忆系统说明 | ❌ 缺失 |

### 缺少运维文档

| 文档 | 说明 | 状态 |
|------|------|------|
| `ops/DEPLOYMENT.md` | 部署指南 | ❌ 缺失 |
| `ops/MONITORING.md` | 监控配置 | ❌ 缺失 |
| `ops/TROUBLESHOOTING.md` | 故障排查 | ❌ 缺失 |

---

## 9. 配置一致性检查 🟡

### template/.eket/ 配置

需要检查:
- [ ] `config.yml` 中的 Skills 路径是否匹配实际
- [ ] `config.yml` 中的 Agent 配置路径是否匹配
- [ ] 版本是否与主框架一致

---

## 修复优先级

### 立即修复 (P0)

1. ✅ 修复 `load-agent-profile.sh` Skills 路径
2. ✅ 归档/更新 `MASTER_SLAYER_ROLES.md`
3. ✅ 更新所有版本号为 v0.6.0

### 短期修复 (P1)

4. 创建缺失的核心 Skills
5. 移除脚本中的 `set -e` 风险
6. 移动 `sys_init/目标设定_v1.md` 到合适位置

### 中期修复 (P2)

7. 改进动态 Agent 注册表处理
8. 创建运行时文档
9. 创建运维文档

---

## 修复计划

| 迭代 | 内容 | 预计时间 |
|------|------|---------|
| v0.6.1 | P0 修复 | 1 天 |
| v0.6.2 | P1 修复 | 2 天 |
| v0.7.0 | P2 修复 + 新功能 | 1 周 |

---

**报告生成**: EKET Framework Audit Tool
**审核者**: Tech Manager
**状态**: 待修复
