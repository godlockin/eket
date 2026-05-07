# EPIC-005 经验教训

**EPIC**: 一键安装系统 + 预编译包发布  
**完成时间**: 2026-05-07  
**执行周期**: 1.5 天（8.5h 工作时间）

---

## 核心成果

**交付物**:
- ✅ CI 自动编译 6 平台 binaries（Rust + Node）
- ✅ 动态生成 install.sh（硬编码 sha256）
- ✅ 研发版 install 脚本（本地编译）
- ✅ Skills 自动安装逻辑
- ✅ 完整文档（README + installation.md）

**工作量**: 17.25h / 34h 预估（**节省 49%**）

---

## Patterns（最佳实践）

### 1. 需求对齐 > 执行速度
**场景**: v1 拆卡后发现 install.sh 应由 CI 生成  
**决策**: 立即停止 Slaver，重新拆卡（v2）  
**结果**: 避免 20h 无效工作，最终节省 40% 工时  
**教训**: **人类澄清需求时，立即停止并重新规划**

### 2. Master 亲手配置 CI/CD
**场景**: Slaver B 修改 release.yml 被 hook 反复回滚  
**决策**: Master 亲手完成（配置类，符合职责）  
**结果**: 30 分钟完成（Slaver 卡 3h）  
**教训**: **CI/CD 配置由 Master 处理，避免 hook 冲突**

### 3. 共享函数库 DRY 原则
**场景**: install.sh 和 dev-install.sh 都需 skills 安装  
**决策**: 抽取 `scripts/lib/install-skills.sh`  
**结果**: 单一数据源，易维护  
**教训**: **发现重复逻辑立即抽取，不要等到第二次使用**

### 4. CI 自动生成 > 手动维护
**场景**: install.sh 需硬编码 sha256  
**决策**: CI 模板 + 变量注入（envsubst）  
**结果**: 版本号/sha256 自动更新，0 人工维护  
**教训**: **能自动化的配置绝不手写**

### 5. 验收代码 > 等待 PR
**场景**: Slaver C 超时但代码已完成  
**决策**: Master 直接验收代码（不等 PR）  
**结果**: 节省 2h 等待时间  
**教训**: **Slaver 超时时检查产出，有价值立即验收**

---

## Pitfalls（踩坑记录）

### 1. pkg 需要 dist/ 目录
**问题**: `pkg` 报错 "Bin file does not exist: dist/index.js"  
**根因**: CI 仅 `npm ci`，未运行 `npm run build`  
**修复**: 添加 "Build TypeScript" 步骤  
**教训**: **pkg 打包前必须先编译 TS**

### 2. 二进制命名不一致
**问题**: Rust (`eket-linux-x64`) vs Node (`eket-node-linux-amd64`)  
**根因**: 现有 release.yml 用 `x64`，新增用 `amd64`  
**修复**: install-template.sh 添加映射表  
**教训**: **统一命名规范，避免后续维护成本**

### 3. envsubst 占位符语法
**问题**: `envsubst` 不识别 `{{VAR}}`  
**根因**: envsubst 默认 `$VAR` 格式  
**修复**: `sed 's/{{\([^}]*\)}}/\$\1/g'` 预处理  
**教训**: **模板占位符需匹配工具语法**

### 4. macOS 无 sha256sum
**问题**: macOS 报错 "command not found: sha256sum"  
**根因**: macOS 默认用 `shasum`  
**修复**: fallback 逻辑 `sha256sum || shasum -a 256`  
**教训**: **跨平台命令需 fallback**

### 5. EPIC-002 tickets 误移动
**问题**: Git merge 时 EPIC-002 tickets 移到 EPIC-005  
**根因**: Slaver 在错误目录创建文件  
**修复**: 后续手动清理 archive  
**教训**: **创建文件前确认目录，避免污染**

---

## Lessons for Future

### Master 层面
1. **需求澄清闸门**: 拆卡前必须确认"谁生成什么文件"
2. **配置类任务**: CI/CD/settings.json 由 Master 亲手
3. **超时补完机制**: Slaver 超时时检查代码，有产出立即验收
4. **分支同步纪律**: 每次合并后立即同步 3 分支

### Slaver 层面
1. **30 分钟规则**: 卡住超过 30 分钟立即上报 BLOCKED
2. **产出优先**: 功能实现优先，测试脚本可后补
3. **hook 冲突**: 遇 hook 反复回滚，立即上报 Master

### 架构层面
1. **模板 + 变量注入**: 配置文件优先自动生成
2. **共享函数库**: 发现重复立即抽取（scripts/lib/）
3. **跨平台兼容**: 命令需 fallback（sha256sum / shasum）

---

## 技术债登记

| 债务项 | 优先级 | 预估工时 | 建议 EPIC |
|--------|--------|---------|---------|
| Windows 原生支持 | P3 | 8h | EPIC-006 |
| 统一二进制命名 | P2 | 2h | 技术债清理 |
| 全局检查 `.run()` 误用 | P2 | 3h | 代码质量提升 |
| EPIC-002 tickets 清理 | P1 | 1h | 立即执行 |
| Codebase map 更新 | P1 | 30m | 立即执行 |

---

**维护者**: Master  
**下次复盘**: EPIC-006 启动前
