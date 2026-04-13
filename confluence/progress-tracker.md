# EKET Framework - 项目进度追踪

**当前版本**: v2.9.0
**更新时间**: 2026-04-13
**维护者**: Master Agent

---

## 总体进度

| Pillar | 状态 | 完成度 |
|--------|------|--------|
| 测试覆盖 | ✅ 完成 | 1079/1079 (100%) |
| 三级架构 | ✅ 完成 | Level 1/2/3 全部实现 |
| Docker 化 | ✅ 完成 | Dockerfile + docker-compose |
| 文档站 | ✅ 完成 | Docusaurus, 8 篇核心文档 |
| Mindset 注入 | ✅ 完成 | 实例启动时自动注入 |
| Python SDK | ✅ 完成 | sdk/python/ 26/26 tests 通过，7 examples |
| JS SDK | ✅ 完成 | sdk/javascript/ 12/12 tests 通过，6 examples |
| GitHub Actions CI | ✅ 完成 | .github/workflows/ci.yml + test.yml |
| 健康检查端点 | ✅ 完成 | /health /ready /live |
| 分支保护规则 | ✅ 完成 | miao: PR+CI 强制，1人 review |
| SDK 版本策略 | ✅ 完成 | sdk/VERSIONING.md + RELEASING.md x2 |
| SDK Examples | ✅ 完成 | Python 7个 + JS 6个 + README |
| 安全加固 | ✅ 完成 | CORS/Auth/MD5→SHA256 三项修复 |
| 防幻觉机制 | ✅ 完成 | CI gate + PR template + CLAUDE.md 红线 |
| Repo 历史清理 | ✅ 完成 | filter-repo 移除 docs-site 65MB→3.38MB |
| EKET Claude Code Skill | ✅ 完成 | .claude/skills/eket/ + 3篇 references |
| 安装脚本 | ✅ 完成 | scripts/setup.sh 四层 + install-skill.sh |
| 分支策略强制执行 | ✅ 完成 | miao enforce_admins + testing 分支 + CI 覆盖 |
| Agent 专家设定升级 | ✅ 完成 | routing_description + quality_gates + confidence_model |
| 三省六部制度借鉴 | ✅ 完成 | gate_reviewer + independent_auditor + 状态机 + 协议文档 |

---

## Round 历史

| Round | 主题 | 版本 | 状态 |
|-------|------|------|------|
| 1-5 | 初始构建 + 核心功能 | v1.x | ✅ 完成 |
| 6-9 | 质量建设 + 100% 测试 | v2.0-2.2 | ✅ 完成 |
| 10 | CLI 改进 + Mindset 注入 | v2.3.0 | ✅ 完成 |
| 11 | 文档站建设 | v2.3.0 | ✅ 完成 |
| 12 | Docker 化 | v2.3.0 | ✅ 完成 |
| 13a | **清账**：测试 100% + 降级修复 | v2.4.0 | ✅ 完成 |
| 13b | CI/CD + 健康检查 | v2.5.0 | ✅ 完成 |
| 14 | SDK 正式化 + 分支保护 | v2.6.0 | ✅ 完成 |
| 15a | 安全加固 + 防幻觉 + Repo 清理 | v2.7.0 | ✅ 完成 |
| 15b | Skill + Setup + 分支策略 + Agent 专家升级 | v2.8.0 | ✅ 完成 |
| 16a | 三省六部制度借鉴：gate_reviewer + independent_auditor | v2.9.0 | ✅ 完成 |

---

## 当前技术债务

| 问题 | 优先级 | 目标 Round | 状态 |
|------|--------|-----------|------|
| 分支保护规则未配置 | P0 | 14 | ✅ 完成（miao） |
| SDK 版本策略未定义 | P2 | 14 | ✅ 完成（VERSIONING.md） |
| node/package.json 版本与 tag 不同步 | P3 | 持续 | ✅ 已修正（2.6.0） |
| CORS wildcard + credentials 冲突 | P1 | 15a | ✅ 修复（需显式 CORS_ORIGIN） |
| Hook Server 默认无认证 | P1 | 15a | ✅ 修复（requireAuth 默认 true） |
| MD5 用于完整性校验 | P2 | 15a | ✅ 修复（→ SHA256） |
| git 历史含 docs-site build 65MB | P2 | 15a | ✅ filter-repo 清理完成 |

---

## Next Steps (Round 16b — 待规划)

- PyPI 发布：`python3 -m build` + `twine upload` (sdk/python/RELEASING.md)
- npm 发布：`npm pack` + `npm publish` (sdk/javascript/RELEASING.md)
- GitHub Actions 自动发布 workflow（TASK-016 可选项）
- SDK 对外文档整合至 Docusaurus 文档站
- TS 编译错误清理（CI workflow build 步骤，预存技术债）
- ticket-template.md 更新：加入 gate_review 阶段字段（gate_review_veto_count、veto_reason、resubmit_conditions）
- Node.js 实现：gate_reviewer 进程自动触发逻辑（ticket 状态机 hook）

## Round 16a 完成详情（2026-04-13）

### 三省六部制度借鉴

借鉴唐代三省六部制的**制度逻辑**（而非角色命名）到 EKET 框架：

