/**
 * EKET Framework - Skill Index Loader (Layer 0)
 * TASK-103b
 *
 * 启动时扫描所有 skill.json，构建内存索引。
 * - nodes: 所有 SkillMeta
 * - hotEdges: weight >= 0.6 的活跃边（SQLite 不可用时降级为 []）
 * - modelRouteTable: domain → 推荐 level（1/2/3）
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createSQLiteClient } from '../core/sqlite-client.js';

import type { SkillMeta } from './types.js';

// ============================================================================
// Public Types
// ============================================================================

export interface SkillIndex {
  nodes: SkillMeta[];
  /** 高权重边（weight >= 0.6，来自 skill_edges 表） */
  hotEdges: Array<{ source: string; target: string; weight: number }>;
  /** 模型路由表：domain → recommended level */
  modelRouteTable: Record<string, 1 | 2 | 3>;
}

// ============================================================================
// Module-level singleton
// ============================================================================

let _index: SkillIndex | null = null;

// ============================================================================
// Helpers
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = resolve(__dirname, '.');

/**
 * 递归扫描目录，收集所有 *.json 文件路径（排除 node_modules）
 */
function collectJsonFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry === 'node_modules') {continue;}
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      results.push(...collectJsonFiles(full));
    } else if (entry.endsWith('.json')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * 验证对象是否满足 SkillMeta 最低结构
 */
function isSkillMeta(obj: unknown): obj is SkillMeta {
  if (!obj || typeof obj !== 'object') {return false;}
  const o = obj as Record<string, unknown>;
  return (
    typeof o['id'] === 'string' &&
    (o['type'] === 'skill' || o['type'] === 'expert') &&
    typeof o['domain'] === 'string' &&
    (o['level'] === 1 || o['level'] === 2 || o['level'] === 3) &&
    (o['model_hint'] === 'haiku' || o['model_hint'] === 'sonnet' || o['model_hint'] === 'opus') &&
    Array.isArray(o['triggers']) &&
    Array.isArray(o['collaborates_with']) &&
    typeof o['lazy'] === 'boolean'
  );
}

/**
 * 从 SQLite 加载 weight >= 0.6 的活跃边
 * 不可用时静默返回 []
 */
async function loadHotEdgesFromSQLite(): Promise<Array<{ source: string; target: string; weight: number }>> {
  try {
    const client = createSQLiteClient();
    const result = client.all(
      `SELECT source_id, target_id, weight
       FROM skill_edges
       WHERE active = 1 AND weight >= 0.6
       ORDER BY weight DESC`
    );
    if (!result.success || !result.data) {return [];}
    return (result.data as Array<{ source_id: string; target_id: string; weight: number }>).map((r) => ({
      source: r.source_id,
      target: r.target_id,
      weight: r.weight,
    }));
  } catch {
    return [];
  }
}

/**
 * 从 nodes 统计每个 domain 的平均 level，取整 clamp 到 1-3
 */
function buildModelRouteTable(nodes: SkillMeta[]): Record<string, 1 | 2 | 3> {
  const domainLevels: Record<string, number[]> = {};
  for (const node of nodes) {
    if (!domainLevels[node.domain]) {domainLevels[node.domain] = [];}
    domainLevels[node.domain].push(node.level);
  }
  const table: Record<string, 1 | 2 | 3> = {};
  for (const [domain, levels] of Object.entries(domainLevels)) {
    const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
    const rounded = Math.round(avg) as 1 | 2 | 3;
    table[domain] = (Math.min(3, Math.max(1, rounded))) as 1 | 2 | 3;
  }
  return table;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * 扫描所有 skill.json，构建并缓存 SkillIndex。
 * 幂等：二次调用直接返回已有单例。
 */
export async function loadSkillIndex(): Promise<SkillIndex> {
  if (_index) {return _index;}

  const t0 = Date.now();

  // 1. 扫描文件
  const jsonFiles = collectJsonFiles(SKILLS_ROOT);
  const nodes: SkillMeta[] = [];

  for (const filePath of jsonFiles) {
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (isSkillMeta(parsed)) {
        nodes.push(parsed);
      }
    } catch {
      // 跳过无法解析的文件
    }
  }

  // 2. 加载 hotEdges（SQLite 降级不报错）
  const hotEdges = await loadHotEdgesFromSQLite();

  // 3. 构建 modelRouteTable
  const modelRouteTable = buildModelRouteTable(nodes);

  const elapsed = Date.now() - t0;
  if (process.env.EKET_LOG_LEVEL !== 'silent') {
    console.log(`[SkillIndexLoader] Loaded ${nodes.length} nodes, ${hotEdges.length} hotEdges in ${elapsed}ms`);
  }

  _index = { nodes, hotEdges, modelRouteTable };
  return _index;
}

/**
 * 返回内存单例。未初始化时抛错。
 */
export function getSkillIndex(): SkillIndex {
  if (!_index) {
    throw new Error('[SkillIndexLoader] SkillIndex not initialized. Call loadSkillIndex() first.');
  }
  return _index;
}

/**
 * 重置单例（主要用于测试）
 */
export function resetSkillIndex(): void {
  _index = null;
}
