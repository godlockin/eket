/**
 * AST Graph Indexer Tests
 * TASK-Y03: AST 语法树级代码图谱检索索引
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ASTGraphIndexer,
  createASTGraphIndexer,
  type CodeEntity,
  type CodeEdge,
  type ImpactAssessment,
} from '../src/core/ast-graph-indexer.js';

describe('ASTGraphIndexer', () => {
  let indexer: ASTGraphIndexer;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-indexer-test-'));

    // Create indexer with in-memory database
    indexer = createASTGraphIndexer({
      dbPath: ':memory:',
      projectRoot: tempDir,
    });

    await indexer.connect();
  });

  afterEach(async () => {
    await indexer.disconnect();

    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ============================================================================
  // AC-1: AST 文件关系解析
  // ============================================================================

  describe('AC-1: AST file relationship parsing', () => {
    it('should parse class definitions', async () => {
      const testFile = path.join(tempDir, 'test-class.ts');
      fs.writeFileSync(
        testFile,
        `
/**
 * User class for authentication
 */
export class User {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  greet(): string {
    return \`Hello, \${this.name}\`;
  }
}

export abstract class BaseEntity {
  id: string;
}

class InternalClass extends BaseEntity {
  value: number;
}
`
      );

      const result = await indexer.indexFile('test-class.ts');

      expect(result.success).toBe(true);
      expect(result.data?.entities).toBeGreaterThanOrEqual(3);

      const entitiesResult = await indexer.getEntitiesByFile('test-class.ts');
      expect(entitiesResult.success).toBe(true);

      const classes = entitiesResult.data?.filter(e => e.type === 'class') || [];
      expect(classes.length).toBe(3);

