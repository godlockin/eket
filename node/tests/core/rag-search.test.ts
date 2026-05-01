/**
 * RAG Search Tests
 * Tests for KeywordSearchStrategy, VectorSearchStrategy, and RAGService
 */

import { SQLiteClient } from '../../src/core/sqlite-client.js';
import {
  RAGService,
  KeywordSearchStrategy,
  VectorSearchStrategy,
  hashEmbedding,
} from '../../src/core/rag-search.js';

describe('RAG Search', () => {
  let client: SQLiteClient;

  beforeEach(() => {
    client = new SQLiteClient(':memory:');
    const conn = client.connect();
    expect(conn.success).toBe(true);

    // 写入 3 条知识
    const docs = [
      { id: 'doc1', content: 'TypeScript type safety prevents runtime errors', path: 'ts.md' },
      { id: 'doc2', content: 'Redis caching improves performance dramatically', path: 'redis.md' },
      { id: 'doc3', content: 'SQLite is a lightweight embedded database', path: 'sqlite.md' },
    ];
    for (const d of docs) {
      const r = client.insertKnowledge(d.id, d.content, d.path, hashEmbedding(d.content));
      expect(r.success).toBe(true);
    }
  });

  afterEach(() => {
    client.close();
  });

  describe('KeywordSearchStrategy', () => {
    it('关键词命中正确文档', async () => {
      const strategy = new KeywordSearchStrategy(client);
      const results = await strategy.search('TypeScript', 5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].docId).toBe('doc1');
      expect(results[0].matchType).toBe('keyword');
    });

    it('无匹配时返回空数组', async () => {
      const strategy = new KeywordSearchStrategy(client);
      const results = await strategy.search('nonexistent_xyz_abc', 5);
      expect(results).toHaveLength(0);
    });
  });

  describe('VectorSearchStrategy', () => {
    it('相同文本余弦相似度=1（score最高）', async () => {
      const strategy = new VectorSearchStrategy(client);
      // 查询与 doc3 内容完全相同
      const results = await strategy.search('SQLite is a lightweight embedded database', 5);
      expect(results.length).toBeGreaterThan(0);
      // doc3 应该得分最高
      expect(results[0].docId).toBe('doc3');
      expect(results[0].score).toBeCloseTo(1, 5);
      expect(results[0].matchType).toBe('vector');
    });

    it('返回结果按 score 降序', async () => {
      const strategy = new VectorSearchStrategy(client);
      const results = await strategy.search('database caching', 5);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe('RAGService', () => {
    it('合并结果不重复', async () => {
      const rag = new RAGService(client);
      const results = await rag.search('SQLite database', 5);
      const docIds = results.map((r) => r.docId);
      const unique = new Set(docIds);
      expect(docIds.length).toBe(unique.size);
    });

    it('结果按 score 降序', async () => {
      const rag = new RAGService(client);
      const results = await rag.search('TypeScript', 5);
      expect(results.length).toBeGreaterThan(0);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('topK 限制生效', async () => {
      const rag = new RAGService(client);
      const results = await rag.search('database', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('hashEmbedding', () => {
    it('同文本相似度=1', () => {
      const text = 'hello world test embedding';
      const a = hashEmbedding(text);
      const b = hashEmbedding(text);
      let dot = 0;
      for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
      expect(dot).toBeCloseTo(1, 5);
    });

    it('返回 128 维向量', () => {
      expect(hashEmbedding('test')).toHaveLength(128);
    });
  });
});
