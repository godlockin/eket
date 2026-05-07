# EPIC-005 架构评审

**评审时间**: 2026-05-07  
**评审人**: 架构师（只读评审）  
**评审范围**: 预编译系统技术可行性

---

## 1. 现有 workflow 评审

### 1.1 release.yml target 配置

**当前 target**（仅 3 个）:
```yaml
- os: ubuntu-latest, target: x86_64-unknown-linux-gnu, artifact: eket-linux-x64
- os: macos-latest, target: aarch64-apple-darwin, artifact: eket-macos-arm64
- os: macos-latest, target: x86_64-apple-darwin, artifact: eket-macos-x64
```

**缺失平台**:
- [ ] ❌ Windows x64: `x86_64-pc-windows-msvc` (最大用户群)
- [ ] ❌ Linux musl: `x86_64-unknown-linux-musl` (Docker/Alpine 兼容)
- [ ] ❌ Linux ARM: `aarch64-unknown-linux-gnu` (服务器/树莓派)

**命名规范问题**:
- ✅ macOS 产物名含架构 (`arm64`/`x64`)
- ⚠️ Linux 产物名未含 `gnu` 后缀，与 musl 冲突潜在风险

### 1.2 Rust musl target 配置

**当前状态**: 
- ❌ 仅 `x86_64-unknown-linux-gnu` (glibc)
- ❌ 无 musl 静态编译配置

**影响**:
- Alpine Linux 部署失败 (glibc 不兼容)
- Docker 镜像需额外安装 glibc 依赖（体积 +30MB）

**已有静态链接配置**:
```toml
rusqlite = { version = "0.32", features = ["bundled", "chrono"] }
# ✅ bundled 特性已启用，SQLite 无需外部依赖
```

**待验证**: 其他依赖（fred Redis 客户端）是否需要额外配置

### 1.3 编译产物命名规范

**建议统一格式**: `eket-{os}-{arch}[-{variant}]`

| 当前名称 | 建议名称 | 理由 |
|---------|---------|------|
| `eket-linux-x64` | `eket-linux-x64-gnu` | 区分 musl 变体 |
| `eket-macos-arm64` | ✅ 无需改 | 已明确 |
| - | `eket-windows-x64.exe` | 缺失 |
| - | `eket-linux-x64-musl` | 缺失 |

---

## 2. Node 预编译验证

### 2.1 ncc bundle 可行性

**测试结果**: ❌ **阻塞问题 - TypeScript 编译失败**

```
Error: [tsl] ERROR in node/src/commands/complete.ts(558,18)
      TS2339: Property 'run' does not exist on type 'SQLiteClient'.
```

**根因**:
1. `complete.ts:558` 调用 `await db.run(...)`
2. `SQLiteClient` 类只有 `execute` 方法（返回 `Result<void>`）
3. `ISQLiteClient` 接口也无 `run` 方法

**代码差异**:
```typescript
// complete.ts:558 (错误)
await db.run('UPDATE slaver_instances SET status = ? WHERE id = ?', ['idle', slaverId]);

// 正确接口 (ISQLiteClient)
execute(sql: string, params?: unknown[]): Promise<Result<void>>;

// 或直接使用底层（不推荐，已废弃）
this.db.prepare(sql).run(...params); // SQLiteClient 内部实现
```

**无法继续测试**:
- ✋ 无法验证 bundle 体积
- ✋ 无法检查动态 require
- ✋ 无法验证依赖完整性

### 2.2 native 依赖列表

**必需依赖** (package.json):
```json
"better-sqlite3": "^11.0.0",  // native C++ binding
"ioredis": "^5.3.2",          // pure JS (OK)
```

**可选依赖**:
```json
"bufferutil": "^4.0.8",       // WebSocket 性能优化
"utf-8-validate": "^6.0.3"    // WebSocket 性能优化
```

**ncc 打包策略**:
- ❌ **无法打包 better-sqlite3**（C++ addon，需平台编译）
- ✅ ioredis 可打包（纯 JS）
- ⚠️ bufferutil/utf-8-validate 可选（缺失不报错）

