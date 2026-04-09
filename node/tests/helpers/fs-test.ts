/**
 * EKET Framework - File System Test Helpers
 *
 * Provides utilities for creating and cleaning up temporary directories
 * for tests that need real file system interaction.
 *
 * @module tests/helpers/fs-test
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Create a temporary directory with the given prefix
 * @param prefix - Directory name prefix
 * @returns The path to the created temporary directory
 */
export function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

/**
 * Clean up a temporary directory recursively
 * @param dir - Directory path to remove
 */
export function cleanupTempDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Setup a temporary directory for testing
 * @param prefix - Directory name prefix
 * @returns Object with dir path and cleanup function
 */
export function setupFsTest(prefix: string): { dir: string; cleanup: () => void } {
  const dir = createTempDir(prefix);
  return {
    dir,
    cleanup: () => cleanupTempDir(dir)
  };
}
