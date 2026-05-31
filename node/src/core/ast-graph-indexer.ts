/**
 * EKET Framework - AST Graph Indexer
 * TASK-Y03: AST 语法树级代码图谱检索索引
 *
 * 功能：
 * - AC-1: AST 文件关系解析 - 识别 class/function 定义及 import/调用关系
 * - AC-2: SQLite 拓扑图存储 - code_entities 和 code_edges 表
 * - AC-3: 跨文件影响评估 RAG 检索 - FTS5 + 图联表查询
 * - AC-4: 增量 SHA256 索引更新 - 仅解析变更文件
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Result } from '../types/index.js';
import { EketError } from '../types/index.js';
import { createSQLiteManager, type SQLiteManager } from './sqlite-manager.js';

// ============================================================================
// Types
// ============================================================================

/**
 * 代码实体类型
 */
export type CodeEntityType = 'class' | 'function' | 'interface' | 'type' | 'const' | 'variable' | 'enum';

/**
 * 代码关系类型
 */
export type CodeRelationType = 'imports' | 'calls' | 'extends' | 'implements' | 'uses' | 'exports';

/**
 * 代码实体接口
 */
export interface CodeEntity {
  id: string;
  name: string;
  type: CodeEntityType;
  filePath: string;
  startLine: number;
  endLine?: number;
  signature?: string;
  docComment?: string;
}

/**
 * 代码关系边接口
 */
export interface CodeEdge {
  id?: number;
  fromEntity: string;
  toEntity: string;
  relation: CodeRelationType;
  filePath?: string;
  line?: number;
}

/**
 * 文件索引状态
 */
export interface FileIndexState {
  filePath: string;
  sha256: string;
  indexedAt: number;
  entityCount: number;
  edgeCount: number;
}

/**
 * 影响评估结果
 */
export interface ImpactAssessment {
  entity: CodeEntity;
  directDependents: CodeEntity[];
  transitiveDependents: CodeEntity[];
  impactedFiles: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * 索引器配置
 */
export interface ASTGraphIndexerConfig {
  dbPath?: string;
  projectRoot?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  maxDepth?: number;
}

// ============================================================================
// AST Parser (Regex-based lightweight implementation)
// ============================================================================

/**
 * 轻量级 AST 解析器（使用正则表达式）
 * 不引入重型依赖，适用于 TypeScript/JavaScript 文件
 */
class LightweightASTParser {
  /**
   * 解析文件中的代码实体
   */
  parseEntities(content: string, filePath: string): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const lines = content.split('\n');

    // 解析 class 定义
    entities.push(...this.parseClasses(content, filePath, lines));

    // 解析 function 定义
    entities.push(...this.parseFunctions(content, filePath, lines));

    // 解析 interface 定义
    entities.push(...this.parseInterfaces(content, filePath, lines));

    // 解析 type 定义
    entities.push(...this.parseTypes(content, filePath, lines));

    // 解析 const/let 导出
    entities.push(...this.parseExportedConsts(content, filePath, lines));

    // 解析 enum 定义
    entities.push(...this.parseEnums(content, filePath, lines));

    return entities;
  }

  /**
   * 解析文件中的关系边
   */
  parseEdges(content: string, filePath: string, entities: CodeEntity[]): CodeEdge[] {
    const edges: CodeEdge[] = [];
    const lines = content.split('\n');

    // 解析 import 关系
    edges.push(...this.parseImports(content, filePath, lines));

    // 解析 extends/implements 关系
    edges.push(...this.parseInheritance(content, filePath, entities));

    // 解析函数调用关系
    edges.push(...this.parseFunctionCalls(content, filePath, entities, lines));

    return edges;
  }

  private parseClasses(content: string, filePath: string, lines: string[]): CodeEntity[] {
    const entities: CodeEntity[] = [];
    // Match: export class Foo, class Foo extends Bar, abstract class Foo
    const classRegex = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?/g;

    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const startLine = this.getLineNumber(content, match.index);
      const endLine = this.findBlockEnd(lines, startLine - 1);
      const docComment = this.extractDocComment(lines, startLine - 1);

      entities.push({
        id: this.generateEntityId(filePath, 'class', match[1]),
        name: match[1],
        type: 'class',
        filePath,
        startLine,
        endLine,
        signature: match[0].trim(),
        docComment,
      });
    }

