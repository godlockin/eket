/**
 * SQL 注入防护工具
 *
 * 提供安全的 SQL 查询构建和参数处理方法
 *
 * @module sql-security
 */

/**
 * 转义 SQL LIKE 语句中的通配符
 *
 * LIKE 特殊字符：
 * - % : 匹配零个或多个字符
 * - _ : 匹配单个字符
 * - \ : 转义字符本身
 *
 * @example
 * const pattern = escapeLikePattern userInput); // "50% off"
 * // 返回："50\% off"
 *
 * @param str - 需要转义的字符串
 * @returns 转义后的字符串
 */
export function escapeLikePattern(str: string): string {
  if (typeof str !== 'string') {
    throw new TypeError('Input must be a string');
  }
  // 转义 \ 必须在最前面，避免重复转义
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * 构建安全的 LIKE 查询参数
 *
 * @example
 * const { sql, params } = buildLikeQuery('users', 'name', searchTerm);
 * // SELECT * FROM users WHERE name LIKE ? ESCAPE '\'
 * // params: ['%escaped_term%']
 *
 * @param table - 表名（需要预先验证）
 * @param column - 列名（需要预先验证）
 * @param searchTerm - 搜索词
 * @param options - 选项
 * @returns 安全的 SQL 和参数
 */
export function buildLikeQuery(
  table: string,
  column: string,
  searchTerm: string,
  options: {
    prefix?: boolean; // 是否在前部添加 %
    suffix?: boolean; // 是否在后部添加 %
  } = {}
): { sql: string; params: string[] } {
  // 验证表名和列名（防止标识符注入）
  validateIdentifier(table);
  validateIdentifier(column);

  const { prefix = true, suffix = true } = options;
  const escaped = escapeLikePattern(searchTerm);
  const pattern = `${prefix ? '%' : ''}${escaped}${suffix ? '%' : ''}`;

  return {
    sql: `SELECT * FROM ${table} WHERE ${column} LIKE ? ESCAPE '\\'`,
    params: [pattern],
  };
}

/**
 * 验证 SQL 标识符（表名、列名）
 *
 * 只允许字母、数字、下划线，防止标识符注入
 *
 * @param identifier - 待验证的标识符
 * @throws 如果标识符非法
 */
export function validateIdentifier(identifier: string): void {
  if (typeof identifier !== 'string') {
    throw new TypeError('Identifier must be a string');
  }

  // 严格的标识符模式：只允许字母、数字、下划线，且不能为空
  const identifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  if (!identifierPattern.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }

  // 检查保留字（可选，根据实际数据库调整）
  const reservedWords = new Set([
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'CREATE',
    'ALTER',
    'TABLE',
    'INDEX',
    'VIEW',
    'TRIGGER',
    'FUNCTION',
    'PROCEDURE',
    'WHERE',
    'FROM',
    'JOIN',
    'ORDER',
    'GROUP',
    'HAVING',
    'LIMIT',
    'OFFSET',
    'UNION',
    'ALL',
    'AND',
    'OR',
    'NOT',
    'IN',
    'BETWEEN',
    'LIKE',
    'IS',
    'NULL',
    'TRUE',
    'FALSE',
    'AS',
    'ON',
    'BY',
    'ASC',
    'DESC',
    'NULLS',
    'FIRST',
    'LAST',
    'INNER',
    'LEFT',
    'RIGHT',
    'OUTER',
    'CROSS',
    'NATURAL',
    'USING',
  ]);

  if (reservedWords.has(identifier.toUpperCase())) {
    throw new Error(`Reserved word used as identifier: ${identifier}`);
  }
}

/**
 * 构建安全的 ORDER BY 子句
 *
 * ORDER BY 不能使用参数化查询，需要特殊处理
 *
 * @example
 * const orderBy = buildOrderBy('users', sortBy, sortOrder);
 * // orderBy: "ORDER BY name ASC"
 *
 * @param table - 表名
 * @param column - 排序列（必须是已知列）
 * @param direction - 排序方向
 * @returns 安全的 ORDER BY 子句
 */
export function buildOrderBy(
  table: string,
  column: string,
  direction: 'ASC' | 'DESC' = 'ASC'
): string {
  validateIdentifier(table);
  validateIdentifier(column);

  const safeDirection = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  return `ORDER BY ${column} ${safeDirection}`;
}

/**
 * 构建安全的 LIMIT/OFFSET 子句
 *
 * @param limit - 限制数量
 * @param offset - 偏移量
 * @returns 安全的 LIMIT/OFFSET 子句
 */
export function buildLimitOffset(limit: number, offset = 0): { sql: string; params: number[] } {
  // 验证数值范围
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
    throw new Error('LIMIT must be an integer between 1 and 10000');
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('OFFSET must be a non-negative integer');
  }

  return {
    sql: 'LIMIT ? OFFSET ?',
    params: [limit, offset],
  };
}

