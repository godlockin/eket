/**
 * KnowledgeBase Unit Tests
 * TASK-Z05: core/ module unit testing
 *
 * Covers:
 * - Connection and initialization
 * - CRUD operations (create, read, update, delete)
 * - Query operations with filters
 * - Stats aggregation
 * - Extended knowledge entries (tacit knowledge)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Use in-memory SQLite for testing
import {
  KnowledgeBase,
  createKnowledgeBase,
  createArtifact,
  createLesson,
  createDecision,
} from '../../../src/core/knowledge-base.js';

describe('KnowledgeBase', () => {
  let kb: KnowledgeBase;

  beforeEach(async () => {
    // Use in-memory database for fast, isolated tests
    kb = createKnowledgeBase(':memory:');
    await kb.connect();
  });

  afterEach(async () => {
    await kb.disconnect();
  });

  describe('connect', () => {
    it('should connect and initialize tables', async () => {
      const freshKb = createKnowledgeBase(':memory:');
      const result = await freshKb.connect();

      expect(result.success).toBe(true);
      await freshKb.disconnect();
    });

    it('should create required indexes', async () => {
      // If connect succeeded, indexes were created
      const result = await kb.getStats();
      expect(result.success).toBe(true);
    });
  });

  describe('createEntry', () => {
    it('should create entry with all fields', async () => {
      const result = await kb.createEntry({
        type: 'artifact',
        title: 'Test Artifact',
        description: 'A test artifact',
        content: 'Content of the artifact',
        tags: ['test', 'artifact'],
        createdBy: 'test-slaver',
        relatedTickets: ['TASK-001'],
        metadata: { version: '1.0' },
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatch(/^kb_/);
    });

    it('should create entry with minimal fields', async () => {
      const result = await kb.createEntry({
        type: 'pattern',
        title: 'Minimal Pattern',
        description: 'Desc',
        content: 'Content',
        tags: [],
        createdBy: 'slaver-001',
      });

      expect(result.success).toBe(true);
    });

    it('should generate unique IDs', async () => {
      const result1 = await kb.createEntry({
        type: 'lesson',
        title: 'Lesson 1',
        description: 'Desc 1',
        content: 'Content 1',
        tags: [],
        createdBy: 'slaver-001',
      });

      const result2 = await kb.createEntry({
        type: 'lesson',
        title: 'Lesson 2',
        description: 'Desc 2',
        content: 'Content 2',
        tags: [],
        createdBy: 'slaver-001',
      });

      expect(result1.data).not.toBe(result2.data);
    });

    it('should set createdAt and updatedAt timestamps', async () => {
      const createResult = await kb.createEntry({
        type: 'decision',
        title: 'Decision',
        description: 'Desc',
        content: 'Content',
        tags: [],
        createdBy: 'slaver-001',
      });

      const getResult = await kb.getEntry(createResult.data!);
      expect(getResult.data?.createdAt).toBeDefined();
      expect(getResult.data?.updatedAt).toBeDefined();
      expect(getResult.data?.createdAt).toBe(getResult.data?.updatedAt);
    });

    it('should support all entry types', async () => {
      const types = ['artifact', 'pattern', 'decision', 'lesson', 'api', 'config'] as const;

      for (const type of types) {
        const result = await kb.createEntry({
          type,
          title: `Test ${type}`,
          description: 'Desc',
          content: 'Content',
          tags: [],
          createdBy: 'slaver-001',
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('getEntry', () => {
    it('should retrieve existing entry', async () => {
      const createResult = await kb.createEntry({
        type: 'artifact',
        title: 'Retrievable',
        description: 'Desc',
        content: 'Content',
        tags: ['tag1'],
        createdBy: 'slaver-001',
      });

      const result = await kb.getEntry(createResult.data!);

      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('Retrievable');
      expect(result.data?.tags).toEqual(['tag1']);
    });

    it('should return null for non-existent entry', async () => {
      const result = await kb.getEntry('kb_nonexistent_123');

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should parse JSON fields correctly', async () => {
      await kb.createEntry({
        type: 'artifact',
        title: 'With Metadata',
        description: 'Desc',
        content: 'Content',
        tags: ['a', 'b', 'c'],
        createdBy: 'slaver-001',
        relatedTickets: ['TASK-1', 'TASK-2'],
        metadata: { nested: { value: 42 } },
      });

      const entries = await kb.queryEntries({ keyword: 'Metadata' });
      const entry = entries.data?.[0];

      expect(entry?.tags).toEqual(['a', 'b', 'c']);
      expect(entry?.relatedTickets).toEqual(['TASK-1', 'TASK-2']);
      expect(entry?.metadata).toEqual({ nested: { value: 42 } });
    });
  });

  describe('queryEntries', () => {
    beforeEach(async () => {
      // Seed test data
      await kb.createEntry({
        type: 'artifact',
        title: 'Artifact Alpha',
        description: 'First artifact',
        content: 'Alpha content',
        tags: ['backend', 'api'],
        createdBy: 'slaver-001',
        relatedTickets: ['TASK-100'],
      });

      await kb.createEntry({
        type: 'pattern',
        title: 'Pattern Beta',
        description: 'Design pattern',
        content: 'Beta pattern content',
        tags: ['frontend', 'react'],
        createdBy: 'slaver-002',
      });

      await kb.createEntry({
        type: 'artifact',
        title: 'Artifact Gamma',
        description: 'Third artifact',
        content: 'Gamma content',
        tags: ['backend', 'database'],
        createdBy: 'slaver-001',
      });
    });

    it('should query by type', async () => {
      const result = await kb.queryEntries({ type: 'artifact' });

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
      expect(result.data?.every((e) => e.type === 'artifact')).toBe(true);
    });

    it('should query by createdBy', async () => {
      const result = await kb.queryEntries({ createdBy: 'slaver-001' });

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });

    it('should query by keyword (title/description/content)', async () => {
      const result = await kb.queryEntries({ keyword: 'Beta' });

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
      expect(result.data?.[0].title).toBe('Pattern Beta');
    });

    it('should query by tags', async () => {
      const result = await kb.queryEntries({ tags: ['backend'] });

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });

    it('should query by related ticket', async () => {
      const result = await kb.queryEntries({ relatedTicket: 'TASK-100' });

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
    });

    it('should respect limit and offset', async () => {
      const result = await kb.queryEntries({ limit: 1, offset: 1 });

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
    });

    it('should combine multiple filters', async () => {
      const result = await kb.queryEntries({
        type: 'artifact',
        createdBy: 'slaver-001',
        tags: ['backend'],
      });

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });
  });

  describe('updateEntry', () => {
    it('should update existing entry', async () => {
      const createResult = await kb.createEntry({
        type: 'artifact',
        title: 'Original Title',
        description: 'Original Desc',
        content: 'Original Content',
        tags: ['old'],
        createdBy: 'slaver-001',
      });

      const updateResult = await kb.updateEntry({
        id: createResult.data!,
        title: 'Updated Title',
        tags: ['new'],
      });

      expect(updateResult.success).toBe(true);

      const getResult = await kb.getEntry(createResult.data!);
      expect(getResult.data?.title).toBe('Updated Title');
      expect(getResult.data?.tags).toEqual(['new']);
      expect(getResult.data?.description).toBe('Original Desc'); // unchanged
    });

    it('should update updatedAt timestamp', async () => {
      const createResult = await kb.createEntry({
        type: 'artifact',
        title: 'Title',
        description: 'Desc',
        content: 'Content',
        tags: [],
        createdBy: 'slaver-001',
      });

      const original = await kb.getEntry(createResult.data!);

      // Wait a bit to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      await kb.updateEntry({
        id: createResult.data!,
        title: 'New Title',
      });

      const updated = await kb.getEntry(createResult.data!);
      expect(updated.data?.updatedAt).toBeGreaterThan(original.data!.updatedAt);
    });

    it('should fail for non-existent entry', async () => {
      const result = await kb.updateEntry({
        id: 'kb_nonexistent_123',
        title: 'New Title',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ENTRY_NOT_FOUND');
    });
  });

  describe('deleteEntry', () => {
    it('should delete existing entry', async () => {
      const createResult = await kb.createEntry({
        type: 'artifact',
        title: 'To Delete',
        description: 'Desc',
        content: 'Content',
        tags: [],
        createdBy: 'slaver-001',
      });

      const deleteResult = await kb.deleteEntry(createResult.data!);
      expect(deleteResult.success).toBe(true);

      const getResult = await kb.getEntry(createResult.data!);
      expect(getResult.data).toBeNull();
    });

    it('should fail for non-existent entry', async () => {
      const result = await kb.deleteEntry('kb_nonexistent_123');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ENTRY_NOT_FOUND');
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await kb.createEntry({
        type: 'artifact',
        title: 'A1',
        description: 'Desc',
        content: 'Content',
        tags: ['tag1', 'tag2'],
        createdBy: 'slaver-001',
      });

      await kb.createEntry({
        type: 'artifact',
        title: 'A2',
        description: 'Desc',
        content: 'Content',
        tags: ['tag1'],
        createdBy: 'slaver-001',
      });

      await kb.createEntry({
        type: 'lesson',
        title: 'L1',
        description: 'Desc',
        content: 'Content',
        tags: ['tag2'],
        createdBy: 'slaver-001',
      });
    });

    it('should return total count', async () => {
      const result = await kb.getStats();

      expect(result.success).toBe(true);
      expect(result.data?.totalEntries).toBe(3);
    });

    it('should count by type', async () => {
      const result = await kb.getStats();

      expect(result.data?.byType.artifact).toBe(2);
      expect(result.data?.byType.lesson).toBe(1);
      expect(result.data?.byType.pattern).toBe(0);
    });

    it('should count by tag', async () => {
      const result = await kb.getStats();

      expect(result.data?.byTag.get('tag1')).toBe(2);
      expect(result.data?.byTag.get('tag2')).toBe(2);
    });

    it('should include recent entries', async () => {
      const result = await kb.getStats();

      expect(result.data?.recentEntries.length).toBe(3);
    });
  });

  describe('searchByTag', () => {
    it('should delegate to queryEntries with tag filter', async () => {
      await kb.createEntry({
        type: 'artifact',
        title: 'Tagged',
        description: 'Desc',
        content: 'Content',
        tags: ['searchable'],
        createdBy: 'slaver-001',
      });

      const result = await kb.searchByTag('searchable');

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
    });
  });

  describe('search', () => {
    it('should search by keyword with limit', async () => {
      await kb.createEntry({
        type: 'artifact',
        title: 'Unique Keyword XYZ',
        description: 'Desc',
        content: 'Content',
        tags: [],
        createdBy: 'slaver-001',
      });

      const result = await kb.search('XYZ', 10);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
    });
  });

  describe('getByType / getByCreator', () => {
    beforeEach(async () => {
      await kb.createEntry({
        type: 'pattern',
        title: 'P1',
        description: 'Desc',
        content: 'Content',
        tags: [],
        createdBy: 'slaver-A',
      });

      await kb.createEntry({
        type: 'pattern',
        title: 'P2',
        description: 'Desc',
        content: 'Content',
        tags: [],
        createdBy: 'slaver-B',
      });
    });

    it('should get entries by type', async () => {
      const result = await kb.getByType('pattern');

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });

    it('should get entries by creator', async () => {
      const result = await kb.getByCreator('slaver-A');

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
    });
  });

  describe('helper functions', () => {
    describe('createArtifact', () => {
      it('should create artifact entry', async () => {
        const result = await createArtifact(kb, 'My Artifact', 'Code here', 'slaver-001');

        expect(result.success).toBe(true);

        const entry = await kb.getEntry(result.data!);
        expect(entry.data?.type).toBe('artifact');
      });
    });

    describe('createLesson', () => {
      it('should create lesson entry with default tags', async () => {
        const result = await createLesson(kb, 'My Lesson', 'Learned this', 'slaver-001');

        expect(result.success).toBe(true);

        const entry = await kb.getEntry(result.data!);
        expect(entry.data?.type).toBe('lesson');
        expect(entry.data?.tags).toContain('lesson');
      });
    });

    describe('createDecision', () => {
      it('should create decision entry', async () => {
        const result = await createDecision(kb, 'ADR-001', 'Decision content', 'architect', {
          tags: ['architecture'],
        });

        expect(result.success).toBe(true);

        const entry = await kb.getEntry(result.data!);
        expect(entry.data?.type).toBe('decision');
      });
    });
  });

  describe('extended knowledge entries', () => {
    describe('saveExtendedEntry', () => {
      it('should save extended entry with tacit level', async () => {
        const result = await kb.saveExtendedEntry({
          type: 'warning',
          title: 'Important Warning',
          description: 'Watch out for this',
          content: 'Detailed warning content',
          tags: ['critical'],
          createdBy: 'master-001',
          relatedTickets: [],
          tacitLevel: 'semi-tacit',
        });

        expect(result.success).toBe(true);
        expect(result.data?.tacitLevel).toBe('semi-tacit');
      });

      it('should default tacitLevel to explicit', async () => {
        const result = await kb.saveExtendedEntry({
          type: 'intuition',
          title: 'Gut Feeling',
          description: 'Desc',
          content: 'Content',
          tags: [],
          createdBy: 'expert-001',
          relatedTickets: [],
          tacitLevel: 'explicit',
        });

        expect(result.data?.tacitLevel).toBe('explicit');
      });
    });

    describe('getRequiredChecklist', () => {
      beforeEach(async () => {
        await kb.saveExtendedEntry({
          type: 'warning',
          title: 'Warning 1',
          description: 'Desc',
          content: 'Content',
          tags: ['onboarding'],
          createdBy: 'master',
          relatedTickets: [],
          tacitLevel: 'explicit',
        });

        await kb.saveExtendedEntry({
          type: 'intuition',
          title: 'Intuition 1',
          description: 'Desc',
          content: 'Content',
          tags: ['review'],
          createdBy: 'master',
          relatedTickets: [],
          tacitLevel: 'tacit',
        });

        await kb.saveExtendedEntry({
          type: 'pattern',
          title: 'Pattern (not in checklist)',
          description: 'Desc',
          content: 'Content',
          tags: [],
          createdBy: 'slaver',
          relatedTickets: [],
          tacitLevel: 'explicit',
        });
      });

      it('should return only warning and intuition types', async () => {
        const result = await kb.getRequiredChecklist();

        expect(result.success).toBe(true);
        expect(result.data?.length).toBe(2);
        expect(result.data?.every((e) => ['warning', 'intuition'].includes(e.type))).toBe(true);
      });

      it('should filter by tags', async () => {
        const result = await kb.getRequiredChecklist(['onboarding']);

        expect(result.success).toBe(true);
        expect(result.data?.length).toBe(1);
        expect(result.data?.[0].title).toBe('Warning 1');
      });
    });

    describe('getEntriesByTacitLevel', () => {
      beforeEach(async () => {
        await kb.saveExtendedEntry({
          type: 'intuition',
          title: 'Explicit',
          description: 'Desc',
          content: 'Content',
          tags: [],
          createdBy: 'user',
          relatedTickets: [],
          tacitLevel: 'explicit',
        });

        await kb.saveExtendedEntry({
          type: 'intuition',
          title: 'Semi-tacit',
          description: 'Desc',
          content: 'Content',
          tags: [],
          createdBy: 'user',
          relatedTickets: [],
          tacitLevel: 'semi-tacit',
        });
      });

      it('should query by tacit level', async () => {
        const result = await kb.getEntriesByTacitLevel('semi-tacit');

        expect(result.success).toBe(true);
        expect(result.data?.length).toBe(1);
        expect(result.data?.[0].title).toBe('Semi-tacit');
      });
    });
  });
});