    return entities;
  }

  private parseFunctions(content: string, filePath: string, lines: string[]): CodeEntity[] {
    const entities: CodeEntity[] = [];

    // Match: export function foo(), async function foo(), function foo()
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g;

    // Match: export const foo = () =>, export const foo = async () =>
    const arrowFuncRegex = /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/g;

    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      const startLine = this.getLineNumber(content, match.index);
      const endLine = this.findBlockEnd(lines, startLine - 1);
      const docComment = this.extractDocComment(lines, startLine - 1);

      entities.push({
        id: this.generateEntityId(filePath, 'function', match[1]),
        name: match[1],
        type: 'function',
        filePath,
        startLine,
        endLine,
        signature: match[0].trim(),
        docComment,
      });
    }

    while ((match = arrowFuncRegex.exec(content)) !== null) {
      const startLine = this.getLineNumber(content, match.index);
      const endLine = this.findBlockEnd(lines, startLine - 1);
      const docComment = this.extractDocComment(lines, startLine - 1);

      entities.push({
        id: this.generateEntityId(filePath, 'function', match[1]),
        name: match[1],
        type: 'function',
        filePath,
        startLine,
        endLine,
        signature: match[0].trim(),
        docComment,
      });
    }

    return entities;
  }

  private parseInterfaces(content: string, filePath: string, lines: string[]): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const interfaceRegex = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+[\w,\s]+)?/g;

    let match;
    while ((match = interfaceRegex.exec(content)) !== null) {
      const startLine = this.getLineNumber(content, match.index);
      const endLine = this.findBlockEnd(lines, startLine - 1);
      const docComment = this.extractDocComment(lines, startLine - 1);

      entities.push({
        id: this.generateEntityId(filePath, 'interface', match[1]),
        name: match[1],
        type: 'interface',
        filePath,
        startLine,
        endLine,
        signature: match[0].trim(),
        docComment,
      });
    }

    return entities;
  }

  private parseTypes(content: string, filePath: string, lines: string[]): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const typeRegex = /(?:export\s+)?type\s+(\w+)(?:\s*<[^>]+>)?\s*=/g;

    let match;
    while ((match = typeRegex.exec(content)) !== null) {
      const startLine = this.getLineNumber(content, match.index);
      const docComment = this.extractDocComment(lines, startLine - 1);

      entities.push({
        id: this.generateEntityId(filePath, 'type', match[1]),
        name: match[1],
        type: 'type',
        filePath,
        startLine,
        signature: match[0].trim(),
        docComment,
      });
    }

    return entities;
  }

  private parseExportedConsts(content: string, filePath: string, lines: string[]): CodeEntity[] {
    const entities: CodeEntity[] = [];
    // Match exported const that are not arrow functions (those are handled in parseFunctions)
    const constRegex = /export\s+const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?!(?:async\s+)?\()/g;

    let match;
    while ((match = constRegex.exec(content)) !== null) {
      const startLine = this.getLineNumber(content, match.index);
      const docComment = this.extractDocComment(lines, startLine - 1);

      entities.push({
        id: this.generateEntityId(filePath, 'const', match[1]),
        name: match[1],
        type: 'const',
        filePath,
        startLine,
        signature: match[0].trim(),
        docComment,
      });
    }

    return entities;
  }

  private parseEnums(content: string, filePath: string, lines: string[]): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const enumRegex = /(?:export\s+)?(?:const\s+)?enum\s+(\w+)/g;

    let match;
    while ((match = enumRegex.exec(content)) !== null) {
      const startLine = this.getLineNumber(content, match.index);
      const endLine = this.findBlockEnd(lines, startLine - 1);
      const docComment = this.extractDocComment(lines, startLine - 1);

      entities.push({
        id: this.generateEntityId(filePath, 'enum', match[1]),
        name: match[1],
        type: 'enum',
        filePath,
        startLine,
        endLine,
        signature: match[0].trim(),
        docComment,
      });
    }

    return entities;
  }

  private parseImports(content: string, filePath: string, _lines: string[]): CodeEdge[] {
    const edges: CodeEdge[] = [];

    // Match: import { A, B } from './module'
    // Match: import A from './module'
    // Match: import * as A from './module'
    const importRegex = /import\s+(?:(?:\{([^}]+)\})|(?:\*\s+as\s+(\w+))|(\w+))(?:\s*,\s*(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+)))?\s+from\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      const modulePath = match[7];

      // Extract imported names
      const importedNames: string[] = [];

      // Named imports { A, B }
      if (match[1]) {
        const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
        importedNames.push(...names);
      }
      // Namespace import * as A
      if (match[2]) {
        importedNames.push(match[2]);
      }
      // Default import A
      if (match[3]) {
        importedNames.push(match[3]);
      }
      // Additional named imports after default
      if (match[4]) {
        const names = match[4].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
        importedNames.push(...names);
      }

      for (const name of importedNames) {
        if (name) {
          edges.push({
            fromEntity: this.generateEntityId(filePath, 'file', path.basename(filePath)),
            toEntity: this.generateEntityId(modulePath, 'export', name),
            relation: 'imports',
            filePath,
            line,
          });
        }
      }
    }

    return edges;
  }

  private parseInheritance(content: string, filePath: string, entities: CodeEntity[]): CodeEdge[] {
    const edges: CodeEdge[] = [];

    // Match extends relationships
    const extendsRegex = /(?:class|interface)\s+(\w+)\s+extends\s+([\w,\s]+)/g;
    let match;
    while ((match = extendsRegex.exec(content)) !== null) {
      const childName = match[1];
      const parentNames = match[2].split(',').map(n => n.trim());
      const childEntity = entities.find(e => e.name === childName);

      if (childEntity) {
        for (const parentName of parentNames) {
          edges.push({
            fromEntity: childEntity.id,
            toEntity: this.generateEntityId('', 'unknown', parentName),
            relation: 'extends',
            filePath,
            line: childEntity.startLine,
          });
        }
      }
    }

    // Match implements relationships
    const implementsRegex = /class\s+(\w+)(?:\s+extends\s+\w+)?\s+implements\s+([\w,\s]+)/g;
    while ((match = implementsRegex.exec(content)) !== null) {
      const className = match[1];
      const interfaceNames = match[2].split(',').map(n => n.trim());
      const classEntity = entities.find(e => e.name === className && e.type === 'class');

      if (classEntity) {
        for (const interfaceName of interfaceNames) {
          edges.push({
            fromEntity: classEntity.id,
            toEntity: this.generateEntityId('', 'interface', interfaceName),
            relation: 'implements',
            filePath,
            line: classEntity.startLine,
          });
        }
      }
    }

    return edges;
  }

  private parseFunctionCalls(
    _content: string,
    filePath: string,
    entities: CodeEntity[],
    _lines: string[]
  ): CodeEdge[] {
    const edges: CodeEdge[] = [];
    const functionEntities = entities.filter(e => e.type === 'function');

    // Build a set of known function names for quick lookup
    const knownFunctions = new Set(functionEntities.map(e => e.name));

    // For each function, look for calls to other known functions
    for (const func of functionEntities) {
      if (func.endLine === undefined) continue;

      const funcBody = _lines.slice(func.startLine - 1, func.endLine).join('\n');

      // Match function calls: functionName(
      const callRegex = /\b(\w+)\s*\(/g;
      let match;
      while ((match = callRegex.exec(funcBody)) !== null) {
        const calledName = match[1];
        // Skip if it's the function itself or not a known function
        if (calledName !== func.name && knownFunctions.has(calledName)) {
          const calledEntity = functionEntities.find(e => e.name === calledName);
          if (calledEntity) {
            // Avoid duplicate edges
            const exists = edges.some(
              e => e.fromEntity === func.id && e.toEntity === calledEntity.id && e.relation === 'calls'
            );
            if (!exists) {
              edges.push({
                fromEntity: func.id,
                toEntity: calledEntity.id,
                relation: 'calls',
                filePath,
              });
            }
          }
        }
      }
    }

    return edges;
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  private findBlockEnd(lines: string[], startLineIndex: number): number {
    let braceCount = 0;
    let started = false;

    for (let i = startLineIndex; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          started = true;
        } else if (char === '}') {
          braceCount--;
          if (started && braceCount === 0) {
            return i + 1; // 1-indexed line number
          }
        }
      }
    }

    return startLineIndex + 1;
  }

  private extractDocComment(lines: string[], lineIndex: number): string | undefined {
    // Look for JSDoc comment above the declaration
    let commentEnd = lineIndex - 1;
    while (commentEnd >= 0 && lines[commentEnd].trim() === '') {
      commentEnd--;
    }

    if (commentEnd < 0) return undefined;

    const lastLine = lines[commentEnd].trim();
    if (!lastLine.endsWith('*/')) return undefined;

    // Find the start of the comment
    let commentStart = commentEnd;
    while (commentStart >= 0 && !lines[commentStart].trim().startsWith('/**')) {
      commentStart--;
    }

    if (commentStart < 0) return undefined;

    return lines.slice(commentStart, commentEnd + 1).join('\n');
  }

  private generateEntityId(filePath: string, type: string, name: string): string {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return `${normalizedPath}:${type}:${name}`;
  }
}

