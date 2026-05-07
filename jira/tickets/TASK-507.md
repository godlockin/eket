# TASK-507: `eket doctor` 验证命令

**EPIC**: EPIC-005 | **Milestone**: M3 | **优先级**: P1 | **工时**: 4h | **状态**: ready | **依赖**: TASK-504, TASK-505

## 需求
实现 `eket doctor` 命令，验证安装环境和 skills。

## AC
- **AC-1**: 8 项检查
  - Given: 运行 `eket doctor`
  - When: 检查执行
  - Then: 输出 8 项清单（✅ / ❌ / ⚠️）

- **AC-2**: Skills 验证
  - Given: `~/.claude/skills/eket/` 已安装
  - When: doctor 检查
  - Then: 显示 `✅ Skills 已安装 (v2.9.1)`

## 技术方案
```typescript
// node/src/commands/doctor.ts
export async function doctor() {
  const checks = [
    checkBinaryExists(),
    checkSkillsInstalled(),  // 新增
    checkEnvVars(),
    checkRedisConnection(),
    checkSQLite(),
    checkGitConfig(),
    checkClaudeCommands(),
    checkDiskSpace(),
  ];
  
  // ...
}

async function checkSkillsInstalled() {
  const skillPath = path.join(os.homedir(), '.claude/skills/eket/SKILL.md');
  if (fs.existsSync(skillPath)) {
    const content = fs.readFileSync(skillPath, 'utf-8');
    const version = content.match(/version:\s*(\S+)/)?.[1] || 'unknown';
    return { ok: true, message: `Skills 已安装 (${version})` };
  }
  return { ok: false, message: 'Skills 未安装，运行 install.sh' };
}
```

## 交付物
- [ ] `node/src/commands/doctor.ts` 更新
- [ ] Rust 版对应实现

## 时限
**4h**
