# TASK-636: Rust Context Monitor

**Status**: 📋 Ready | **Estimate**: 6h | **Agent**: backend

## Goal
Rust重写monitor，<10ms启动，替换Node实现

## AC
1. 启动<10ms (vs Node 200ms)
2. 精度±5% vs Node
3. 跨平台编译 (Mac+Linux)
4. CLI向后兼容

**Blocked By**: TASK-632 ✅