// ============================================================================
// AST Graph Indexer
// ============================================================================

/**
 * AST 图谱索引器
 * 将 codebase 升级为 AST 级函数/类调用拓扑网络
 */
export class ASTGraphIndexer {
  private sqlite: SQLiteManager;
  private parser: LightweightASTParser;
  private config: Required<ASTGraphIndexerConfig>;

  constructor(config: ASTGraphIndexerConfig = {}) {
    this.config = {
      dbPath: config.dbPath || '',
      projectRoot: config.projectRoot || process.cwd(),
      includePatterns: config.includePatterns || ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      excludePatterns: config.excludePatterns || ['**/node_modules/**', '**/dist/**', '**/*.test.*', '**/*.spec.*'],
      maxDepth: config.maxDepth || 10,
    };

    this.sqlite = createSQLiteManager({ dbPath: this.config.dbPath, useWorker: false });
    this.parser = new LightweightASTParser();
  }

  /**
   * 连接数据库并初始化表结构
   */
  async connect(): Promise<Result<void>> {
    const result = await this.sqlite.connect();
    if (!result.success) {
      return result;
    }

    await this.initializeTables();
    console.log('[ASTGraphIndexer] Connected and initialized');
    return { success: true, data: undefined };
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    await this.sqlite.close();
    console.log('[ASTGraphIndexer] Disconnected');
  }

