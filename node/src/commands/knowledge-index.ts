/**
 * knowledge:index 命令
 * 扫描 confluence/memory/**\/*.md，分块写入 SQLite（FTS5 + 向量）
 * 支持 --proof-required（默认 true）和 --strict 模式门控
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';

import { hashEmbedding } from '../core/rag-search.js';
import { SQLiteClient } from '../core/sqlite-client.js';
import type {
  KnowledgeIndexEntry,
  KnowledgeValidationError,
  KnowledgeValidationResult,
} from '../types/index.js';
import { findProjectRoot } from '../utils/process-cleanup.js';

const MAX_CHUNK = 500;

// ============================================================================
// Proof Validation
// ============================================================================

/**
 * Validate a KnowledgeEntry's proof block.
 * Returns structured errors so callers can log or exit(1).
 */
export function validateKnowledgeProof(entry: Partial<KnowledgeIndexEntry>): KnowledgeValidationResult {
  const errors: KnowledgeValidationError[] = [];

  if (!entry.proof) {
    errors.push({ field: 'proof', message: 'proof block is required' });
    return { valid: false, errors };
  }

  const { proof } = entry;

  if (!proof.task_id || typeof proof.task_id !== 'string' || proof.task_id.trim() === '') {
    errors.push({
      field: 'proof.task_id',
      message: 'task_id must be a non-empty string',
      received: proof.task_id,
    });
  }

  if ((proof as { exit_code?: unknown }).exit_code !== 0) {
    errors.push({
      field: 'proof.exit_code',
      message: 'exit_code must be 0 (only successful executions can be indexed)',
      received: (proof as { exit_code?: unknown }).exit_code,
    });
  }

  if (!proof.timestamp || typeof proof.timestamp !== 'string') {
    errors.push({
      field: 'proof.timestamp',
      message: 'timestamp must be an ISO 8601 string',
      received: proof.timestamp,
    });
  } else {
    const d = new Date(proof.timestamp);
    if (isNaN(d.getTime())) {
      errors.push({
        field: 'proof.timestamp',
        message: 'timestamp is not a valid ISO 8601 date',
        received: proof.timestamp,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Detect whether a markdown file contains a proof front-matter block.
 * Heuristic: look for `proof:` key at top of file (YAML front-matter or inline).
 */
export function hasProofMetadata(content: string): boolean {
  // YAML front matter between --- fences
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    return /\bproof\s*:/.test(fmMatch[1]);
  }
  // Fallback: inline proof comment block  <!-- proof: {...} -->
  return /<!--\s*proof\s*:/.test(content) || /\bproof\s*:\s*\{/.test(content);
}

// ============================================================================
// Chunk helpers (unchanged)
// ============================================================================

function chunkText(text: string): string[] {
  const paras = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';
  for (const para of paras) {
    if ((current + '\n\n' + para).trim().length > MAX_CHUNK && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current.trim()) {chunks.push(current.trim());}
  return chunks.filter((c) => c.length > 0);
}

function walkMd(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) {return files;}
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMd(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

// ============================================================================
// Command registration
// ============================================================================

export function registerKnowledgeIndex(program: Command): void {
  program
    .command('knowledge:index')
    .description('扫描 confluence/memory/**/*.md，分块写入 SQLite（FTS5 + 向量）')
    .option('--db <path>', 'SQLite 数据库路径')
    .option(
      '--proof-required [bool]',
      '写入前校验 execution proof（默认 true）',
      (v: string) => v !== 'false',
      true,
    )
    .option(
      '--strict',
      '严格模式：无 proof 的已有文件拒绝追加（默认 false）',
      false,
    )
    .action(async (opts: { db?: string; proofRequired: boolean; strict: boolean }) => {
      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        console.error('[knowledge:index] 未找到项目根目录');
        process.exit(1);
      }

      const dbPath =
        opts.db ?? path.join(projectRoot, '.eket', 'data', 'sqlite', 'eket.db');
      const client = new SQLiteClient(dbPath);
      const conn = client.connect();
      if (!conn.success) {
        console.error('[knowledge:index] DB 连接失败:', conn.error?.message);
        process.exit(1);
      }

      const memoryDir = path.join(projectRoot, 'confluence', 'memory');
      const mdFiles = walkMd(memoryDir);
      console.log(`[knowledge:index] 发现 ${mdFiles.length} 个 .md 文件`);

      let total = 0;
      let skipped = 0;
      let rejected = 0;

      for (const file of mdFiles) {
        const text = fs.readFileSync(file, 'utf-8');
        const rel = path.relative(projectRoot, file);

        // --proof-required validation
        if (opts.proofRequired) {
          if (!hasProofMetadata(text)) {
            if (opts.strict) {
              console.error(
                JSON.stringify({
                  type: 'PROOF_REQUIRED_ERROR',
                  file: rel,
                  message:
                    'File has no execution proof metadata. ' +
                    'Add proof front-matter or use --proof-required=false to allow legacy files.',
                }),
              );
              rejected++;
              continue; // skip this file in strict mode
            } else {
              // Non-strict: allow reading (index) but warn
              console.warn(
                `[knowledge:index] WARN: ${rel} has no proof metadata ` +
                  '(backward-compat read-only mode; use --strict to block)',
              );
              skipped++;
            }
          }
        }

        const chunks = chunkText(text);
        for (let i = 0; i < chunks.length; i++) {
          const docId = `${rel}#${i}`;
          const embedding = hashEmbedding(chunks[i]);
          const result = client.insertKnowledge(docId, chunks[i], rel, embedding);
          if (!result.success) {
            console.warn(`[knowledge:index] 写入失败 ${docId}:`, result.error?.message);
          } else {
            total++;
          }
        }
      }

      if (rejected > 0) {
        console.error(
          `[knowledge:index] FAILED — ${rejected} 文件因缺少 execution proof 被拒绝写入 (--strict 模式)`,
        );
        process.exit(1);
      }

      console.log(
        `[knowledge:index] 完成，共写入 ${total} 块` +
          (skipped > 0 ? `，${skipped} 文件无 proof（向后兼容读取）` : ''),
      );
    });
}
