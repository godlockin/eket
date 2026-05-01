/**
 * RAG 检索策略模块
 * 3层渐进式检索：FTS5 关键词 + 余弦向量，合并排序
 */

import type { SQLiteClient } from './sqlite-client.js';

export interface SearchResult {
  docId: string;
  content: string;
  sourcePath: string;
  score: number;
  matchType: 'keyword' | 'vector';
}

export interface SearchStrategy {
  search(query: string, topK: number): Promise<SearchResult[]>;
}

// --- 余弦相似度（纯 JS）---
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {return 0;}
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// --- Hash 向量（128 维，无需外部 API）---
export function hashEmbedding(text: string): number[] {
  const DIM = 128;
  const vec = new Array<number>(DIM).fill(0);
  const normalized = text.toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    const idx = (code * 31 + i * 17) % DIM;
    vec[idx] += 1;
    // bigram
    if (i + 1 < normalized.length) {
      const idx2 = ((code * 37 + normalized.charCodeAt(i + 1) * 13) % DIM + DIM) % DIM;
      vec[idx2] += 0.5;
    }
  }
  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm === 0 ? vec : vec.map((v) => v / norm);
}

// --- 关键词检索策略（FTS5）---
export class KeywordSearchStrategy implements SearchStrategy {
  constructor(private db: SQLiteClient) {}

  async search(query: string, topK: number): Promise<SearchResult[]> {
    const result = this.db.searchFTS(query, topK);
    if (!result.success || !result.data) {return [];}
    return result.data.map((row, i) => ({
      docId: row.docId,
      content: row.content,
      sourcePath: row.sourcePath,
      // FTS5 结果天然按相关性排序，用倒数排名作 score
      score: 1 / (i + 1),
      matchType: 'keyword' as const,
    }));
  }
}

// --- 向量检索策略（余弦相似度）---
export class VectorSearchStrategy implements SearchStrategy {
  constructor(private db: SQLiteClient) {}

  async search(query: string, topK: number): Promise<SearchResult[]> {
    const result = this.db.getAllEmbeddings();
    if (!result.success || !result.data || result.data.length === 0) {return [];}

    const queryVec = hashEmbedding(query);
    const scored = result.data.map((row) => ({
      docId: row.docId,
      content: row.content,
      sourcePath: '',
      score: cosineSimilarity(queryVec, row.embedding),
      matchType: 'vector' as const,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

// --- RAGService：合并两层检索 ---
export class RAGService {
  private keyword: KeywordSearchStrategy;
  private vector: VectorSearchStrategy;

  constructor(db: SQLiteClient) {
    this.keyword = new KeywordSearchStrategy(db);
    this.vector = new VectorSearchStrategy(db);
  }

  async search(query: string, topK = 5): Promise<SearchResult[]> {
    const [kwResults, vecResults] = await Promise.all([
      this.keyword.search(query, topK),
      this.vector.search(query, topK),
    ]);

    // 合并去重（docId 唯一），取最高 score
    const merged = new Map<string, SearchResult>();
    for (const r of [...kwResults, ...vecResults]) {
      const existing = merged.get(r.docId);
      if (!existing || r.score > existing.score) {
        merged.set(r.docId, r);
      }
    }

    const results = Array.from(merged.values());
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}