  /**
   * 初始化数据库表
   */
  private async initializeTables(): Promise<void> {
    const db = this.sqlite.getDB();
    if (!db) {
      throw new Error('Database not connected');
    }

    // AC-2: code_entities 表
    db.exec(`
      CREATE TABLE IF NOT EXISTS code_entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER,
        signature TEXT,
        doc_comment TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_name ON code_entities(name)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_type ON code_entities(type)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_file ON code_entities(file_path)`);

    // AC-2: code_edges 表
    db.exec(`
      CREATE TABLE IF NOT EXISTS code_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_entity TEXT NOT NULL,
        to_entity TEXT NOT NULL,
        relation TEXT NOT NULL,
        file_path TEXT,
        line INTEGER,
        created_at INTEGER NOT NULL,
        UNIQUE(from_entity, to_entity, relation)
      )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_edges_from ON code_edges(from_entity)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_edges_to ON code_edges(to_entity)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_edges_relation ON code_edges(relation)`);

    // AC-4: file_index_state 表 (增量更新)
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_index_state (
        file_path TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL,
        indexed_at INTEGER NOT NULL,
        entity_count INTEGER NOT NULL,
        edge_count INTEGER NOT NULL
      )
    `);

    // AC-3: FTS5 全文索引
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS code_entities_fts USING fts5(
        id,
        name,
        type,
        file_path,
        signature,
        doc_comment,
        content='code_entities',
        content_rowid='rowid'
      )
    `);

