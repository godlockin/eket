/**
 * EKET Framework - SQLite Types
 */

import type { Result } from './common.js';

// ============================================================================
// SQLite Types
// ============================================================================

/**
 * SQLite 客户端统一接口
 */
export interface ISQLiteClient {
  connect(): Promise<Result<void>>;
  close(): Promise<void>;
  isReady(): boolean;
  execute(sql: string, params?: unknown[]): Promise<Result<void>>;
  get(sql: string, params?: unknown[]): Promise<Result<unknown>>;
  all(sql: string, params?: unknown[]): Promise<Result<unknown[]>>;
  insertRetrospective(retro: {
    sprintId: string;
    fileName: string;
    title: string;
    date: string;
  }): Promise<Result<number>>;
  getRetrospective(sprintId: string): Promise<Result<unknown>>;
  listRetrospectives(): Promise<Result<unknown[]>>;
  insertRetroContent(content: {
    retroId: number;
    category: string;
    content: string;
    createdBy?: string;
  }): Promise<Result<number>>;
  getRetroContentByCategory(retroId: number, category: string): Promise<Result<unknown[]>>;
  searchRetrospectives(keyword: string): Promise<Result<unknown[]>>;
  generateReport(): Promise<Result<{
    totalRetrospectives: number;
    totalSprints: number;
    totalItems: number;
    byCategory: Array<{ category: string; count: number }>;
  }>>;
  saveCheckpoint(checkpoint: {
    ticketId: string;
    slaverId: string;
    phase: 'analysis' | 'implement' | 'test' | 'pr';
    stateJson: string;
  }): Promise<Result<void>>;
  loadCheckpoint(ticketId: string, slaverId: string): Promise<Result<unknown>>;
  deleteCheckpoint(ticketId: string, slaverId: string): Promise<Result<void>>;
  claimTask(ticketId: string, slaverId: string): Promise<Result<boolean>>;
}

export interface ExecutionCheckpoint {
  id?: number;
  ticketId: string;
  slaverId: string;
  phase: 'analysis' | 'implement' | 'test' | 'pr';
  stateJson: string;
  createdAt?: string;
}