/**
 * SQLite 参数化查询助手
 *
 * @example
 * const { sql, params } = sqliteQuery(
 *   'SELECT * FROM users WHERE id = ? AND status = ?',
 *   [userId, status]
 * );
 *
 * @param sqlTemplate - SQL 模板（使用 ? 占位符）
 * @param params - 参数数组
 * @returns 格式化的查询对象
 */
export function sqliteQuery(
  sqlTemplate: string,
  params: unknown[]
): { sql: string; params: unknown[] } {
  // 验证占位符数量匹配
  const placeholderCount = (sqlTemplate.match(/\?/g) || []).length;

  if (placeholderCount !== params.length) {
    throw new Error(
      `Placeholder count (${placeholderCount}) does not match parameter count (${params.length})`
    );
  }

  return {
    sql: sqlTemplate,
    params: params.map((p) => {
      // 参数类型验证
      if (
        typeof p !== 'string' &&
        typeof p !== 'number' &&
        typeof p !== 'boolean' &&
        p !== null &&
        p !== undefined
      ) {
        throw new TypeError('Parameters must be string, number, boolean, or null');
      }
      return p;
    }),
  };
}

/**
 * 批量插入助手
 *
 * @example
 * const { sql, params } = buildBatchInsert(
 *   'users',
 *   ['name', 'email', 'age'],
 *   3 // 3 行数据
 * );
 * // INSERT INTO users (name, email, age) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)
 *
 * @param table - 表名
 * @param columns - 列名数组
 * @param rowCount - 行数
 * @returns SQL 和参数占位符
 */
export function buildBatchInsert(
  table: string,
  columns: string[],
  rowCount: number
): { sql: string; paramCount: number } {
  validateIdentifier(table);
  columns.forEach((col) => validateIdentifier(col));

  if (rowCount < 1) {
    throw new Error('Row count must be at least 1');
  }

  const columnList = columns.map((col) => `"${col}"`).join(', ');
  const rowPlaceholder = `(${columns.map(() => '?').join(', ')})`;
  const valuesPlaceholder = Array(rowCount).fill(rowPlaceholder).join(', ');

  return {
    sql: `INSERT INTO ${table} (${columnList}) VALUES ${valuesPlaceholder}`,
    paramCount: columns.length * rowCount,
  };
}

/**
 * 安全地构建 IN 子句
 *
 * @example
 * const { sql, params } = buildInClause('id', [1, 2, 3]);
 * // sql: "id IN (?, ?, ?)"
 * // params: [1, 2, 3]
 *
 * @param column - 列名
 * @param values - 值数组
 * @returns IN 子句和参数
 */
export function buildInClause(
  column: string,
  values: unknown[]
): { sql: string; params: unknown[] } {
  validateIdentifier(column);

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Values must be a non-empty array');
  }

  // 限制 IN 子句大小，防止性能问题
  if (values.length > 1000) {
    throw new Error('IN clause cannot have more than 1000 values');
  }

  return {
    sql: `${column} IN (${values.map(() => '?').join(', ')})`,
    params: values,
  };
}