    // FTS5 触发器
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS code_entities_ai AFTER INSERT ON code_entities BEGIN
        INSERT INTO code_entities_fts(rowid, id, name, type, file_path, signature, doc_comment)
        VALUES (new.rowid, new.id, new.name, new.type, new.file_path, new.signature, new.doc_comment);
      END
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS code_entities_ad AFTER DELETE ON code_entities BEGIN
        INSERT INTO code_entities_fts(code_entities_fts, rowid, id, name, type, file_path, signature, doc_comment)
        VALUES ('delete', old.rowid, old.id, old.name, old.type, old.file_path, old.signature, old.doc_comment);
      END
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS code_entities_au AFTER UPDATE ON code_entities BEGIN
        INSERT INTO code_entities_fts(code_entities_fts, rowid, id, name, type, file_path, signature, doc_comment)
        VALUES ('delete', old.rowid, old.id, old.name, old.type, old.file_path, old.signature, old.doc_comment);
        INSERT INTO code_entities_fts(rowid, id, name, type, file_path, signature, doc_comment)
        VALUES (new.rowid, new.id, new.name, new.type, new.file_path, new.signature, new.doc_comment);
      END
    `);

    console.log('[ASTGraphIndexer] Tables initialized');
  }

  /**
   * AC-1 & AC-4: 索引单个文件
   */
  async indexFile(filePath: string): Promise<Result<{ entities: number; edges: number }>> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError('DB_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      const absolutePath = path.resolve(this.config.projectRoot, filePath);

      if (!fs.existsSync(absolutePath)) {
        return {
          success: false,
          error: new EketError('FILE_NOT_FOUND', `File not found: ${absolutePath}`),
        };
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      const sha256 = this.computeSHA256(content);

      // Check if file needs reindexing
      const existingState = db.prepare(
        'SELECT sha256 FROM file_index_state WHERE file_path = ?'
      ).get(filePath) as { sha256: string } | undefined;

      if (existingState?.sha256 === sha256) {
        console.log(`[ASTGraphIndexer] File unchanged, skipping: ${filePath}`);
        return { success: true, data: { entities: 0, edges: 0 } };
      }

      // Clear existing entries for this file
      db.prepare('DELETE FROM code_entities WHERE file_path = ?').run(filePath);
      db.prepare('DELETE FROM code_edges WHERE file_path = ?').run(filePath);

      // Parse entities and edges
      const entities = this.parser.parseEntities(content, filePath);
      const edges = this.parser.parseEdges(content, filePath, entities);

      const now = Date.now();

      // Insert entities
      const insertEntity = db.prepare(`
        INSERT OR REPLACE INTO code_entities
        (id, name, type, file_path, start_line, end_line, signature, doc_comment, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const entity of entities) {
        insertEntity.run(
          entity.id,
          entity.name,
          entity.type,
          entity.filePath,
          entity.startLine,
          entity.endLine ?? null,
          entity.signature ?? null,
          entity.docComment ?? null,
          now,
          now
        );
      }

