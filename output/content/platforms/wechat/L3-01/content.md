# 为什么选择三仓分离？

> 平台：微信公众号
> 定位：L3 决策说明
> 阅读时间：5分钟

---

## 🤔 背景

一个项目，三个仓库：

```
confluence/   # 知识库（文档、经验、决策）
jira/         # 任务管理（tickets、epics）
code_repo/    # 代码（源码、配置、脚本）
```

为什么不放一起？

---

## ❌ 单仓痛点

### 1. Git 历史污染

```
git log --oneline

a1b2c3d 更新文档
b2c3d4e 修复bug
c3d4e5f 更新ticket状态
d4e5f6g 实现功能
e5f6g7h 更新会议纪要
f6g7h8i 修复typo
...
```

代码变更和文档变更混在一起：
- 找代码变更要翻一堆文档 commit
- 代码审核要跳过大量无关内容
- bisect 效率极低

### 2. 权限难管理

```
开发同学: 能改代码，能看文档
PM同学:   只能看代码，能改文档
运营同学: 只能看文档
```

单仓很难做到这种细粒度权限。

### 3. CI/CD 触发混乱

```yaml
# 单仓 CI
on:
  push:
    paths:
      - 'src/**'
      - '!docs/**'      # 排除文档
      - '!jira/**'      # 排除任务
      - '!confluence/**'  # 排除知识库
```

配置越来越复杂，还容易漏。

### 4. 克隆时间长

```bash
# 单仓（含所有历史文档）
git clone repo  # 500MB, 3分钟

# 纯代码仓
git clone code_repo  # 50MB, 20秒
```

新人 onboarding、CI 环境都被拖慢。

---

## ✅ 三仓优势

### 1. 职责清晰

| 仓库 | 职责 | 变更频率 |
|------|------|---------|
| confluence | 知识沉淀 | 低 |
| jira | 任务跟踪 | 中 |
| code_repo | 代码开发 | 高 |

**各管各的，互不干扰。**

### 2. 权限独立

```
code_repo:
  - developers: write
  - reviewers: admin
  
confluence:
  - all: write
  
jira:
  - pm: write
  - developers: read
```

### 3. CI/CD 简洁

```yaml
# code_repo CI
on:
  push:
    branches: [main]
# 所有 push 都是代码变更，直接跑测试
```

### 4. 选择性克隆

```bash
# 开发：只要代码
git clone code_repo

# 学习：只要文档
git clone confluence

# PM：只要任务
git clone jira
```

---

## 🔗 如何关联？

### Git Submodule（不推荐）

```bash
# 繁琐的同步
git submodule update --init --recursive
git submodule foreach git pull origin main
```

问题：
- 操作复杂
- 版本锁定烦人
- 新人经常忘记

### 符号链接（EKET 方案）

```bash
# 项目根目录
project/
├── code_repo/          # git clone
├── confluence/ -> ../confluence  # 符号链接
└── jira/ -> ../jira    # 符号链接
```

优点：
- 操作简单
- 独立版本管理
- 路径引用自然

### 脚本同步

```bash
# scripts/sync-repos.sh
#!/bin/bash

cd confluence && git pull
cd ../jira && git pull
cd ../code_repo && git pull
```

一键同步，定期执行。

---

## 🏗️ 实际布局

```
~/projects/eket/
├── eket/              # 代码仓库（主仓）
│   ├── node/          # Node.js 源码
│   ├── rust/          # Rust 源码
│   ├── scripts/       # 脚本
│   └── .git/
│
├── confluence/        # 知识库仓库
│   ├── memory/        # 经验教训
│   ├── architecture/  # 架构文档
│   ├── requirements/  # 需求文档
│   └── .git/
│
└── jira/              # 任务仓库
    ├── tickets/       # 任务卡片
    ├── epics/         # 史诗
    ├── sprints/       # 迭代
    └── .git/
```

### 跨仓引用

代码中引用知识：

```typescript
// node/src/core/task-manager.ts

/**
 * 任务领取逻辑
 * 
 * 设计文档: confluence/architecture/task-flow.md
 * 相关教训: confluence/memory/pitfalls/race-condition.md
 */
export async function claimTask(taskId: string) {
  // ...
}
```

任务中引用代码：

```markdown
# TASK-042: 实现用户登录

## 相关代码
- `node/src/core/auth.ts`
- `rust/crates/eket-core/src/auth.rs`

## 参考文档
- `confluence/requirements/EPIC-005-auth.md`
```

---

## ⚠️ 注意事项

### 1. 保持路径稳定

```bash
# ❌ 不要随意移动仓库
mv confluence docs  # 会破坏所有引用

# ✅ 固定目录结构
~/projects/eket/
├── eket/
├── confluence/
└── jira/
```

### 2. 同步时机

```
代码发布 → 同步 confluence（更新文档）
任务完成 → 同步 jira（更新状态）
```

### 3. 备份策略

```bash
# 三个仓库都要备份
for repo in eket confluence jira; do
  git -C $repo push backup main
done
```

---

## 📊 效果对比

| 指标 | 单仓 | 三仓 |
|------|------|------|
| 克隆时间 | 3分钟 | 20秒（仅代码）|
| CI 触发 | 需要 path 过滤 | 直接触发 |
| 权限管理 | 复杂 | 简单 |
| 历史搜索 | 混杂 | 清晰 |
| 维护成本 | 中 | 低 |

---

## 💡 总结

**三仓分离的核心思想：按变更频率和职责分离。**

- 代码：高频变更，需要 CI/CD
- 任务：中频变更，需要状态追踪
- 知识：低频变更，需要长期保存

分开管理，各司其职。

---

## 🚀 下一篇预告

**《Rust vs Node.js：性能与开发效率的平衡》**

为什么用两种语言？什么时候用 Rust，什么时候用 Node.js？

---

#架构设计 #Git #代码组织 #最佳实践 #工程管理
