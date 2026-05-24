# TASK-Y03: AST 语法树级代码图谱检索索引

**ID**: TASK-Y03  
**Epic**: EPIC-009  
**优先级**: P0  
**预估**: 8h  
**依赖**: TASK-Y02  
**Agent Type**: backend  
**Category**: 🔍 Code Search / AST / RAG

---

## Goal

将 codebase-map 从简单的“静态文件分类目录”升级为“AST 级函数/类调用拓扑网络”。引入代码解析器分析代码逻辑，将函数调用链路和类继承关系映射并同步写入 SQLite 图数据库中，使 Agent 具备亚秒级的“代码改动影响范围精准评估”能力。

---

## Acceptance Criteria

**AC-1**: AST 文件关系解析  
- Given: 全量扫描项目代码文件 (`.ts` / `.rs`)
- When: 触发索引构建 (例如调用 `eket knowledge:index --ast`)
- Then: 能够利用轻量解析器（如正则、TSESTree 或简易 AST scanner）识别出所有的 `class`、`function` 定义以及它们之间的 `import` 与直接调用关系

**AC-2**: SQLite 拓扑图模型存储  
- Given: 解析出的函数与文件拓扑流
- When: 写入 SQLite
- Then: 结构化存储进 `code_entities`（代码实体：包含文件、类、方法及物理行号）和 `code_edges`（依赖关系：包含 depends_on, calls, extends 关系）表

**AC-3**: 跨文件影响评估 RAG 检索  
- Given: 拓扑表索引构建成功
- When: Agent 执行 RAG 查询，如：`eket knowledge:search "A 函数改动后会波及哪里"`
- Then: 结合 FTS5 与图联表查询，高精度返回受影响的文件名、函数名与调用链深度

**AC-4**: 增量 SHA256 索引更新  
- Given: 仅修改了单个文件
- When: 重建 AST 代码图谱
- Then: 仅解析哈希变更的文件并更新拓扑差量，全量构建在 10s 内完成

---

## Implementation Sketch

在 `node/src/core/knowledge-base.ts` 扩展或新建 `ast-graph-indexer.ts`：

```typescript
export interface CodeEntity {
  id: string; // "file#class#method"
  name: string;
  type: 'file' | 'class' | 'method';
  filePath: string;
  startLine: number;
}

export interface CodeEdge {
  fromEntity: string;
  toEntity: string;
  relation: 'calls' | 'imports' | 'extends';
}

export class ASTGraphIndexer {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_entities (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        file_path TEXT,
        start_line INTEGER
      );
      CREATE TABLE IF NOT EXISTS code_edges (
        from_entity TEXT,
        to_entity TEXT,
        relation TEXT,
        PRIMARY KEY (from_entity, to_entity, relation),
        FOREIGN KEY (from_entity) REFERENCES code_entities(id) ON DELETE CASCADE
      );
    `);
  }

  async indexFile(filePath: string, content: string): Promise<void> {
    // 1. 通过 AST 解析类和方法的定义 (以简易 TypeScript AST 解析或正则解析为基础)
    const entities: CodeEntity[] = this.parseEntities(filePath, content);
    const edges: CodeEdge[] = this.parseEdges(filePath, content, entities);

    // 2. 事务性写入 SQLite
    const insertEntity = this.db.prepare(`
      INSERT OR REPLACE INTO code_entities (id, name, type, file_path, start_line)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertEdge = this.db.prepare(`
      INSERT OR REPLACE INTO code_edges (from_entity, to_entity, relation)
      VALUES (?, ?, ?)
    `);

    this.db.transaction(() => {
      for (const e of entities) {
        insertEntity.run(e.id, e.name, e.type, e.filePath, e.startLine);
      }
      for (const edge of edges) {
        insertEdge.run(edge.fromEntity, edge.toEntity, edge.relation);
      }
    })();
  }
}
```

---

## Test Strategy

**Integration**: 在 `test-fixtures/` 下放置两个有相互引用关系的 TS 文件（A 文件导入 B 文件中的 C 函数并调用）。运行 `ASTGraphIndexer` 进行索引构建，然后查询 `code_edges` 确认存在由 A 指向 B#C 的 `calls` 关系。

---

**Blocked By**: TASK-Y02  
**Blocks**: TASK-Y04  
**Created**: 2026-05-24
---
status: ready
assignee: ""
branch: ""
ac_completed: 0/4
test_coverage: 0%