**解决方案对比**:

| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 预编译 better-sqlite3 + ncc | 单文件分发 | 需针对每平台编译 addon（工作量 = Rust 级别） |
| B. ncc + `npm install better-sqlite3` | 打包简单 | 用户需有 npm 环境（违背"一键安装"） |
| C. 纯 Rust 实现 + Node binding | 最佳性能 | 工作量最大（M3 = 2-3 周） |
| D. 运行时检测 + 降级（Shell → Node + npm） | 优雅降级 | 复杂度高 |

### 2.3 Bundle 体积预估

**基于依赖树估算** (未实际打包):
- node_modules 总计: ~180MB
- 预估 ncc bundle (minify): **5-8 MB**
- 加 better-sqlite3.node (per-platform): +2MB

**基准参考**:
- Vercel ncc 自身: 1.2MB
- Next.js standalone: 3-5MB

---

## 3. 架构风险评估

| 风险 | 级别 | 缓解方案 | 负责人 |
|------|------|---------|--------|
| **Node 预编译阻塞**（TypeScript 错误） | **H** | **先修 complete.ts:558，改用 `execute`** | Slaver (代码修复) |
| **better-sqlite3 打包不可行** | H | 方案 D: 降级到 `npm install` | Master (架构调整) |
| Windows 平台未覆盖 | M | 添加 `x86_64-pc-windows-msvc` target | Slaver (CI 配置) |
| musl target 缺失 | M | 添加 `x86_64-unknown-linux-musl` + 测试 | Slaver (CI 配置) |
| 预编译包体积超预期 (>50MB) | L | upx 压缩 / 分包下载 | Slaver (优化) |
| 多版本命令冲突 (`eket` Rust vs Node) | L | PATH 优先级 + `eket-version` 命令 | Master (安装脚本) |

---

## 4. 推荐调整

### 4.1 Milestone 1 前置工作（阻塞项）

**必须先完成** (否则无法测试 Node 预编译):

1. **修复 TypeScript 编译错误** 
   - 文件: `node/src/commands/complete.ts:558`
   - 改动:
     ```typescript
     // 旧代码
     await db.run('UPDATE slaver_instances SET status = ? WHERE id = ?', ['idle', slaverId]);
     
     // 新代码
     const result = await db.execute(
       'UPDATE slaver_instances SET status = ? WHERE id = ?',
       ['idle', slaverId]
     );
     if (!result.success) {
       console.warn(`[slaver-status] Failed to update status: ${result.error?.message}`);
     }
     ```
   - 工时: 0.5h
   - 优先级: **P0**（阻塞 ncc 测试）

2. **验证 ncc bundle 可行性**（前置依赖: 修复 #1）
   - 命令: `npx ncc build src/index.ts -o /tmp/test --minify`
   - 检查点:
     - [ ] 编译成功
     - [ ] 体积 < 10MB
     - [ ] 无动态 require
     - [ ] better-sqlite3 问题确认
   - 工时: 1h
   - 优先级: **P0**

### 4.2 Ticket 拆分建议

**原 M2（GitHub Actions 预编译）拆分为**:

| Ticket | 标题 | 依赖 | 优先级 |
|--------|------|------|--------|
| **M2.0** | **修复 complete.ts TypeScript 错误** | 无 | **P0** |
| **M2.1** | **验证 Node ncc 打包可行性** | M2.0 | **P0** |
| M2.2 | 添加 Rust Windows target | 无 | P1 |
| M2.3 | 添加 Rust musl target | 无 | P1 |
| M2.4 | 实现 Node 预编译 workflow | M2.1 | P1 |
| M2.5 | 实现安装脚本降级逻辑 | M2.1 | P1 |

**架构决策点** (需 Expert Panel 讨论):
- [ ] 是否接受 Node 版需要 `npm install better-sqlite3`？
- [ ] 是否延后 Node 预编译到 Phase 2（先做 Rust）？
- [ ] 是否引入 pkg/nexe 等替代 ncc（支持 native addon）？

