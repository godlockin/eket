/**
 * knowledge:index + knowledge:gc 命令
 *
 * knowledge:index --rebuild
 *   扫描 confluence/memory/**\/*.md，提取首行 + frontmatter tags
 *   生成 confluence/memory/memory-index.md（≤50 行硬约束）
 *
 * knowledge:gc --dry-run
 *   按 mtime 排序列出候选淘汰文件（90天未修改）
 *
 * knowledge:gc --execute
 *   删除候选文件（二次确认）+ 自动 --rebuild 索引
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

import { Command } from 'commander';

import { findProjectRoot } from '../utils/process-cleanup.js';

const MAX_INDEX_LINES = 50;
const GC_DAYS = 90;
const STATE_FILE = '.eket-index-state.json';
const STATE_VERSION = 1;

// ── IndexState ─────────────────────────────────────────────────────────────────

export interface IndexFileState {
  sha256: string;
  indexed_at: string;
  entry_count: number;
}

export interface IndexState {
  version: number;
  files: Record<string, IndexFileState>;
  last_full_rebuild: string | null;
}

export function emptyState(): IndexState {
  return { version: STATE_VERSION, files: {}, last_full_rebuild: null };
}

export function loadState(dir: string): IndexState {
  const statePath = path.join(dir, STATE_FILE);
  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(raw) as IndexState;
    if (parsed.version !== STATE_VERSION) {return emptyState();}
    return parsed;
  } catch {
    return emptyState();
  }
}

export function saveState(dir: string, state: IndexState): void {
  const statePath = path.join(dir, STATE_FILE);
  const tmp = path.join(os.tmpdir(), `eket-state-${Date.now()}-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
  // atomic rename-based write (lock-free safe on single-process use)
  fs.renameSync(tmp, statePath);
}

export function hashFileContent(absPath: string): string {
  const content = fs.readFileSync(absPath);
  return crypto.createHash('sha256').update(content).digest('hex');
}


// ── helpers ──────────────────────────────────────────────────────────────────

export function walkMd(dir: string): string[] {
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

export interface MemoryFileMeta {
  absPath: string;
  relPath: string;   // relative to memoryDir
  summary: string;   // first non-empty line (frontmatter stripped)
  tags: string[];
  mtime: Date;
  sizeBytes: number;
}

/**
 * Parse frontmatter tags from markdown file content.
 * Supports YAML list: `tags: [a, b]` or `tags:\n  - a\n  - b`
 */
