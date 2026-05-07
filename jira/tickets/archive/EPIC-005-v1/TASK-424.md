# TASK-424: 安装后验证脚本（`eket doctor`）

**EPIC**: EPIC-005 | **Milestone**: M3 | **优先级**: P1 | **工时**: 6h | **状态**: ready | **依赖**: TASK-416

## 需求
实现 `eket doctor` 命令，验证安装环境和配置完整性。

## AC
- **AC-1**: 基础验证
  - Given: 运行 `eket doctor`
  - When: 检查安装
  - Then: 输出检查清单（8-10 项），每项显示 ✅ / ❌ / ⚠️

- **AC-2**: 环境变量检查
  - Given: `EKET_REDIS_HOST` 未设置
  - When: doctor 检查
  - Then: 显示 `⚠️  EKET_REDIS_HOST 未设置，将使用默认值 localhost`

- **AC-3**: 修复建议
  - Given: 检测到问题（如权限不足）
  - When: doctor 输出
  - Then: 提供修复命令（如 `sudo chmod +x /usr/local/bin/eket-rust`）

## 技术方案
```typescript
// node/src/commands/doctor.ts
export async function doctor() {
  console.log('EKET 环境诊断\n');
  
  const checks = [
    checkBinaryExists(),
    checkPermissions(),
    checkEnvVars(),
    checkRedisConnection(),
    checkSQLite(),
    checkGitConfig(),
    checkClaudeCommands(),
    checkSkillInstallation(),
  ];
  
  const results = await Promise.all(checks);
  const failed = results.filter(r => !r.ok);
  
  if (failed.length === 0) {
    console.log('\n✅ 所有检查通过！');
  } else {
    console.log(`\n❌ ${failed.length} 项检查失败，请修复后重试`);
    process.exit(1);
  }
}
```

## 检查清单
1. ✅ EKET 二进制可执行性
2. ✅ 环境变量（OPENCLAW_API_KEY / EKET_LOG_LEVEL 等）
3. ✅ Redis 连接（可选，降级模式允许）
4. ✅ SQLite 数据库权限
5. ✅ Git 配置（user.name / user.email）
6. ✅ Claude 命令注册（`~/.claude/commands/eket.sh`）
7. ✅ Skill 安装（`.claude/skills/eket/`）
8. ✅ 磁盘空间（> 1GB）

## 交付物
- [ ] `node/src/commands/doctor.ts` 实现
- [ ] Rust 版对应实现 `rust/crates/eket-cli/src/commands/doctor.rs`
- [ ] 测试脚本（模拟各种失败场景）
