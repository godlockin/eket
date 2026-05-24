# TASK-Z03: Node.js 双轨制运行与自适应降级 Fallback 引擎

**ID**: TASK-Z03  
**Epic**: EPIC-010  
**优先级**: P0  
**预估**: 8h  
**依赖**: TASK-Z01, TASK-Z02  
**Agent Type**: fullstack  
**Category**: 🔧 Node.js Core / Resilience & Fallback

---

## Goal

在 Node.js 框架层构建健壮的**“双轨自适应路由引擎（Dual-Track Router）”**。

当系统检测到环境具备 Rust 原生运行包且能够成功联通 Rust HTTP 守护进程时，将选举、注册、消息总线等高频组件自动代理至 Rust 高性能轨道（Track A）；**当环境不具备 Rust 编译工具链或运行时缺失时，自动降级启用 Node.js 内存与本地纯 JS 的 Fallback 实现（Track B），确保任何简易、离线或零 Rust 容器环境下的 100% 不崩溃运行。**

---

## Acceptance Criteria

**AC-1**: 自动环境检测与健康诊断  
- Given: Node.js 初始化启动
- When: 自动探测全局/本地 `eket` Rust 二进制文件及 `eket server` 端口可用性
- Then: 输出环境诊断结果，若可用则标注为 `Track A (Rust Core Connected)`，否则无缝切换为 `Track B (Node.js Local Fallback)`

**AC-2**: 双轨接口抽象对齐  
- Given: MasterElection 与 MessageQueue 接口调用
- When: 执行选举或广播消息
- Then: 对外部调用方完全透明。接口签名保持 100% 相同，由底层 Dual-Track 路由器自动决定路由

**AC-3**: 动态降级与强鲁棒性校验  
- Given: Track A 在运行中途突然中断（如 Rust 进程被 OOM 强杀或网络闪退）
- When: 捕获到通信套接字中断异常时
- Then: 立即触发自适应断路器，无缝重定向后续请求到 Track B（Node.js 本地文件/内存模式），整个系统级运行绝对不崩溃、不报致命异常

---

## Implementation Sketch

在 `node/src/core/dual-track-router.ts` 中抽象并实现：

```typescript
export interface IMasterElection {
  tryElect(): Promise<boolean>;
}

export class DualTrackElection implements IMasterElection {
  private rustAdapter: RustElectionAdapter;
  private nodeFallback: NodeElectionFallback;
  private currentTrack: 'A' | 'B' = 'A';

  constructor(rust: RustElectionAdapter, node: NodeElectionFallback) {
    this.rustAdapter = rust;
    this.nodeFallback = node;
  }

  async tryElect(): Promise<boolean> {
    if (this.currentTrack === 'A') {
      try {
        return await this.rustAdapter.tryElect();
      } catch (err) {
        console.warn(`[Dual-Track] Rust Core 异常或不可用，自动降级至 JS 本轨。原因: ${err.message}`);
        this.currentTrack = 'B';
      }
    }
    return await this.nodeFallback.tryElect();
  }
}
```

---

## Test Strategy

**Resilience Mock Tests**:
- 运行 Node.js 烟雾测试 -> 人为强杀本地 Rust 二进制或模拟网络断连 -> 验证进程不报错且能完美且自动切换为 pure TS 逻辑处理。

---

**Blocked By**: TASK-Z01, TASK-Z02  
**Blocks**: None  
**Created**: 2026-05-24  
---
status: ready
assignee: ""
branch: ""
ac_completed: 0/3
test_coverage: 0%
