/**
 * Integration tests for ContextEstimator with ContextAlert
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ContextEstimator } from '../../src/core/context-estimator.js';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_INBOX_DIR = '.eket/inbox';
const TEST_STATE_FILE = '.eket/state/alerted-tasks.json';
const TEST_JIRA_DIR = 'jira/tickets/test';

describe('ContextEstimator Integration with ContextAlert', () => {
  beforeEach(() => {
    cleanupTestFiles();
  });

  afterEach(() => {
    cleanupTestFiles();
  });

  it('should not alert when tokens below threshold', async () => {
    const estimator = new ContextEstimator('TASK-100');

    // Create small test files (will be under 150K tokens)
    createTestFiles(10); // 10 small files

    const result = await estimator.estimate();

    expect(result.alerted).toBeUndefined(); // No alert triggered
    expect(existsSync(join(TEST_INBOX_DIR, 'context-risk-TASK-100.md'))).toBe(false);
  });

  it('should alert when tokens exceed threshold with taskId', async () => {
    const estimator = new ContextEstimator('TASK-200');

    // Create large test files (will exceed 150K tokens with precise estimation)
    createTestFiles(100); // 100 large files

    const result = await estimator.estimate();

    if (result.tokens >= 150000) {
      expect(result.alerted).toBe(true);
      expect(existsSync(join(TEST_INBOX_DIR, 'context-risk-TASK-200.md'))).toBe(true);
    } else {
      // If tokens below threshold, should not alert
      expect(result.alerted).toBe(false);
    }
  });

  it('should not alert when no taskId provided', async () => {
    const estimator = new ContextEstimator(); // No taskId

    createTestFiles(100); // Large files

    const result = await estimator.estimate();

    // When no taskId, alerted should be false (not undefined)
    expect(result.alerted).toBe(false);
  });

  it('should deduplicate alerts across multiple estimates', async () => {
    const taskId = 'TASK-300';
    createTestFiles(100); // Large files to trigger alert

    // First estimate - should alert (if tokens > 150K)
    const estimator1 = new ContextEstimator(taskId);
    const result1 = await estimator1.estimate();

    // Second estimate - should not alert (duplicate)
    const estimator2 = new ContextEstimator(taskId);
    const result2 = await estimator2.estimate();

    if (result1.tokens >= 150000) {
      expect(result1.alerted).toBe(true);
      expect(result2.alerted).toBe(false); // Deduplicated
    }
  });

  it('should include tokens and method in result', async () => {
    const estimator = new ContextEstimator('TASK-400');

    createTestFiles(5);

    const result = await estimator.estimate();

    expect(result.tokens).toBeGreaterThan(0);
    expect(['rough', 'precise']).toContain(result.method);
    expect(result.duration).toBeGreaterThan(0);
  });
});

/**
 * Create test markdown files for estimation
 */
function createTestFiles(count: number): void {
  if (!existsSync(TEST_JIRA_DIR)) {
    mkdirSync(TEST_JIRA_DIR, { recursive: true });
  }

  for (let i = 0; i < count; i++) {
    const content = generateMarkdownContent(i);
    writeFileSync(join(TEST_JIRA_DIR, `test-${i}.md`), content, 'utf-8');
  }
}

/**
 * Generate markdown content of varying sizes
 */
function generateMarkdownContent(index: number): string {
  const baseContent = `# Test Document ${index}

## Introduction
This is a test document for context estimation.

## Content
`.repeat(10);

  // Add more content for higher indices to vary file sizes
  const extraContent = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(index * 10);

  return baseContent + extraContent;
}

/**
 * Clean up test artifacts
 */
function cleanupTestFiles(): void {
  // Clean test jira directory
  if (existsSync(TEST_JIRA_DIR)) {
    rmSync(TEST_JIRA_DIR, { recursive: true, force: true });
  }

  // Clean inbox alert files
  if (existsSync(TEST_INBOX_DIR)) {
    const files = [
      'context-risk-TASK-100.md',
      'context-risk-TASK-200.md',
      'context-risk-TASK-300.md',
      'context-risk-TASK-400.md'
    ];

    for (const file of files) {
      const path = join(TEST_INBOX_DIR, file);
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }
  }

  // Clean state file
  if (existsSync(TEST_STATE_FILE)) {
    unlinkSync(TEST_STATE_FILE);
  }
}
