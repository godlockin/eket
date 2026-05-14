# TASK-637: Rust CI Pipeline

**Status**: 📋 Ready | **Estimate**: 3h | **Agent**: devops

## Goal
GitHub Actions自动编译Rust二进制（4平台）

## AC
1. 双平台编译 (darwin/linux × amd64/arm64)
2. Tag push → Release
3. 构建缓存 <3min
4. SHA256SUMS校验

**Blocked By**: TASK-636