| 制度原型 | EKET 映射 | 核心价值 |
|---------|----------|---------|
| 门下省（封驳） | gate_reviewer | 执行前阻断，有否决权 |
| 御史台（独立监察） | independent_auditor | 绕过 Master 直报 human |
| 三省分权 | 状态机 gate_review 节点 | 将审查嵌入流程，不依赖人工记忆 |

### gate_reviewer（新角色）

- **文件**：`template/agents/reviewer/gate_reviewer/agent.yml`
- **定位**：执行前关卡，在 `ready → in_progress` 间插入阻断点
- **否决政策**：`must_veto`（TBD/无方案/依赖未完成）+ `should_consider_veto`（范围蔓延/无回滚）
- **强制通过**：同一 ticket 否决 ≥ 2 次，第 3 次强制降级通过（死锁防止）
- **超时保护**：30 分钟无响应自动 APPROVE（审查员失联死锁防止）
- **MBTI**：INTJ（建筑师型，预判式思维）

### independent_auditor（新角色）

- **文件**：`template/agents/independent/independent_auditor/agent.yml`
- **定位**：独立审计，不受 Master 指挥，报告直达 human
- **报告链路**：写入 `inbox/human_feedback/`（绕过 Master）
- **防篡改**：审计日志 append-only + SHA256 hash 链（`confluence/audit/independent-audit-log.jsonl`）
- **审计范围**：执行偏差 + Master 决策质量 + gate_reviewer 否决质量 + 系统性风险
- **发现级别**：CRITICAL（立即通知）/ HIGH / MEDIUM / LOW
- **MBTI**：ISTJ（物流师型，极度严谨，不受权威影响）

### 状态机更新

新增 `gate_review` 状态节点：

```
backlog → analysis → ready → gate_review → in_progress → test → pr_review → done
                                              ↓ VETO
                                           analysis（打回）
```

### Inbox 优先级分级

新增指令分级规则（P0/P1/P2）写入 CLAUDE.md，确保战略指令不被埋在任务队列中。

### GATE-REVIEW-PROTOCOL.md

新建 `template/docs/GATE-REVIEW-PROTOCOL.md`，记录：
- 完整流程图和步骤
- 死锁防止机制（含降级通过记录格式）
- independent_auditor 触发协议和防篡改机制
- gate_reviewer 质量监控指标（否决率 10-40% 为健康）

### EKET Claude Code Skill
- **主文件**：`.claude/skills/eket/SKILL.md`（242 行）含 Preamble/Trigger/Commands/References
- **References**：`architecture.md`（架构图+核心模块表）/ `dev-commands.md`（构建/测试/发布命令）/ `setup-guide.md`（四层安装详解+环境变量+FAQ）
- **Preamble**：既存项目深度分析时自动询问团队加载方式（默认组合 vs 引导式）

### 安装脚本
- **`scripts/setup.sh`**：四层分层安装（Level 1 Shell → Level 2 Node.js → Level 3 Docker+Redis → Level 4 SQLite）
  - `--level=N` / `--all` / `--yes` 参数控制，交互式逐层询问
- **`scripts/install-skill.sh`**：团队 Skill 分发脚本，将项目内 Skill 安装至 `~/.claude/skills/eket/`
  - `install / --update / --remove / --status` 四个操作

### 分支策略强制执行
- `miao` 分支：`enforce_admins: true`，PR + CI `test` check 必须 + 1 review
- `testing` 分支：创建，CI 覆盖（push/PR 触发）
- `.github/workflows/test.yml`：触发分支 `[miao, testing]`
- `node/package-lock.json`：从 `.gitignore` 移除并纳入追踪（CI npm cache 依赖）

### Agent 专家设定升级（业界调研后补齐三项 Gap）
- **`routing_description`**（P0，来自 OpenAI Agents SDK）：13 个角色全覆盖，声明"最适合/不适合"供 Master 精准路由
- **`quality_gates`**（P0，CI 质量门概念移植）：代码类含 `code` + `pr_checklist`，文档类含 `doc`
- **`confidence_model`**（P1，业界首创）：high/medium/low/escalate 四档，Agent 自知边界，超出边界必须上报



### 安全加固
1. **CORS 修复** (`node/src/api/eket-server.ts`)
   - 问题：`origin: '*'` + `credentials: true` 违反 CORS spec，浏览器拒绝
   - 修复：未设置 `CORS_ORIGIN` 时完全禁用 CORS（安全默认值）
2. **Hook Server 认证** (`node/src/hooks/http-hook-server.ts`)
   - 问题：`requireAuth ?? isProduction` 导致非 prod 环境默认无认证
   - 修复：`requireAuth ?? true`，仅在显式设置 `requireAuth: false` 时跳过认证
3. **校验和算法** (`node/src/core/optimized-file-queue.ts`)
   - 问题：MD5 用于消息完整性校验，密码学强度不足
   - 修复：→ SHA256

### Master 防幻觉系统
- **CI Gate**：`.github/workflows/test.yml` 激活分支保护已有的 `test` 必须通过 check
- **PR Template**：`.github/PULL_REQUEST_TEMPLATE/pull_request_template.md` 强制贴真实 stdout
- **CLAUDE.md 红线**：5条禁止行为 + 4项 PR Review 强制 checklist

### Repo 历史清理
- `git filter-repo` 彻底移除 `docs-site/{node_modules,build,.docusaurus}`
- 仓库体积：65.40 MiB → 3.38 MiB（-95%）
- `.gitignore` 更新：新增 9 项排除规则