### 4.3 技术债标记

**新增技术债**:

1. **TD-EPIC005-001**: `SQLiteClient` 已废弃但仍被使用
   - 位置: `complete.ts:558`, 可能还有其他文件
   - 影响: 类型不安全，接口不一致
   - 修复: 全局搜索 `createSQLiteClient`，迁移到 `createSQLiteManager`
   - 工时: 4-8h（取决于使用范围）

2. **TD-EPIC005-002**: release.yml 缺失主流平台
   - 影响: Windows/Alpine Linux 用户无法使用预编译包
   - 修复: 添加 3 个 target（见 §1.1）
   - 工时: 2h（含 CI 测试）

---

## 5. 总结

### 5.1 是否可以继续拆 ticket？

**❌ 不建议立即拆分 M2（Node 预编译）**

**原因**:
1. TypeScript 编译错误阻塞 ncc 测试（无法验证可行性）
2. better-sqlite3 打包方案未确定（需架构决策）
3. 降级策略设计不完整（依赖 M2.1 结果）

**建议路径**:
1. **先创建 M2.0 + M2.1**（前置验证 ticket）
2. **Slaver 完成 M2.0 + M2.1 后，召唤 Expert Panel**
3. **根据测试结果，再拆分 M2.2-M2.5**

### 5.2 Rust 预编译可以并行推进

**✅ M1（安装脚本）+ Rust target 补全可立即开始**

无依赖阻塞，可分配给 Slaver:
- M2.2: 添加 Windows target (2h)
- M2.3: 添加 musl target (2h)
- M1: 引导式安装脚本框架 (8h)

### 5.3 推荐优先级

```
P0 (立即):
  ├─ M2.0: 修复 complete.ts 错误 (0.5h)
  └─ M2.1: 验证 ncc 可行性 (1h)

P1 (并行):
  ├─ M2.2: Windows target (2h)
  ├─ M2.3: musl target (2h)
  └─ M1: 安装脚本框架 (8h)

P2 (等待 M2.1 结果):
  ├─ M2.4: Node 预编译 workflow
  ├─ M2.5: 降级逻辑
  └─ M3: Rust 核心实现
```

---

## 附录

### A. 完整 Rust target 推荐列表

| Target | 用户占比 | 优先级 | 工时 |
|--------|---------|--------|------|
| x86_64-unknown-linux-gnu | ✅ 已有 | - | - |
| x86_64-pc-windows-msvc | ~40% | P1 | 2h |
| x86_64-unknown-linux-musl | ~15% | P1 | 2h |
| aarch64-apple-darwin | ✅ 已有 | - | - |
| x86_64-apple-darwin | ✅ 已有 | - | - |
| aarch64-unknown-linux-gnu | ~5% | P2 | 2h |

### B. ncc 替代方案对比

| 工具 | native addon 支持 | 体积 | 复杂度 |
|------|------------------|------|--------|
| @vercel/ncc | ❌ | 小 | 低 |
| pkg | ✅ (需配置) | 大 (30-50MB) | 中 |
| nexe | ✅ (需配置) | 大 (40-60MB) | 中 |
| esbuild | ❌ | 小 | 低 |

### C. 检查命令清单

**运行以下命令验证架构调整**:

```bash
# 1. 检查 TypeScript 错误
cd node && npm run build 2>&1 | grep "TS2339"

# 2. 搜索废弃 API 使用
grep -rn "createSQLiteClient\|new SQLiteClient" node/src

# 3. 测试 ncc bundle (修复 M2.0 后)
npx ncc build src/index.ts -o /tmp/test --minify
du -sh /tmp/test

# 4. 检查 Rust 编译（验证 musl）
cd rust && cargo build --release --target x86_64-unknown-linux-musl
```

---

**评审状态**: ⚠️ 发现阻塞问题  
**下一步**: Master 决策 Node 预编译方案（推荐召唤 Expert Panel）
