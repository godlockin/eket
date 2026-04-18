---
id: TASK-062
title: "fix(ci): PR template 路径冲突 + 补全缺失检查项"
priority: P2
status: ready
assignee: devops_dev
dispatched_by: master
created_at: 2026-04-18
---

## 背景

存在两个 PR template 文件，路径冲突：
- `.github/pull_request_template.md`（原有，938B）— GitHub 实际加载的
- `.github/PULL_REQUEST_TEMPLATE/pull_request_template.md`（新增）— **实际不会被加载**（GitHub 规则：根目录 template 优先）

新 template 内容包含 4-Level Artifact Verification 等有价值内容，但因路径错误等于无效。

同时新 template 缺少：
- 回滚方案（旧 template 有）
- AI-Review 字段（旧 template 有，用于 block-self-loop 校验）

## 验收标准

- [ ] 删除 `.github/PULL_REQUEST_TEMPLATE/pull_request_template.md`
- [ ] 将新 template 的有价值内容（4-Level Verification、禁止 mock 等）合并进根目录 template
- [ ] 合并后 template 包含：变更类型、Ticket 关联、AC 勾选、4-Level Verification、AI-Review 字段、回滚方案、CI 绿灯要求
- [ ] 在一个测试 PR 中确认 template 正确加载
