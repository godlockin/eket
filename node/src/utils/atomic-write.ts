/**
 * EKET Framework - Atomic File Write Utility
 *
 * Provides atomic file write operations to prevent corruption on crash.
 * Uses tmp file + rename strategy (atomic on POSIX systems).
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Atomically write content to file
 *
 * Strategy:
 * 1. Write to <filepath>.tmp.<timestamp>
 * 2. Rename to <filepath> (atomic operation on POSIX)
 *
 * If process crashes during step 1, tmp file remains but target is intact.
 * If process crashes during step 2, either old or new content exists (not corrupted).
 *
 * @param filepath - Target file path
 * @param content - Content to write (UTF-8)
 * @throws {Error} On write failure (ENOSPC, EACCES)
 *
 * @example
 * await atomicWrite('progress.md', '# Task Progress\n...');
 */
export async function atomicWrite(filepath: string, content: string): Promise<void> {
  const tmpPath = `${filepath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(filepath), { recursive: true });

    // Write to tmp file
    await fs.writeFile(tmpPath, content, 'utf-8');

    // Atomic rename
    await fs.rename(tmpPath, filepath);
  } catch (error) {
    // Clean up tmp file on failure
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore cleanup errors
    }

    throw error;
  }
}

/**
 * Atomically write JSON data to file
 *
 * @param filepath - Target file path
 * @param data - JSON-serializable data
 * @param pretty - Pretty-print JSON (default: true)
 *
 * @example
 * await atomicWriteJSON('state.json', { phase: 'testing' });
 */
export async function atomicWriteJSON(
  filepath: string,
  data: unknown,
  pretty = true
): Promise<void> {
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await atomicWrite(filepath, content);
}
