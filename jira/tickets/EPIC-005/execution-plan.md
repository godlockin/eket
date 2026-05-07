# EPIC-005 执行计划（Master 最终版）

**制定时间**: 2026-05-07 13:00  
**Master**: 基于 3 份专家评审（DevOps + 架构师 + CLI UX 简化版）  
**状态**: ready_to_execute  

---

## 📊 专家评审总结

| 专家 | 状态 | 关键发现 |
|------|------|---------|
| **DevOps** | ✅ 完成 | 🔴 P0: setup.sh 缺 sha256 校验 |
| **架构师** | ✅ 完成 | 🔴 P0: TS 编译错误 + ncc 不可行（需决策 pkg） |
| **CLI UX** | ⚠️ 超时 | Master 补充简化版评审 |

**评审文档**:
- `confluence/devops/EPIC-005-cicd-review.md`
- `confluence/architecture/EPIC-005-architecture-review.md`
- `confluence/ux/EPIC-005-cli-ux-review.md`

---

## 🔴 发现的 P0 阻塞问题

### 1. 安全风险（TASK-426）
- **问题**: `scripts/setup.sh` 下载预编译包无 sha256 校验
- **风险**: MITM 攻击 / 供应链污染
- **修复工时**: 2h
- **阻塞**: 所有后续 TASK

### 2. 编译错误（TASK-427）
- **问题**: `complete.ts:558` 调用不存在的 `db.run()` 方法
- **影响**: 无法编译 → 无法测试 ncc 打包
- **修复工时**: 0.5h
- **阻塞**: TASK-420 Node 预编译

---

## ⚖️ 架构决策：Node 预编译方案

### 问题
`better-sqlite3` native addon 无法用 ncc 打包。

### Master 决策（基于架构师推荐）

**采用方案 D：双轨制（pkg + npm fallback）**

**理由**:
1. ✅ 满足"一键安装"需求（pkg 预编译包）
2. ✅ 容错能力强（fallback 到 npm install）
3. ✅ 体积可接受（50 MB Node 版 vs 10 MB Rust 版，用户可选）
4. ✅ 向后兼容（保留旧安装方式）

**执行调整**:
- **TASK-420**: 使用 `pkg` 替代 `ncc`
- **TASK-416**: 安装脚本添加 `npm install` fallback 逻辑
- 工作量：6-8h（从 6h 增至 8h）

**决策文档**: `confluence/decisions/EPIC-005-node-precompile-decision.md`

---

## 📋 最终任务清单（12 个 TASK）

### M0: 紧急修复（并行执行）🔴 P0
| TASK | 工时 | 描述 | 优先级 |
|------|------|------|-------|
| **TASK-426** | 2h | 修复 setup.sh sha256 校验缺失 | 🔴 P0 |
| **TASK-427** | 0.5h | 修复 complete.ts 编译错误 | 🔴 P0 |

**阻塞**: M1/M2 所有 TASK 需等待 M0 完成

---

### M1: 核心安装流程（3 天）
| TASK | 工时 | 描述 | 依赖 |
|------|------|------|------|
| **TASK-417** | 4h | sha256 校验逻辑 | TASK-426 ✅ |
| **TASK-418** | 6h | 本地编译 fallback | 无 |
| **TASK-416** | 8h → **10h** | 引导安装脚本（增加 npm fallback） | 417 + 418 |
| **TASK-419** | 4h | Claude 命令注册 | 416 |

**M1 总工时**: 24h → **26h**

---

### M2: GitHub Actions（1 天）
| TASK | 工时 | 描述 | 依赖 |
|------|------|------|------|
| **TASK-420** | 6h → **8h** | Node 预编译 job（**pkg 打包**） | TASK-427 ✅ |
| **TASK-421** | 4h | asset 命名 + sha256 生成 | 420 |
| **TASK-422** | 4h | 跨平台测试 | 421 |

**M2 总工时**: 14h → **16h**

---

### M3: 用户体验（1 天）
| TASK | 工时 | 描述 | 依赖 |
|------|------|------|------|
| **TASK-423** | 2h | Skill description 更新 | 419 |
| **TASK-424** | 6h | `eket doctor` 验证 | 416 |
| **TASK-425** | 4h | 文档更新 | 423 + 424 |

**M3 总工时**: 12h

---

## 🚀 执行策略（3 Slaver 并行）

### Phase 0（Day 0，紧急修复）
**时间**: 2-3 小时  
**并行**:
- Slaver A: TASK-426（setup.sh sha256）
- Slaver B: TASK-427（complete.ts 编译）

**阻塞点**: 全部完成后才能继续 Phase 1

---

### Phase 1（Day 1-2）
**时间**: 2 天  
**并行**:
- Slaver A: TASK-417（sha256 逻辑）→ TASK-416（引导安装）
- Slaver B: TASK-418（本地编译）→ TASK-420（pkg 打包）
- Slaver C: TASK-421（asset 规范）

**串行**:
- TASK-416 依赖 417
- TASK-420 依赖 427 完成
- TASK-421 依赖 420

---

### Phase 2（Day 3）
**时间**: 1 天  
**并行**:
- Slaver A: TASK-419（Claude 注册）→ TASK-423（Skill）
- Slaver B: TASK-422（跨平台测试）
- Slaver C: TASK-424（eket doctor）

---

### Phase 3（Day 4）
**时间**: 0.5 天  
**串行**:
- Slaver A: TASK-425（文档更新，依赖 423 + 424）

---

## 📐 总工时与预估

| 项目 | 工时 | 说明 |
|------|------|------|
| **M0 紧急修复** | 2.5h | 并行执行 |
| **M1 核心** | 26h | 3 Slaver 并行 → 实际 ~12h |
| **M2 CI/CD** | 16h | 2 Slaver 并行 → 实际 ~10h |
| **M3 UX** | 12h | 2 Slaver 并行 → 实际 ~8h |
| **总计** | **56.5h** | 3 Slaver → 实际 **4-5 天** |

**工作量调整**:
- 原预估：48h（3-5 天）
- 新增：M0 紧急修复（2.5h）+ pkg 打包复杂度（+8h）
- 最终：**56.5h**（仍在 5 天内）

---

## ✅ Milestone 验收标准（不变）

### M0 Done
- [ ] `scripts/setup.sh` 有 sha256 校验
- [ ] `cd node && npm run build` 编译成功

### M1 Done
- [ ] `install.sh` 显示 5 级菜单
- [ ] 选择 [1] 后 `eket --version` 输出版本
- [ ] `/eket` 命令在 Claude Code 可用

### M2 Done
- [ ] GitHub Release 有 **pkg 打包的 Node 版**（3 平台）
- [ ] 每个 asset 有 `.sha256` 文件
- [ ] 跨平台测试全绿

### M3 Done
- [ ] `eket doctor` 输出 8 项检查
- [ ] README 更新一键安装命令
- [ ] `docs/installation.md` 创建完成

---

## 🎯 下一步（立即执行）

1. **初始化 Slaver 团队**（3 个实例）
2. **分配 M0 任务**:
   - Slaver A → TASK-426
   - Slaver B → TASK-427
3. **等待 M0 完成**后继续 Phase 1
4. **Master 监控**: 每 6 小时检查进度，识别阻塞

---

**Master 签发**: 2026-05-07 13:00  
**执行开始**: 待 Slaver 团队就绪
