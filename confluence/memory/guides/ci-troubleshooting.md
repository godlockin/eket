# CI 故障排查手册

**创建时间**: 2026-05-01
**适用范围**: GitHub Actions CI 红灯的快速定位与修复

---

## 快速诊断流程

```
CI 红灯
  ↓
哪个 step 失败？
  ├── npm install → §1 依赖问题
  ├── npm run build → §2 编译问题
  ├── npm test → §3 测试问题
  ├── lint/format → §4 代码风格
  ├── check-pr-size → §5 PR 体积
  └── anatomy-check → §6 Skill 文档格式
```

---

## 1. 依赖问题（npm install 失败）

| 症状 | 原因 | 修复 |
|------|------|------|
| `ERESOLVE` peer dependency conflict | 依赖版本不兼容 | `npm install --legacy-peer-deps` 或更新 lockfile |
| `npm ERR! 404` | 包名拼写错误或已下架 | 检查 package.json 中包名 |
| `EACCES permission denied` | CI runner 权限 | 检查 workflow 的 `permissions` 配置 |

---

## 2. 编译问题（npm run build 失败）

| 症状 | 原因 | 修复 |
|------|------|------|
| `Cannot find module 'xxx'` | 缺失 import 的模块 | 检查是否漏提交文件；ESM 需要 `.js` 扩展名 |
| `Type 'X' is not assignable to 'Y'` | 类型不兼容 | 检查接口定义变更 |
| `Property 'x' does not exist` | 新增字段未标 `?:` | 跨分支回灌时标为可选 |

**常见陷阱**：ESM 规范要求内部导入带 `.js` 扩展名，TypeScript 编译不会自动加。

---

## 3. 测试问题（npm test 失败）

| 症状 | 原因 | 修复 |
|------|------|------|
| 特定 test case FAIL | 逻辑 bug 或断言过期 | 读 error message，修复代码或更新断言 |
| `open handles` 警告 | 异步资源未清理（timer/connection） | afterAll 中 release；lockfile 设 `update: undefined` |
| 随机 FAIL（flaky） | 时序依赖、并发竞争 | 加 `jest.setTimeout()`、隔离测试状态 |
| `Cannot find module` in test | mock 路径错误 | 检查 `jest.config` 的 `moduleNameMapper` |

---

## 4. 代码风格（lint/format 失败）

```bash
npm run lint -- --fix   # 自动修复 ESLint 问题
npm run format          # Prettier 格式化
```

如果 lint 和代码逻辑冲突，用 `// eslint-disable-next-line <rule>` 局部禁用，附注释说明原因。

---

## 5. PR 体积超限（check-pr-size 失败）

- ≤ 100 行：pass
- 100~500 行：warn（建议拆分）
- \> 500 行：fail（需 `Approved-Large-PR-By: master-001` trailer）

**拆分策略**：
1. 按功能拆：核心逻辑 / 测试 / 文档各一个 PR
2. 按层拆：类型定义 → 实现 → 接线 → 测试
3. 生成代码单独 PR（codemod 输出、migration）

---

## 6. Skill 文档格式（anatomy-check 失败）

```bash
bash scripts/check-skill-anatomy.sh <file>        # 单文件
bash scripts/check-skill-anatomy.sh --all          # 全量
```

默认专家需 7 节（Overview → When to Use → When NOT → Process → Rationalizations → Red Flags → Verification）。Optional 专家需后 3 节。

---

## 7. GitHub Actions 特有问题

| 症状 | 原因 | 修复 |
|------|------|------|
| Workflow 不触发 | yml 不在默认分支 | 确保 `.github/workflows/` 在默认分支 |
| Node.js 版本不匹配 | matrix 未包含目标版本 | 更新 strategy.matrix.node-version |
| `actions/checkout` 浅克隆 | 无法访问完整 git history | 加 `fetch-depth: 0` |

---

**参见**：
- `scripts/check-pr-size.sh` — PR 体积检查
- `scripts/check-skill-anatomy.sh` — Skill 文档格式检查
- `.github/workflows/` — CI 配置
