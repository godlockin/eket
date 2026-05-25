/**
 * Unit tests for sql-security.ts
 */

import {
  escapeLikePattern,
  buildLikeQuery,
  validateIdentifier,
  buildOrderBy,
  buildLimitOffset,
  sqliteQuery,
  buildBatchInsert,
  buildInClause,
} from '../../../src/utils/sql-security.js';

describe('sql-security', () => {
  describe('escapeLikePattern', () => {
    it('should escape percent sign', () => {
      expect(escapeLikePattern('50% off')).toBe('50\\% off');
    });

    it('should escape underscore', () => {
      expect(escapeLikePattern('user_name')).toBe('user\\_name');
    });

    it('should escape backslash', () => {
      expect(escapeLikePattern('path\\to')).toBe('path\\\\to');
    });

    it('should escape all special characters together', () => {
      expect(escapeLikePattern('50%_test\\path')).toBe('50\\%\\_test\\\\path');
    });

    it('should handle empty string', () => {
      expect(escapeLikePattern('')).toBe('');
    });

    it('should handle string without special chars', () => {
      expect(escapeLikePattern('hello')).toBe('hello');
    });

    it('should throw for non-string input', () => {
      expect(() => escapeLikePattern(123 as unknown as string)).toThrow(TypeError);
    });
  });

  describe('validateIdentifier', () => {
    it('should accept valid identifier', () => {
      expect(() => validateIdentifier('users')).not.toThrow();
      expect(() => validateIdentifier('user_table')).not.toThrow();
      expect(() => validateIdentifier('_private')).not.toThrow();
      expect(() => validateIdentifier('Table1')).not.toThrow();
    });

    it('should reject identifier starting with number', () => {
      expect(() => validateIdentifier('123table')).toThrow('Invalid SQL identifier');
    });

    it('should reject identifier with special characters', () => {
      expect(() => validateIdentifier('user-table')).toThrow('Invalid SQL identifier');
      expect(() => validateIdentifier('user.table')).toThrow('Invalid SQL identifier');
      expect(() => validateIdentifier('user table')).toThrow('Invalid SQL identifier');
    });

    it('should reject empty string', () => {
      expect(() => validateIdentifier('')).toThrow('Invalid SQL identifier');
    });

    it('should reject SQL reserved words', () => {
      expect(() => validateIdentifier('SELECT')).toThrow('Reserved word');
      expect(() => validateIdentifier('select')).toThrow('Reserved word');
      expect(() => validateIdentifier('DROP')).toThrow('Reserved word');
      expect(() => validateIdentifier('DELETE')).toThrow('Reserved word');
    });

    it('should throw for non-string input', () => {
      expect(() => validateIdentifier(123 as unknown as string)).toThrow(TypeError);
    });
  });

  describe('buildLikeQuery', () => {
    it('should build default LIKE query with wildcards', () => {
      const { sql, params } = buildLikeQuery('users', 'name', 'john');

      expect(sql).toBe("SELECT * FROM users WHERE name LIKE ? ESCAPE '\\'");
      expect(params).toEqual(['%john%']);
    });

    it('should build prefix-only LIKE query', () => {
      const { sql, params } = buildLikeQuery('users', 'email', 'gmail', {
        prefix: false,
        suffix: true,
      });

      expect(params).toEqual(['gmail%']);
    });

    it('should build suffix-only LIKE query', () => {
      const { sql, params } = buildLikeQuery('users', 'email', 'gmail', {
        prefix: true,
        suffix: false,
      });

      expect(params).toEqual(['%gmail']);
    });

    it('should build exact LIKE query', () => {
      const { sql, params } = buildLikeQuery('users', 'code', 'ABC', {
        prefix: false,
        suffix: false,
      });

      expect(params).toEqual(['ABC']);
    });

    it('should escape special characters in search term', () => {
      const { params } = buildLikeQuery('users', 'bio', '50% off_sale');

      expect(params).toEqual(['%50\\% off\\_sale%']);
    });

    it('should throw for invalid table name', () => {
      expect(() => buildLikeQuery('DROP TABLE', 'name', 'test')).toThrow();
    });

    it('should throw for invalid column name', () => {
      expect(() => buildLikeQuery('users', '1column', 'test')).toThrow();
    });
  });

  describe('buildOrderBy', () => {
    it('should build ASC order by default', () => {
      const orderBy = buildOrderBy('users', 'created_at');
      expect(orderBy).toBe('ORDER BY created_at ASC');
    });

    it('should build DESC order', () => {
      const orderBy = buildOrderBy('users', 'created_at', 'DESC');
      expect(orderBy).toBe('ORDER BY created_at DESC');
    });

    it('should normalize direction to uppercase', () => {
      const orderBy = buildOrderBy('users', 'name', 'desc' as 'DESC');
      expect(orderBy).toBe('ORDER BY name DESC');
    });

    it('should throw for invalid column', () => {
      expect(() => buildOrderBy('users', 'DROP TABLE')).toThrow();
    });
  });

  describe('buildLimitOffset', () => {
    it('should build LIMIT/OFFSET clause', () => {
      const { sql, params } = buildLimitOffset(10, 20);

      expect(sql).toBe('LIMIT ? OFFSET ?');
      expect(params).toEqual([10, 20]);
    });

    it('should default offset to 0', () => {
      const { params } = buildLimitOffset(10);

      expect(params).toEqual([10, 0]);
    });

    it('should throw for limit < 1', () => {
      expect(() => buildLimitOffset(0)).toThrow('LIMIT must be an integer between 1 and 10000');
    });

    it('should throw for limit > 10000', () => {
      expect(() => buildLimitOffset(10001)).toThrow('LIMIT must be an integer between 1 and 10000');
    });

    it('should throw for negative offset', () => {
      expect(() => buildLimitOffset(10, -1)).toThrow('OFFSET must be a non-negative integer');
    });

    it('should throw for non-integer limit', () => {
      expect(() => buildLimitOffset(10.5)).toThrow('LIMIT must be an integer');
    });
  });

  describe('sqliteQuery', () => {
    it('should return sql and params', () => {
      const { sql, params } = sqliteQuery('SELECT * FROM users WHERE id = ?', [1]);

      expect(sql).toBe('SELECT * FROM users WHERE id = ?');
      expect(params).toEqual([1]);
    });

    it('should handle multiple parameters', () => {
      const { sql, params } = sqliteQuery(
        'SELECT * FROM users WHERE id = ? AND status = ?',
        [1, 'active']
      );

      expect(params).toEqual([1, 'active']);
    });

    it('should throw for mismatched placeholder count', () => {
      expect(() =>
        sqliteQuery('SELECT * FROM users WHERE id = ?', [1, 2])
      ).toThrow('Placeholder count (1) does not match parameter count (2)');
    });

    it('should throw for mismatched placeholder count (too few params)', () => {
      expect(() =>
        sqliteQuery('SELECT * FROM users WHERE id = ? AND status = ?', [1])
      ).toThrow('Placeholder count (2) does not match parameter count (1)');
    });

    it('should accept boolean parameters', () => {
      const { params } = sqliteQuery('SELECT * FROM users WHERE active = ?', [true]);
      expect(params).toEqual([true]);
    });

    it('should accept null parameters', () => {
      const { params } = sqliteQuery('SELECT * FROM users WHERE deleted_at = ?', [null]);
      expect(params).toEqual([null]);
    });

    it('should throw for object parameters', () => {
      expect(() =>
        sqliteQuery('SELECT * FROM users WHERE data = ?', [{ key: 'value' }])
      ).toThrow(TypeError);
    });
  });

  describe('buildBatchInsert', () => {
    it('should build batch insert SQL', () => {
      const { sql, paramCount } = buildBatchInsert('users', ['name', 'email'], 2);

      expect(sql).toBe('INSERT INTO users ("name", "email") VALUES (?, ?), (?, ?)');
      expect(paramCount).toBe(4);
    });

    it('should handle single row', () => {
      const { sql, paramCount } = buildBatchInsert('logs', ['message'], 1);

      expect(sql).toBe('INSERT INTO logs ("message") VALUES (?)');
      expect(paramCount).toBe(1);
    });

    it('should handle multiple columns', () => {
      const { sql, paramCount } = buildBatchInsert('data', ['a', 'b', 'c'], 3);

      expect(paramCount).toBe(9); // 3 columns * 3 rows
    });

    it('should throw for invalid table name', () => {
      expect(() => buildBatchInsert('DROP', ['col'], 1)).toThrow('Reserved word');
    });

    it('should throw for invalid column name', () => {
      expect(() => buildBatchInsert('users', ['user-name'], 1)).toThrow('Invalid SQL identifier');
    });

    it('should throw for row count < 1', () => {
      expect(() => buildBatchInsert('users', ['name'], 0)).toThrow('Row count must be at least 1');
    });
  });

  describe('buildInClause', () => {
    it('should build IN clause', () => {
      const { sql, params } = buildInClause('id', [1, 2, 3]);

      expect(sql).toBe('id IN (?, ?, ?)');
      expect(params).toEqual([1, 2, 3]);
    });

    it('should handle single value', () => {
      const { sql, params } = buildInClause('status', ['active']);

      expect(sql).toBe('status IN (?)');
      expect(params).toEqual(['active']);
    });

    it('should handle mixed types', () => {
      const { sql, params } = buildInClause('code', ['A', 1, 'B']);

      expect(params).toEqual(['A', 1, 'B']);
    });

    it('should throw for empty array', () => {
      expect(() => buildInClause('id', [])).toThrow('Values must be a non-empty array');
    });

    it('should throw for non-array', () => {
      expect(() => buildInClause('id', 'not array' as unknown as unknown[])).toThrow(
        'Values must be a non-empty array'
      );
    });

    it('should throw for invalid column', () => {
      expect(() => buildInClause('DROP TABLE', [1])).toThrow();
    });

    it('should throw for more than 1000 values', () => {
      const bigArray = Array(1001).fill(1);
      expect(() => buildInClause('id', bigArray)).toThrow(
        'IN clause cannot have more than 1000 values'
      );
    });
  });
});
