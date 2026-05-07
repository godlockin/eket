# TASK-427: 🔴 修复 complete.ts TypeScript 编译错误（P0 阻塞）

**EPIC**: EPIC-005  
**Milestone**: M0 - 紧急阻塞修复  
**优先级**: 🔴 P0（阻塞 TASK-420 Node 预编译）  
**预估工时**: 0.5h  
**状态**: ready  
**依赖**: 无  
**发现来源**: 架构师评审

---

## 🔴 阻塞问题

### TS 编译错误
```
Error: [tsl] ERROR in node/src/commands/complete.ts(558,18)
      TS2339: Property 'run' does not exist on type 'SQLiteClient'.
```

### 根因
- `complete.ts:558` 调用 `await db.run(...)`
- `SQLiteClient` 类仅提供 `execute()` 方法（返回 `Result<void>`）
- `ISQLiteClient` 接口也无 `run()` 方法

---

## 验收标准（AC）

- **AC-1**: 编译通过
  - Given: 修复 `complete.ts:558`
  - When: 运行 `cd node && npm run build`
  - Then: 0 errors，成功编译到 `dist/`

- **AC-2**: 功能验证
  - Given: 编译成功
  - When: 运行 `node dist/index.js task:complete <ticket-id>`
  - Then: 正常执行，SQLite 更新成功

---

## 技术方案

### 修复代码

```typescript
// node/src/commands/complete.ts L558
// 错误代码
await db.run('UPDATE slaver_instances SET status = ? WHERE id = ?', ['idle', slaverId]);

// 修复为
await db.execute('UPDATE slaver_instances SET status = ? WHERE id = ?', ['idle', slaverId]);
```

### 全局检查

搜索所有 `db.run()` 调用，统一替换为 `db.execute()`：

```bash
grep -rn "db\.run(" node/src/commands/ --include="*.ts"
# 可能还有其他文件，全部修复
```

---

## 实现步骤

1. **全局搜索**: `grep -rn "\.run\(" node/src/ --include="*.ts"`
2. **逐个修复**: 将所有 `.run(` 替换为 `.execute(`
3. **验证编译**: `cd node && npm run build`
4. **单元测试**: `npm test -- commands/complete`

---

## 交付物

- [ ] `node/src/commands/complete.ts` 修复（L558）
- [ ] 其他可能的 `.run()` 调用修复
- [ ] 编译验证通过
- [ ] 提交 PR 到 `testing` 分支

---

## 依赖关系

**阻塞**:
- TASK-420（Node 预编译 job）→ 需等待编译通过后测试 ncc 打包
- TASK-416（引导安装脚本）→ 依赖可执行的 Node 版

**前置**:
- 无（立即执行）

---

**Master 决策**: 
- 本 TASK 与 TASK-426 并行执行（不同文件，无冲突）
- 优先级：**TASK-426 = TASK-427 > 其他所有 TASK**
