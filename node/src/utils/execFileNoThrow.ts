/**
 * Safe process execution utility
 * 使用 execFile 防止命令注入
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  status: number;
}

/**
 * 安全地执行 shell 命令
 * @param command 命令（不含参数）
 * @param args 参数数组
 */
export async function execFileNoThrow(
  command: string,
  args: string[] = []
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    return {
      stdout,
      stderr,
      status: 0,
    };
  } catch (error) {
    const err = error as { code?: string; status?: number; stdout?: string; stderr?: string };
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      status: err.status || 1,
    };
  }
}
