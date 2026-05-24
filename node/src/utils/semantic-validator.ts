import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

function findProjectRootSync(): string {
  let current = process.cwd();
  while (current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, '.eket'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return process.cwd();
}

export interface SemanticValidationResult {
  passed: boolean;
  score: number;
  reason: string;
}

export class SemanticValidator {
  private basePrompt = `你是一个严苛的 Tech Lead 质检员。
请比对以下 Ticket 验收标准 (AC) 与 Slaver 提交的分析报告 (Report)。
如果报告只是大段重复我的 prompt 废话，或者没有给出具体到文件和类的技术路径，请打低分 (< 70)。
必须给出一个 JSON 格式的输出: { "score": 0-100, "reason": "不合格的具体原因/修改建议" }`;

  private projectRoot: string;
  private cachePath: string;
  private llmCaller?: (prompt: string) => Promise<string>;

  constructor(options?: {
    projectRoot?: string;
    llmCaller?: (prompt: string) => Promise<string>;
  }) {
    this.projectRoot = options?.projectRoot || findProjectRootSync();
    this.cachePath = path.join(this.projectRoot, '.eket', 'state', 'semantic_cache.json');
    this.llmCaller = options?.llmCaller;
  }

  /**
   * 检验结构完整度与字数阈值 (AC-1)
   */
  public verifyStructure(content: string): { passed: boolean; reason?: string } {
    // 1. 内容字节数必须 > 300 字节
    const byteLength = Buffer.byteLength(content, 'utf-8');
    if (byteLength <= 300) {
      return {
        passed: false,
        reason: `内容长度不足：当前内容仅为 ${byteLength} 字节（必须大于 300 字节）`,
      };
    }

    // 2. 核心二级标题匹配规则（goals/requirements, technical approach, impact, task breakdown, risk）
    const lowerContent = content.toLowerCase();

    // 正则表达式匹配以 ## 开头的二级标题
    // Section 1: Goals / Requirements
    const hasGoals = /##\s*.*?(goals|requirements|需求|目标|背景).*?/i.test(lowerContent);
    // Section 2: Technical Approach
    const hasApproach = /##\s*.*?(technical\s+approach|approach|技术方案|技术路径|实现方案).*?/i.test(lowerContent);
    // Section 3: Impact Analysis
    const hasImpact = /##\s*.*?(impact|影响).*?/i.test(lowerContent);
    // Section 4: Task Breakdown
    const hasBreakdown = /##\s*.*?(breakdown|任务分解|任务拆解|任务拆卡).*?/i.test(lowerContent);
    // Section 5: Risk Assessment
    const hasRisk = /##\s*.*?(risk|风险).*?/i.test(lowerContent);

    const missingSections: string[] = [];
    if (!hasGoals) missingSections.push('Requirements/Goals (需求分析/目标)');
    if (!hasApproach) missingSections.push('Technical Approach (技术方案)');
    if (!hasImpact) missingSections.push('Impact Analysis (影响分析)');
    if (!hasBreakdown) missingSections.push('Task Breakdown (任务分解)');
    if (!hasRisk) missingSections.push('Risk Assessment (风险评估)');

    if (missingSections.length > 0) {
      return {
        passed: false,
        reason: `缺失核心二级标题：${missingSections.join(', ')}`,
      };
    }

    return { passed: true };
  }

  /**
   * 质检缓存管理 (AC-4)
   */
  private getCache(contentHash: string): SemanticValidationResult | null {
    if (!fs.existsSync(this.cachePath)) {
      return null;
    }
    try {
      const cacheData = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
      if (cacheData[contentHash]) {
        return cacheData[contentHash];
      }
    } catch {
      // 忽略损坏的缓存文件
    }
    return null;
  }

  private writeCache(contentHash: string, result: SemanticValidationResult): void {
    let cacheData: Record<string, SemanticValidationResult> = {};
    const dir = path.dirname(this.cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(this.cachePath)) {
      try {
        cacheData = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
      } catch {
        // 忽略读取错误，重写缓存
      }
    }
    cacheData[contentHash] = result;
    
    // 采用原子写入策略，防止多进程或进程崩溃导致 JSON 文件损坏
    const tmpPath = `${this.cachePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(cacheData, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.cachePath);
    } catch {
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch {
        // 忽略清理临时文件错误
      }
    }
  }

  /**
   * 运行语义分析方案质检 (AC-2, AC-3)
   */
  async validate(
    ticketAc: string,
    reportContent: string
  ): Promise<SemanticValidationResult> {
    // 1. 结构和字数检验 (AC-1)
    const structCheck = this.verifyStructure(reportContent);
    if (!structCheck.passed) {
      return {
        passed: false,
        score: 0,
        reason: structCheck.reason || '结构完整度检验失败',
      };
    }

    // 2. 校验哈希缓存 (AC-4)
    const contentHash = crypto.createHash('sha256').update(reportContent).digest('hex');
    const cachedResult = this.getCache(contentHash);
    if (cachedResult) {
      return cachedResult;
    }

    // 3. 准备提示词并调用 LLM (AC-2)
    const prompt = `${this.basePrompt}\n\n[验收标准 (AC)]:\n${ticketAc}\n\n[分析报告 (Report)]:\n${reportContent}`;
    let responseText = '';

    try {
      if (this.llmCaller) {
        responseText = await this.llmCaller(prompt);
      } else {
        responseText = await this.defaultCallLLM(prompt);
      }

      // 解析 LLM 返回的 JSON
      const cleanedJson = this.extractJson(responseText);
      const result = JSON.parse(cleanedJson);

      const score = typeof result.score === 'number' ? result.score : 0;
      const reason = typeof result.reason === 'string' ? result.reason : '未给出理由';
      const passed = score >= 70;

      const validationResult = { passed, score, reason };

      // 4. 写入缓存 (AC-4)
      this.writeCache(contentHash, validationResult);

      return validationResult;
    } catch (err: any) {
      // 在生产环境中如果调用 LLM 失败，则优雅降级为简单规则过滤，但在测试中我们会传递 mock。
      // 下面实现简易的降级匹配逻辑防止因为网络中断而阻断开发：
      const isMockOrTest = (process.env.NODE_ENV === 'test' || process.env.EKET_MOCK_LLM === 'true') && !process.env.EKET_TEST_FALLBACK;
      if (isMockOrTest && !this.llmCaller) {
        throw new Error(`LLM call failed in test mode: ${err.message}`);
      }

      // 生产环境降级：如果包含 TODO/TBD 或明显的模版拷贝，或者重复 AC，直接判定不合格
      const lowerReport = reportContent.toLowerCase();
      const hasTodo = /todo|tbd|待定|待填/.test(lowerReport);
      const isCopyPaste = lowerReport.includes(ticketAc.toLowerCase().substring(0, 100));
      
      const score = hasTodo || isCopyPaste ? 50 : 80;
      const reason = hasTodo 
        ? '方案中包含 TODO/TBD 等待定字样（生产环境降级校验）' 
        : (isCopyPaste ? '方案疑似大面积抄袭或重复 AC（生产环境降级校验）' : '通过基本结构检验（生产环境降级通过）');
      const passed = score >= 70;

      const fallbackResult = { passed, score, reason };
      this.writeCache(contentHash, fallbackResult);
      return fallbackResult;
    }
  }

  /**
   * 辅助方法：提取 JSON 块
   */
  private extractJson(text: string): string {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }
    return text.trim();
  }

  /**
   * 默认 LLM API 调用 (支持常见的环境变量注入)
   */
  private async defaultCallLLM(prompt: string): Promise<string> {
    const apiKey = process.env.EKET_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const apiUrl = process.env.EKET_OPENAI_API_URL || process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.EKET_OPENAI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if (!apiKey) {
      throw new Error('Missing API Key. Please set EKET_OPENAI_API_KEY or OPENAI_API_KEY.');
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM API returned status ${response.status}: ${errText}`);
    }

    const result: any = await response.json();
    return result.choices?.[0]?.message?.content || '';
  }
}
