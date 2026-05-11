# TASK-616: 添加 health_check.sh

**优先级**: P1  
**状态**: `review`  
**分支**: feature/TASK-616  
**提交**: be49214  

## 实现
**建 scripts/health_check.sh
- [x] 检查 7 项：Git/Node/npm/Redis/SQLite/目录/.eket/config.yml
- [x] 彩色输出（✅/⚠️/❌）
- [x] Exit code: 0=全通过, 1=部分失败, 2=严重
- [x] 使用文档：docs/operations/health-check.md
- [x] CI 集成：.github/workflows/health-check.yml

## 验证输出
```
========================================
  EKET Health Check v1.0.0
========================================

Git Repository...             ✅ Clean (branch: miao)
Node.js Version...            ✅ v24.15.0 (>= 18)
npm Dependencies...           ✅ Installed and verified
Redis Connection (optional)...⚠️  redis-cli not installed
SQLite Database...            ✅ Found and verified (.eket/state/eket.db)
Core Directories...           ✅ All present (confluence, jira, node)
Configuration (.eket/config.yml)...✅ Valid YAML

========================================
  Summary
========================================
✅ Passed: 6
❌ Failed: 0
⚠️  Optional Failed: 1

Overall: 6/7 checks passed (1 optional)
```

## 文件清单
- `scripts/health_check.sh` (288 行)
- `docs/operations/health-check.md` (329 行)
- `.github/workflows/health-check.yml` (95 行)

## PR
待 Master 审核后合并。

**创建**: 2026-05-11  
**创建者**: Master  
**完成**: 2026-05-10  
**执行者**: Slaver
