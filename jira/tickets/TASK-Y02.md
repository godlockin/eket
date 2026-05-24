# TASK-Y02: AI 语义级计划质检门禁实现

**ID**: TASK-Y02  
**Epic**: EPIC-009  
**优先级**: P0  
**预估**: 6h  
**依赖**: TASK-Y01  
**Agent Type**: backend  
**Category**: ⚙️ Git Hook / Security / Quality Gate

---

## Goal

增强 EKET 交付流程的质量堤坝。通过在 pre-commit 或 `validate-ticket-pr.sh` 中引入轻量级 LLM 语义校验机制，对 Slaver 提交的 `analysis-report.md` 进行语义把关，拦截投机取巧、空洞灌水的“虚假分析报告”。

---

## Acceptance Criteria

**AC-1**: 结构完整度与字数阈值强检验  
- Given: Slaver 提交 `analysis-report.md`
- When: 触发 Git 门禁检查
- Then: 确保包含 Goals, Technical Approach, Task Breakdown 等 5 个核心二级标题，且内容字节数 > 300 字节

**AC-2**: AI 语义质量评测  
- Given: 结构检验通过
- When: 触发语义评估器 (AI Validator)
- Then: 调用本地轻量 LLM (或通过统一接口请求 API) 对技术方案与 Ticket 原 Acceptance Criteria (AC) 进行比对，输出 0-100 分的匹配评分

**AC-3**: 劣质方案硬性熔断  
- Given: AI 评分低于 70 分，或被识别为“大面积重复 Prompt 描述”
- When: 报告质检结果
- Then: pre-commit 脚本返回 `exit 1` 阻断提交，输出清晰的不合格理由，责令重新分析

**AC-4**: 质检缓存以防止延迟  
- Given: 同一份分析方案没有被修改（MD 哈希未变）
- When: 重复进行 commit 或 review
- Then: 读取本地哈希缓存，不重复向 AI 发起请求，确保 Git 操作流畅性

---

## Implementation Sketch

在 `node/src/commands/gate-review.ts` 或新建的 `semantic-validator.ts` 中实现：

```typescript
export class SemanticValidator {
  private basePrompt = `你是一个严苛的 Tech Lead 质检员。
请比对以下 Ticket 验收标准 (AC) 与 Slaver 提交的分析报告 (Report)。
如果报告只是大段重复我的 prompt 废话，或者没有给出具体到文件和类的技术路径，请打低分 (< 70)。
必须给出一个 JSON 格式的输出: { "score": 0-100, "reason": "不合格的具体原因/修改建议" }`;

  async validate(ticketAc: string, reportContent: string): Promise<{ passed: boolean; score: number; reason: string }> {
    // 1. 检验缓存
    const cache = this.getCache(reportContent);
    if (cache) return cache;

    // 2. 发起 AI 校验请求
    const response = await callLLM({
      prompt: `${this.basePrompt}\n\n[AC]:\n${ticketAc}\n\n[Report]:\n${reportContent}`,
      temperature: 0.1
    });

    const result = JSON.parse(response);
    const passed = result.score >= 70;

    // 3. 写入缓存
    this.writeCache(reportContent, { passed, score: result.score, reason: result.reason });

    return { passed, score: result.score, reason: result.reason };
  }
}
```

---

## Test Strategy

**Unit**: 使用 mock 编写测试用例，提供两份分析方案：
1. 一份是全是废话的模板（预期拦截返回 score 50）。
2. 一份是包含具体代码更改的技术方案（预期通过返回 score 85）。

---

**Blocked By**: TASK-Y01  
**Blocks**: TASK-Y03  
**Created**: 2026-05-24
---
status: ready
assignee: ""
branch: ""
ac_completed: 0/4
test_coverage: 0%