      // Insert edges
      const insertEdge = db.prepare(`
        INSERT OR IGNORE INTO code_edges
        (from_entity, to_entity, relation, file_path, line, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const edge of edges) {
        insertEdge.run(
          edge.fromEntity,
          edge.toEntity,
          edge.relation,
          edge.filePath ?? null,
          edge.line ?? null,
          now
        );
      }

      // Update file index state
      db.prepare(`
        INSERT OR REPLACE INTO file_index_state
        (file_path, sha256, indexed_at, entity_count, edge_count)
        VALUES (?, ?, ?, ?, ?)
      `).run(filePath, sha256, now, entities.length, edges.length);

      console.log(`[ASTGraphIndexer] Indexed: ${filePath} (${entities.length} entities, ${edges.length} edges)`);

      return { success: true, data: { entities: entities.length, edges: edges.length } };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('INDEX_FAILED', `Failed to index file: ${errorMessage}`),
      };
    }
  }

  /**
   * AC-4: 增量重建索引
   */
  async rebuildIncremental(files?: string[]): Promise<Result<{ indexed: number; skipped: number; errors: number }>> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError('DB_NOT_CONNECTED', 'Database not connected'),
      };
    }

    const filesToIndex = files || this.discoverFiles();
    let indexed = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of filesToIndex) {
      const result = await this.indexFile(file);
      if (result.success) {
        if (result.data.entities > 0 || result.data.edges > 0) {
          indexed++;
        } else {
          skipped++;
        }
      } else {
        const errMsg = 'error' in result ? result.error?.message : 'Unknown error';
        console.error(`[ASTGraphIndexer] Error indexing ${file}:`, errMsg);
        errors++;
      }
    }

    console.log(`[ASTGraphIndexer] Rebuild complete: ${indexed} indexed, ${skipped} skipped, ${errors} errors`);
    return { success: true, data: { indexed, skipped, errors } };
  }

  /**
   * AC-3: 查询实体影响范围
   */
  async queryImpact(entityId: string, maxDepth?: number): Promise<Result<ImpactAssessment>> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError('DB_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      // Get the entity
      const entityRow = db.prepare('SELECT * FROM code_entities WHERE id = ?').get(entityId) as Record<string, unknown> | undefined;

      if (!entityRow) {
        return {
          success: false,
          error: new EketError('ENTITY_NOT_FOUND', `Entity not found: ${entityId}`),
        };
      }

      const entity = this.rowToEntity(entityRow);
      const depth = maxDepth ?? this.config.maxDepth;

      // Find direct dependents (entities that reference this entity)
      const directDependentRows = db.prepare(`
        SELECT DISTINCT e.* FROM code_entities e
        JOIN code_edges ed ON e.id = ed.from_entity
        WHERE ed.to_entity = ?
      `).all(entityId) as Array<Record<string, unknown>>;

      const directDependents = directDependentRows.map(row => this.rowToEntity(row));

      // Find transitive dependents using recursive CTE
      const transitiveDependentRows = db.prepare(`
        WITH RECURSIVE dependent_chain AS (
          -- Base case: direct dependents
          SELECT from_entity, 1 as depth
          FROM code_edges
          WHERE to_entity = ?

          UNION ALL

          -- Recursive case
          SELECT e.from_entity, dc.depth + 1
          FROM code_edges e
          JOIN dependent_chain dc ON e.to_entity = dc.from_entity
          WHERE dc.depth < ?
        )
        SELECT DISTINCT ce.* FROM code_entities ce
        JOIN dependent_chain dc ON ce.id = dc.from_entity
        WHERE ce.id NOT IN (SELECT id FROM code_entities WHERE id = ?)
      `).all(entityId, depth, entityId) as Array<Record<string, unknown>>;

      const transitiveDependents = transitiveDependentRows.map(row => this.rowToEntity(row));

      // Get all impacted files
      const impactedFiles = new Set<string>();
      impactedFiles.add(entity.filePath);
      for (const dep of [...directDependents, ...transitiveDependents]) {
        impactedFiles.add(dep.filePath);
      }

      // Calculate risk level
      const totalDependents = directDependents.length + transitiveDependents.length;
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      if (totalDependents > 10 || impactedFiles.size > 5) {
        riskLevel = 'high';
      } else if (totalDependents > 3 || impactedFiles.size > 2) {
        riskLevel = 'medium';
      }

      return {
        success: true,
        data: {
          entity,
          directDependents,
          transitiveDependents,
          impactedFiles: Array.from(impactedFiles),
          riskLevel,
        },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('QUERY_FAILED', `Impact query failed: ${errorMessage}`),
      };
    }
  }

  /**
   * AC-3: FTS5 全文搜索
   */
  async search(query: string, limit = 20): Promise<Result<CodeEntity[]>> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError('DB_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      const rows = db.prepare(`
        SELECT ce.* FROM code_entities ce
        JOIN code_entities_fts fts ON ce.id = fts.id
        WHERE code_entities_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(query, limit) as Array<Record<string, unknown>>;

      const entities = rows.map(row => this.rowToEntity(row));
      return { success: true, data: entities };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('SEARCH_FAILED', `Search failed: ${errorMessage}`),
      };
    }
  }

  /**
   * 获取实体
   */
  async getEntity(entityId: string): Promise<Result<CodeEntity | null>> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError('DB_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      const row = db.prepare('SELECT * FROM code_entities WHERE id = ?').get(entityId) as Record<string, unknown> | undefined;

      if (!row) {
        return { success: true, data: null };
      }

      return { success: true, data: this.rowToEntity(row) };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('FETCH_FAILED', `Fetch failed: ${errorMessage}`),
      };
    }
  }

  /**
   * 获取实体关系边
   */
  async getEdges(entityId: string, direction: 'from' | 'to' | 'both' = 'both'): Promise<Result<CodeEdge[]>> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError('DB_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      let query: string;
      if (direction === 'from') {
        query = 'SELECT * FROM code_edges WHERE from_entity = ?';
      } else if (direction === 'to') {
        query = 'SELECT * FROM code_edges WHERE to_entity = ?';
      } else {
        query = 'SELECT * FROM code_edges WHERE from_entity = ? OR to_entity = ?';
      }

      const rows = direction === 'both'
        ? db.prepare(query).all(entityId, entityId) as Array<Record<string, unknown>>
        : db.prepare(query).all(entityId) as Array<Record<string, unknown>>;

      const edges: CodeEdge[] = rows.map(row => ({
        id: row.id as number,
        fromEntity: row.from_entity as string,
        toEntity: row.to_entity as string,
        relation: row.relation as CodeRelationType,
        filePath: row.file_path as string | undefined,
        line: row.line as number | undefined,
      }));

      return { success: true, data: edges };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('FETCH_FAILED', `Fetch edges failed: ${errorMessage}`),
      };
    }
  }

  /**
   * 获取文件中的所有实体
   */
  async getEntitiesByFile(filePath: string): Promise<Result<CodeEntity[]>> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError('DB_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      const rows = db.prepare(
        'SELECT * FROM code_entities WHERE file_path = ? ORDER BY start_line'
      ).all(filePath) as Array<Record<string, unknown>>;

      const entities = rows.map(row => this.rowToEntity(row));
      return { success: true, data: entities };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('FETCH_FAILED', `Fetch failed: ${errorMessage}`),
      };
    }
  }

  /**
   * 获取索引统计
   */
  async getStats(): Promise<Result<{
    totalEntities: number;
    totalEdges: number;
    totalFiles: number;
    byType: Record<string, number>;
    byRelation: Record<string, number>;
  }>> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError('DB_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      const totalEntities = (db.prepare('SELECT COUNT(*) as count FROM code_entities').get() as { count: number }).count;
      const totalEdges = (db.prepare('SELECT COUNT(*) as count FROM code_edges').get() as { count: number }).count;
      const totalFiles = (db.prepare('SELECT COUNT(*) as count FROM file_index_state').get() as { count: number }).count;

      const typeRows = db.prepare('SELECT type, COUNT(*) as count FROM code_entities GROUP BY type').all() as Array<{ type: string; count: number }>;
      const byType: Record<string, number> = {};
      for (const row of typeRows) {
        byType[row.type] = row.count;
      }

      const relationRows = db.prepare('SELECT relation, COUNT(*) as count FROM code_edges GROUP BY relation').all() as Array<{ relation: string; count: number }>;
      const byRelation: Record<string, number> = {};
      for (const row of relationRows) {
        byRelation[row.relation] = row.count;
      }

      return {
        success: true,
        data: { totalEntities, totalEdges, totalFiles, byType, byRelation },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('STATS_FAILED', `Stats query failed: ${errorMessage}`),
      };
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private computeSHA256(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private discoverFiles(): string[] {
    const files: string[] = [];
    const { projectRoot, includePatterns, excludePatterns } = this.config;

    // Simple recursive file discovery
    const walk = (dir: string, relativePath: string = '') => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relPath = path.join(relativePath, entry.name);

          // Check exclusion patterns
          const shouldExclude = excludePatterns.some(pattern => {
            const regex = this.globToRegex(pattern);
            return regex.test(relPath) || regex.test(fullPath);
          });

          if (shouldExclude) continue;

          if (entry.isDirectory()) {
            walk(fullPath, relPath);
          } else if (entry.isFile()) {
            // Check inclusion patterns
            const shouldInclude = includePatterns.some(pattern => {
              const regex = this.globToRegex(pattern);
              return regex.test(relPath) || regex.test(entry.name);
            });

            if (shouldInclude) {
              files.push(relPath);
            }
          }
        }
      } catch {
        // Ignore permission errors etc.
      }
    };

    walk(projectRoot);
    return files;
  }

  private globToRegex(glob: string): RegExp {
    const escaped = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '<<GLOBSTAR>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<GLOBSTAR>>/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }

  private rowToEntity(row: Record<string, unknown>): CodeEntity {
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as CodeEntityType,
      filePath: row.file_path as string,
      startLine: row.start_line as number,
      endLine: row.end_line as number | undefined,
      signature: row.signature as string | undefined,
      docComment: row.doc_comment as string | undefined,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * 创建 AST 图谱索引器实例
 */
export function createASTGraphIndexer(config?: ASTGraphIndexerConfig): ASTGraphIndexer {
  return new ASTGraphIndexer(config);
}