export function parseFrontmatterTags(content: string): string[] {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {return [];}
  const fm = fmMatch[1];
  // inline: tags: [a, b, c]
  const inline = fm.match(/^tags:\s*\[([^\]]*)\]/m);
  if (inline) {
    return inline[1].split(',').map((t) => t.trim()).filter(Boolean);
  }
  // block: tags:\n  - a\n  - b
  const blockMatch = fm.match(/^tags:\s*\n((?:\s+-\s+.+\n?)+)/m);
  if (blockMatch) {
    return blockMatch[1]
      .split('\n')
      .map((l) => l.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Extract first meaningful summary line (skip frontmatter, skip blank lines).
 */
export function extractSummary(content: string): string {
  let body = content;
  // strip frontmatter
  if (body.startsWith('---')) {
    const end = body.indexOf('\n---', 3);
    if (end !== -1) {body = body.slice(end + 4);}
  }
  for (const line of body.split('\n')) {
    const trimmed = line.replace(/^#+\s*/, '').trim();
    if (trimmed) {return trimmed;}
  }
  return '(empty)';
}

export function loadMemoryMeta(memoryDir: string): MemoryFileMeta[] {
  const files = walkMd(memoryDir).filter(
    (f) => path.basename(f) !== 'memory-index.md',
  );
  return files.map((absPath) => {
    const content = fs.readFileSync(absPath, 'utf-8');
    const stat = fs.statSync(absPath);
    return {
      absPath,
      relPath: path.relative(memoryDir, absPath),
      summary: extractSummary(content),
      tags: parseFrontmatterTags(content),
      mtime: stat.mtime,
      sizeBytes: stat.size,
    };
  });
}

export function buildIndexLines(metas: MemoryFileMeta[]): string[] {
  return metas.map((m) => {
    const tagStr = m.tags.length > 0 ? ' ' + m.tags.map((t) => `#${t}`).join(' ') : '';
    const summary = m.summary.slice(0, 80);
    return `${m.relPath}: ${summary}${tagStr}`;
  });
}

// ── index command ─────────────────────────────────────────────────────────────

export interface RebuildResult {
  lines: number;
  warned: boolean;
}

export interface IncrementalResult {
  changed: number;
  unchanged: number;
  deleted: number;
  lines: number;
  warned: boolean;
  elapsedMs: number;
}

export async function rebuildIndex(memoryDir: string): Promise<RebuildResult & { state?: IndexState }> {
  const metas = loadMemoryMeta(memoryDir);
  const lines = buildIndexLines(metas);

  const warned = lines.length > MAX_INDEX_LINES;
  if (warned) {
    console.warn(
      `[WARN] memory index exceeds ${MAX_INDEX_LINES} lines (${lines.length} lines). Run knowledge:gc to prune.`,
    );
    const oldest = [...metas]
      .sort((a, b) => a.mtime.getTime() - b.mtime.getTime())
      .slice(0, 10);
    console.warn('[WARN] GC candidates (oldest):');
    for (const m of oldest) {
      console.warn(`  ${m.relPath}  (${m.mtime.toISOString().slice(0, 10)})`);
    }
  }

  const header = [
    `<!-- AUTO-GENERATED by knowledge:index --rebuild — DO NOT EDIT -->`,
    `<!-- Generated: ${new Date().toISOString()} | Files: ${metas.length} -->`,
    ``,
    `# Memory Index`,
    ``,
    `> Format: \`filename: first-line-summary #tag1 #tag2\``,
    ``,
  ];

  const output = [...header, ...lines].join('\n') + '\n';
  const outPath = path.join(memoryDir, 'memory-index.md');
  fs.writeFileSync(outPath, output, 'utf-8');
  console.log(`[knowledge:index] 生成 ${outPath}（${lines.length} 条目）`);

  // Build new state from all files
  const now = new Date().toISOString();
  const newState: IndexState = {
    version: STATE_VERSION,
    files: {},
    last_full_rebuild: now,
  };
  for (const m of metas) {
    newState.files[m.relPath] = {
      sha256: hashFileContent(m.absPath),
      indexed_at: now,
      entry_count: 1,
    };
  }
  saveState(memoryDir, newState);

  return { lines: lines.length, warned, state: newState };
}

export async function incrementalIndex(memoryDir: string): Promise<IncrementalResult> {
  const t0 = Date.now();
  const state = loadState(memoryDir);

  // Scan current files
  const currentFiles = walkMd(memoryDir).filter(
    (f) => path.basename(f) !== 'memory-index.md',
  );
  const relToAbs = new Map<string, string>();
  for (const f of currentFiles) {
    relToAbs.set(path.relative(memoryDir, f), f);
  }

  const previousPaths = new Set(Object.keys(state.files));
  const currentPaths = new Set(relToAbs.keys());

  // Detect deleted
  const deleted: string[] = [];
  for (const p of previousPaths) {
    if (!currentPaths.has(p)) {deleted.push(p);}
  }

  // Detect changed/new
  const toProcess: string[] = [];
  let unchanged = 0;
  for (const relPath of currentPaths) {
    const absPath = relToAbs.get(relPath)!;
    const hash = hashFileContent(absPath);
    const prev = state.files[relPath];
    if (!prev || prev.sha256 !== hash) {
      toProcess.push(relPath);
    } else {
      unchanged++;
    }
  }

  // Apply deletions from state
  const newStateFiles: Record<string, IndexFileState> = { ...state.files };
  for (const d of deleted) {
    delete newStateFiles[d];
  }

  // Re-index changed/new files (update metadata + state entry)
  const now = new Date().toISOString();
  for (const relPath of toProcess) {
    const absPath = relToAbs.get(relPath)!;
    const hash = hashFileContent(absPath);
    newStateFiles[relPath] = {
      sha256: hash,
      indexed_at: now,
      entry_count: 1,
    };
  }

  // Rebuild full index output using all current files
  const metas = loadMemoryMeta(memoryDir);
  const lines = buildIndexLines(metas);
  const warned = lines.length > MAX_INDEX_LINES;

  const header = [
    `<!-- AUTO-GENERATED by knowledge:index — DO NOT EDIT -->`,
    `<!-- Generated: ${now} | Files: ${metas.length} -->`,
    ``,
    `# Memory Index`,
    ``,
    `> Format: \`filename: first-line-summary #tag1 #tag2\``,
    ``,
  ];
  const output = [...header, ...lines].join('\n') + '\n';
  const outPath = path.join(memoryDir, 'memory-index.md');
  fs.writeFileSync(outPath, output, 'utf-8');

  const newState: IndexState = {
    version: STATE_VERSION,
    files: newStateFiles,
    last_full_rebuild: state.last_full_rebuild,
  };
  saveState(memoryDir, newState);

  const elapsedMs = Date.now() - t0;
  return {
    changed: toProcess.length,
    unchanged,
    deleted: deleted.length,
    lines: lines.length,
    warned,
    elapsedMs,
  };
}

// ── gc command ───────────────────────────────────────────────────────────────

export interface GcCandidate {
  relPath: string;
  absPath: string;
  mtime: Date;
  sizeBytes: number;
  daysSinceModified: number;
}

export function findGcCandidates(memoryDir: string, gcDays = GC_DAYS): GcCandidate[] {
  const metas = loadMemoryMeta(memoryDir);
  const now = Date.now();
  const MS_PER_DAY = 86400 * 1000;

  return metas
    .map((m) => ({
      relPath: m.relPath,
      absPath: m.absPath,
      mtime: m.mtime,
      sizeBytes: m.sizeBytes,
      daysSinceModified: Math.floor((now - m.mtime.getTime()) / MS_PER_DAY),
    }))
    .filter((c) => c.daysSinceModified >= gcDays)
    .sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {return `${bytes}B`;}
  if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)}KB`;}
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ── register ──────────────────────────────────────────────────────────────────

export function registerKnowledge(program: Command): void {
  // knowledge:index
  program
    .command('knowledge:index')
    .description('扫描 confluence/memory/**/*.md，生成 memory-index.md（≤50行）')
    .option('--rebuild', '重建索引', false)
    .action(async (opts: { rebuild: boolean }) => {
      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        console.error('[knowledge:index] 未找到项目根目录');
        process.exit(1);
      }
      const memoryDir = path.join(projectRoot, 'confluence', 'memory');
      if (opts.rebuild) {
        await rebuildIndex(memoryDir);
      } else {
        const result = await incrementalIndex(memoryDir);
        console.log(
          `[knowledge:index] Indexed ${result.changed} changed files (${result.unchanged} unchanged, ${result.deleted} deleted) in ${result.elapsedMs}ms`,
        );
      }
    });

  // knowledge:gc
  program
    .command('knowledge:gc')
    .description('列出/删除 90天+ 未修改的 memory 文件')
    .option('--dry-run', '仅列出候选，不删除', false)
    .option('--execute', '删除候选文件并重建索引', false)
    .option('--gc-days <n>', '自定义 GC 天数阈值', String(GC_DAYS))
    .action(
      async (opts: { dryRun: boolean; execute: boolean; gcDays: string }) => {
        if (!opts.dryRun && !opts.execute) {
          console.error('[knowledge:gc] 需要 --dry-run 或 --execute');
          process.exit(1);
        }
        const projectRoot = await findProjectRoot();
        if (!projectRoot) {
          console.error('[knowledge:gc] 未找到项目根目录');
          process.exit(1);
        }
        const memoryDir = path.join(projectRoot, 'confluence', 'memory');
        const gcDays = parseInt(opts.gcDays, 10) || GC_DAYS;
        const candidates = findGcCandidates(memoryDir, gcDays);

        if (candidates.length === 0) {
          console.log(`[knowledge:gc] 无候选文件（${gcDays}天阈值）`);
          return;
        }

        console.log(`\n[knowledge:gc] 候选文件（${gcDays}天+ 未修改，共 ${candidates.length} 个）:\n`);
        let totalSize = 0;
        for (const c of candidates) {
          totalSize += c.sizeBytes;
          console.log(
            `  [${c.daysSinceModified}d]  ${formatSize(c.sizeBytes).padStart(7)}  ${c.relPath}`,
          );
        }
        console.log(`\n  合计: ${formatSize(totalSize)}\n`);

        if (opts.execute) {
          const ok = await confirm(
            `确认删除以上 ${candidates.length} 个文件? [y/N] `,
          );
          if (!ok) {
            console.log('[knowledge:gc] 已取消');
            return;
          }
          for (const c of candidates) {
            fs.unlinkSync(c.absPath);
            console.log(`  deleted: ${c.relPath}`);
          }
          console.log('[knowledge:gc] 删除完成，重建索引...');
          await rebuildIndex(memoryDir);
        }
      },
    );
}