      const userClass = classes.find(c => c.name === 'User');
      expect(userClass).toBeDefined();
      expect(userClass?.docComment).toContain('User class for authentication');
    });

    it('should parse function definitions', async () => {
      const testFile = path.join(tempDir, 'test-functions.ts');
      fs.writeFileSync(
        testFile,
        `
export function processData(data: string[]): number {
  return data.length;
}

export async function fetchData(): Promise<string> {
  return 'data';
}

export const calculateSum = (a: number, b: number): number => a + b;

export const asyncFetch = async (url: string): Promise<Response> => {
  return fetch(url);
};

function internalHelper() {
  return 42;
}
`
      );

      const result = await indexer.indexFile('test-functions.ts');

      expect(result.success).toBe(true);

      const entitiesResult = await indexer.getEntitiesByFile('test-functions.ts');
      expect(entitiesResult.success).toBe(true);

      const functions = entitiesResult.data?.filter(e => e.type === 'function') || [];
      expect(functions.length).toBeGreaterThanOrEqual(4);

      const functionNames = functions.map(f => f.name);
      expect(functionNames).toContain('processData');
      expect(functionNames).toContain('fetchData');
      expect(functionNames).toContain('calculateSum');
    });

    it('should parse interface definitions', async () => {
      const testFile = path.join(tempDir, 'test-interfaces.ts');
      fs.writeFileSync(
        testFile,
        `
export interface UserProfile {
  id: string;
  name: string;
  email: string;
}

export interface ExtendedProfile extends UserProfile {
  avatar: string;
}

interface InternalConfig {
  debug: boolean;
}
`
      );

      const result = await indexer.indexFile('test-interfaces.ts');

      expect(result.success).toBe(true);

      const entitiesResult = await indexer.getEntitiesByFile('test-interfaces.ts');
      expect(entitiesResult.success).toBe(true);

      const interfaces = entitiesResult.data?.filter(e => e.type === 'interface') || [];
      expect(interfaces.length).toBe(3);

      const interfaceNames = interfaces.map(i => i.name);
      expect(interfaceNames).toContain('UserProfile');
      expect(interfaceNames).toContain('ExtendedProfile');
    });

    it('should parse type aliases', async () => {
      const testFile = path.join(tempDir, 'test-types.ts');
      fs.writeFileSync(
        testFile,
        `
export type UserId = string;

export type Status = 'active' | 'inactive' | 'pending';

export type UserMap<T> = Map<string, T>;

type InternalType = number | string;
`
      );

      const result = await indexer.indexFile('test-types.ts');

      expect(result.success).toBe(true);

      const entitiesResult = await indexer.getEntitiesByFile('test-types.ts');
      expect(entitiesResult.success).toBe(true);

      const types = entitiesResult.data?.filter(e => e.type === 'type') || [];
      expect(types.length).toBeGreaterThanOrEqual(3);
    });

    it('should parse enum definitions', async () => {
      const testFile = path.join(tempDir, 'test-enums.ts');
      fs.writeFileSync(
        testFile,
        `
export enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}

export const enum Direction {
  Up,
  Down,
  Left,
  Right,
}

enum InternalState {
  Init,
  Ready,
  Done,
}
`
      );

      const result = await indexer.indexFile('test-enums.ts');

      expect(result.success).toBe(true);

      const entitiesResult = await indexer.getEntitiesByFile('test-enums.ts');
      expect(entitiesResult.success).toBe(true);

      const enums = entitiesResult.data?.filter(e => e.type === 'enum') || [];
      expect(enums.length).toBe(3);
    });

    it('should parse import relationships', async () => {
      const testFile = path.join(tempDir, 'test-imports.ts');
      fs.writeFileSync(
        testFile,
        `
import { User, Profile } from './user.js';
import * as Utils from './utils.js';
import DefaultExport from './default.js';
import Config, { Setting } from './config.js';

export class Service {
  private user: User;
}
`
      );

      const result = await indexer.indexFile('test-imports.ts');

      expect(result.success).toBe(true);

      const edgesResult = await indexer.getEdges('test-imports.ts:file:test-imports.ts', 'from');
      expect(edgesResult.success).toBe(true);

      const imports = edgesResult.data?.filter(e => e.relation === 'imports') || [];
      expect(imports.length).toBeGreaterThanOrEqual(4);
    });

    it('should parse extends and implements relationships', async () => {
      const testFile = path.join(tempDir, 'test-inheritance.ts');
      fs.writeFileSync(
        testFile,
        `
interface Serializable {
  serialize(): string;
}

interface Validatable {
  validate(): boolean;
}

abstract class BaseModel {
  id: string;
}

class UserModel extends BaseModel implements Serializable, Validatable {
  name: string;

  serialize(): string {
    return JSON.stringify(this);
  }

  validate(): boolean {
    return true;
  }
}
`
      );

      const result = await indexer.indexFile('test-inheritance.ts');

      expect(result.success).toBe(true);

      const entitiesResult = await indexer.getEntitiesByFile('test-inheritance.ts');
      const userModel = entitiesResult.data?.find(e => e.name === 'UserModel');
      expect(userModel).toBeDefined();

      if (userModel) {
        const edgesResult = await indexer.getEdges(userModel.id, 'from');
        expect(edgesResult.success).toBe(true);

        const extendsEdges = edgesResult.data?.filter(e => e.relation === 'extends') || [];
        const implementsEdges = edgesResult.data?.filter(e => e.relation === 'implements') || [];

        expect(extendsEdges.length).toBe(1);
        expect(implementsEdges.length).toBe(2);
      }
    });
  });

  // ============================================================================
  // AC-2: SQLite 拓扑图存储
  // ============================================================================

  describe('AC-2: SQLite topology storage', () => {
    it('should store and retrieve entities correctly', async () => {
      const testFile = path.join(tempDir, 'storage-test.ts');
      fs.writeFileSync(
        testFile,
        `
export class StorageTest {
  value: number;
}

export function helperFunc(): void {}
`
      );

      await indexer.indexFile('storage-test.ts');

      const entitiesResult = await indexer.getEntitiesByFile('storage-test.ts');
      expect(entitiesResult.success).toBe(true);

      const entities = entitiesResult.data || [];
      expect(entities.length).toBe(2);

      const classEntity = entities.find(e => e.type === 'class');
      expect(classEntity).toBeDefined();
      expect(classEntity?.name).toBe('StorageTest');
      expect(classEntity?.filePath).toBe('storage-test.ts');
      expect(classEntity?.startLine).toBeGreaterThan(0);
    });

    it('should store edges with correct relationships', async () => {
      const moduleFile = path.join(tempDir, 'module.ts');
      fs.writeFileSync(
        moduleFile,
        `
export function utilityFunc(): void {}
`
      );

      const mainFile = path.join(tempDir, 'main.ts');
      fs.writeFileSync(
        mainFile,
        `
import { utilityFunc } from './module.js';

export function mainFunc(): void {
  utilityFunc();
}
`
      );

      await indexer.indexFile('module.ts');
      await indexer.indexFile('main.ts');

      const statsResult = await indexer.getStats();
      expect(statsResult.success).toBe(true);
      expect(statsResult.data?.totalEdges).toBeGreaterThan(0);
    });

    it('should get statistics correctly', async () => {
      const testFile = path.join(tempDir, 'stats-test.ts');
      fs.writeFileSync(
        testFile,
        `
export class TestClass {}
export interface TestInterface {}
export type TestType = string;
export function testFunc(): void {}
`
      );

      await indexer.indexFile('stats-test.ts');

      const statsResult = await indexer.getStats();
      expect(statsResult.success).toBe(true);

      const stats = statsResult.data!;
      expect(stats.totalEntities).toBeGreaterThanOrEqual(4);
      expect(stats.totalFiles).toBe(1);
      expect(stats.byType['class']).toBeGreaterThanOrEqual(1);
      expect(stats.byType['interface']).toBeGreaterThanOrEqual(1);
      expect(stats.byType['function']).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // AC-3: 跨文件影响评估 RAG 检索
  // ============================================================================

  describe('AC-3: Cross-file impact assessment RAG retrieval', () => {
    beforeEach(async () => {
      // Create a small dependency graph
      const baseFile = path.join(tempDir, 'base.ts');
      fs.writeFileSync(
        baseFile,
        `
export function baseFunction(): string {
  return 'base';
}

export class BaseClass {
  getValue(): number {
    return 42;
  }
}
`
      );

      const middleFile = path.join(tempDir, 'middle.ts');
      fs.writeFileSync(
        middleFile,
        `
import { baseFunction, BaseClass } from './base.js';

export function middleFunction(): string {
  return baseFunction() + '-middle';
}

export class MiddleClass extends BaseClass {
  getDoubleValue(): number {
    return this.getValue() * 2;
  }
}
`
      );

      const topFile = path.join(tempDir, 'top.ts');
      fs.writeFileSync(
        topFile,
        `
import { middleFunction } from './middle.js';

export function topFunction(): string {
  return middleFunction() + '-top';
}
`
      );

      await indexer.indexFile('base.ts');
      await indexer.indexFile('middle.ts');
      await indexer.indexFile('top.ts');
    });

    it('should find direct dependents', async () => {
      const baseEntities = await indexer.getEntitiesByFile('base.ts');
      const baseClass = baseEntities.data?.find(e => e.name === 'BaseClass');
      expect(baseClass).toBeDefined();

      if (baseClass) {
        const impactResult = await indexer.queryImpact(baseClass.id);
        expect(impactResult.success).toBe(true);

        const impact = impactResult.data!;
        expect(impact.entity.name).toBe('BaseClass');
        // MiddleClass extends BaseClass
        expect(impact.directDependents.some(d => d.name === 'MiddleClass')).toBe(true);
      }
    });

    it('should calculate risk level based on dependents', async () => {
      const baseEntities = await indexer.getEntitiesByFile('base.ts');
      const baseFunc = baseEntities.data?.find(e => e.name === 'baseFunction');

      if (baseFunc) {
        const impactResult = await indexer.queryImpact(baseFunc.id);
        expect(impactResult.success).toBe(true);

        const impact = impactResult.data!;
        expect(['low', 'medium', 'high']).toContain(impact.riskLevel);
      }
    });

    it('should search entities using FTS5', async () => {
      const searchResult = await indexer.search('BaseClass');
      expect(searchResult.success).toBe(true);

      const results = searchResult.data || [];
      expect(results.some(e => e.name === 'BaseClass')).toBe(true);
    });

    it('should search by function name', async () => {
      const searchResult = await indexer.search('Function');
      expect(searchResult.success).toBe(true);

      const results = searchResult.data || [];
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // AC-4: 增量 SHA256 索引更新
  // ============================================================================

  describe('AC-4: Incremental SHA256 index update', () => {
    it('should skip unchanged files', async () => {
      const testFile = path.join(tempDir, 'unchanged.ts');
      fs.writeFileSync(testFile, 'export const value = 42;');

      // First index
      const result1 = await indexer.indexFile('unchanged.ts');
      expect(result1.success).toBe(true);
      expect(result1.data?.entities).toBe(1);

      // Second index (should skip)
      const result2 = await indexer.indexFile('unchanged.ts');
      expect(result2.success).toBe(true);
      expect(result2.data?.entities).toBe(0); // Skipped
      expect(result2.data?.edges).toBe(0);
    });

    it('should reindex changed files', async () => {
      const testFile = path.join(tempDir, 'changed.ts');
      fs.writeFileSync(testFile, 'export const value = 42;');

      // First index
      await indexer.indexFile('changed.ts');

      // Modify file
      fs.writeFileSync(testFile, 'export const value = 42;\nexport const another = 100;');

      // Second index (should reindex)
      const result = await indexer.indexFile('changed.ts');
      expect(result.success).toBe(true);
      expect(result.data?.entities).toBe(2);
    });

    it('should rebuild incrementally', async () => {
      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');

      fs.writeFileSync(file1, 'export class A {}');
      fs.writeFileSync(file2, 'export class B {}');

      // First rebuild
      const result1 = await indexer.rebuildIncremental(['file1.ts', 'file2.ts']);
      expect(result1.success).toBe(true);
      expect(result1.data?.indexed).toBe(2);
      expect(result1.data?.skipped).toBe(0);

      // Second rebuild (should skip both)
      const result2 = await indexer.rebuildIncremental(['file1.ts', 'file2.ts']);
      expect(result2.success).toBe(true);
      expect(result2.data?.indexed).toBe(0);
      expect(result2.data?.skipped).toBe(2);

      // Modify one file
      fs.writeFileSync(file1, 'export class A {}\nexport class A2 {}');

      // Third rebuild (should reindex only file1)
      const result3 = await indexer.rebuildIncremental(['file1.ts', 'file2.ts']);
      expect(result3.success).toBe(true);
      expect(result3.data?.indexed).toBe(1);
      expect(result3.data?.skipped).toBe(1);
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('Edge cases and error handling', () => {
    it('should handle empty files', async () => {
      const emptyFile = path.join(tempDir, 'empty.ts');
      fs.writeFileSync(emptyFile, '');

      const result = await indexer.indexFile('empty.ts');
      expect(result.success).toBe(true);
      expect(result.data?.entities).toBe(0);
    });

    it('should handle non-existent files', async () => {
      const result = await indexer.indexFile('non-existent.ts');
      expect(result.success).toBe(false);
    });

    it('should handle files with syntax that looks like code but is in strings', async () => {
      const testFile = path.join(tempDir, 'strings.ts');
      fs.writeFileSync(
        testFile,
        `
export const code = \`
  class FakeClass {}
  function fakeFunction() {}
\`;

export class RealClass {}
`
      );

      const result = await indexer.indexFile('strings.ts');
      expect(result.success).toBe(true);

      const entitiesResult = await indexer.getEntitiesByFile('strings.ts');
      const classes = entitiesResult.data?.filter(e => e.type === 'class') || [];

      // Should find RealClass, might also find FakeClass (regex limitation)
      expect(classes.some(c => c.name === 'RealClass')).toBe(true);
    });

    it('should get entity by ID', async () => {
      const testFile = path.join(tempDir, 'get-entity.ts');
      fs.writeFileSync(testFile, 'export class TestEntity {}');

      await indexer.indexFile('get-entity.ts');

      const entitiesResult = await indexer.getEntitiesByFile('get-entity.ts');
      const entity = entitiesResult.data?.[0];

      if (entity) {
        const getResult = await indexer.getEntity(entity.id);
        expect(getResult.success).toBe(true);
        expect(getResult.data?.name).toBe('TestEntity');
      }
    });

    it('should return null for non-existent entity', async () => {
      const result = await indexer.getEntity('non-existent-id');
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  // ============================================================================
  // Factory Function
  // ============================================================================

  describe('createASTGraphIndexer factory', () => {
    it('should create indexer with default config', () => {
      const defaultIndexer = createASTGraphIndexer();
      expect(defaultIndexer).toBeInstanceOf(ASTGraphIndexer);
    });

    it('should create indexer with custom config', () => {
      const customIndexer = createASTGraphIndexer({
        dbPath: ':memory:',
        projectRoot: '/custom/path',
        includePatterns: ['**/*.ts'],
        excludePatterns: ['**/test/**'],
        maxDepth: 5,
      });
      expect(customIndexer).toBeInstanceOf(ASTGraphIndexer);
    });
  });
});
