import * as fs from 'fs';
import * as path from 'path';

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { SemanticValidator } from '../../src/utils/semantic-validator';

describe('SemanticValidator', () => {
  const tempProjectRoot = path.join(process.cwd(), '.eket-test', 'semantic-validator-test');
  const cachePath = path.join(tempProjectRoot, '.eket', 'state', 'semantic_cache.json');

  beforeEach(() => {
    // Make sure cache and temp directories are clean
    if (fs.existsSync(tempProjectRoot)) {
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempProjectRoot)) {
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    }
  });

  describe('Structure Verification (AC-1)', () => {
    it('should fail structural check when content is too short (<= 300 bytes)', () => {
      const validator = new SemanticValidator({ projectRoot: tempProjectRoot });
      const content = '## Goals\nShort body';
      const result = validator.verifyStructure(content);

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('内容长度不足');
    });

    it('should fail structural check when content is long but missing headers', () => {
      const validator = new SemanticValidator({ projectRoot: tempProjectRoot });
      
      // Large content but missing the 5 required headers
      let content = 'This is a long content without any markdown headings. '.repeat(10);
      let result = validator.verifyStructure(content);

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('缺失核心二级标题');
    });

    it('should pass structural check when content is sufficiently long and contains the 5 required headers', () => {
      const validator = new SemanticValidator({ projectRoot: tempProjectRoot });
      const content = `
# Analysis Report: TASK-Y02

## 1. Requirements Understanding
We need to enhance the quality gating of the EKET framework by implementing a pre-commit semantic validator.

## 2. Technical Approach
We will implement the SemanticValidator class in utils/semantic-validator.ts.
It will analyze reports and ticket ACs and return a JSON score.
We will hook it in gate-review.ts to enforce exit 1 on veto.

## 3. Impact Analysis
High: It blocks low-quality plans physically at the git pre-commit stage.
No database schema changes are expected.

## 4. Task Breakdown
- Task 1: Create semantic-validator.ts (2h)
- Task 2: Integrate into gate-review.ts (2h)
- Task 3: Add unit tests (2h)

## 5. Risk Assessment
Risk: API delay.
Mitigation: SHA256 caching.
      `;

      const result = validator.verifyStructure(content);
      expect(result.passed).toBe(true);
    });
  });

  describe('AI Semantic Evaluation & Blocking (AC-2, AC-3)', () => {
    const ticketAc = 'AC-1: Length and title check\nAC-2: AI scoring\nAC-3: Block lower than 70\nAC-4: Cache hits';
    
    const validReport = `
# Analysis Report: TASK-Y02

## 1. Requirements Understanding
Verify the plan quality before code commits.

## 2. Technical Approach
Implement SemanticValidator. Use crypto for sha256 hashing. Cache in .eket/state/semantic_cache.json.

## 3. Impact Analysis
Ensures ultimate code quality.

## 4. Task Breakdown
- Coding semantic-validator.ts
- Testing cache

## 5. Risk Assessment
API network latency is resolved by cache hits.
    `;

    it('should fail when AI returns score < 70 (AC-3)', async () => {
      let callCount = 0;
      const mockLLMCaller = async (prompt: string): Promise<string> => {
        callCount++;
        return JSON.stringify({
          score: 55,
          reason: 'This report does not describe concrete implementation details and repeats prompt.',
        });
      };

      const validator = new SemanticValidator({
        projectRoot: tempProjectRoot,
        llmCaller: mockLLMCaller,
      });

      const result = await validator.validate(ticketAc, validReport);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(55);
      expect(result.reason).toContain('repeats prompt');
      expect(callCount).toBe(1);
    });

    it('should pass when AI returns score >= 70', async () => {
      let callCount = 0;
      const mockLLMCaller = async (prompt: string): Promise<string> => {
        callCount++;
        return JSON.stringify({
          score: 85,
          reason: 'Excellent report with robust implementation plan and breakdown.',
        });
      };

      const validator = new SemanticValidator({
        projectRoot: tempProjectRoot,
        llmCaller: mockLLMCaller,
      });

      const result = await validator.validate(ticketAc, validReport);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(85);
      expect(result.reason).toContain('Excellent report');
      expect(callCount).toBe(1);
    });
  });

  describe('Quality Gate Cache (AC-4)', () => {
    const ticketAc = 'AC-1: Structural verification\nAC-2: AI validation';
    const validReport = `
# Analysis Report: TASK-Y02

## 1. Requirements Understanding
We will check and verify the plan before any git commits are physically allowed to proceed.

## 2. Technical Approach
We will build the class SemanticValidator and test it thoroughly using jest mocks and cached results.

## 3. Impact Analysis
No major regressions expected, this adds a solid quality gate to our pipeline.

## 4. Task Breakdown
- Task A: Code implementation of semantic-validator.ts
- Task B: Add integration tests and coverage checks

## 5. Risk Assessment
No high risk. Cache avoids latency.
    `;

    it('should load cached results and skip calling LLM on duplicate runs', async () => {
      let callCount = 0;
      const mockLLMCaller = async (prompt: string): Promise<string> => {
        callCount++;
        return JSON.stringify({
          score: 90,
          reason: 'First call evaluation.',
        });
      };

      const validator = new SemanticValidator({
        projectRoot: tempProjectRoot,
        llmCaller: mockLLMCaller,
      });

      // First run: calls mockLLMCaller
      const result1 = await validator.validate(ticketAc, validReport);
      expect(result1.passed).toBe(true);
      expect(result1.score).toBe(90);
      expect(callCount).toBe(1);

      // Second run: should be cached
      const result2 = await validator.validate(ticketAc, validReport);
      expect(result2.passed).toBe(true);
      expect(result2.score).toBe(90);
      expect(callCount).toBe(1); // Call count should remain 1!
    });
  });
});
