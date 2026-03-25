/**
 * Safe process execution utility
 * 使用 execFile 防止命令注入
 */

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  status: number;
}

export interface ExecOptions {
  timeout?: number; // 超时时间（毫秒），默认 30000
  maxBuffer?: number; // 缓冲区大小，默认 10MB
  cwd?: string; // 工作目录
}

/**
 * 安全地执行 shell 命令
 * @param command 命令（不含参数）
 * @param args 参数数组
 * @param options 可选配置
 */
export async function execFileNoThrow(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const {
    timeout = 30000, // 30 秒超时
    maxBuffer = 10 * 1024 * 1024, // 10MB buffer
    cwd,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      maxBuffer,
      signal: controller.signal,
      cwd,
    });
    clearTimeout(timeoutId);
    return {
      stdout,
      stderr,
      status: 0,
    };
  } catch (err) {
    clearTimeout(timeoutId);

    // 超时错误
    if (isAbortError(err)) {
      return {
        stdout: '',
        stderr: `Command timeout after ${timeout}ms`,
        status: -1,
      };
    }

    return {
      stdout: getStdout(err),
      stderr: getStderr(err),
      status: getStatus(err),
    };
  }
}

/**
 * Type guard for AbortError
 */
function isAbortError(err: unknown): boolean {
  return err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: unknown }).code === 'ABORT_ERR';
}

/**
 * Safely extract stdout from error
 */
function getStdout(err: unknown): string {
  if (err !== null && typeof err === 'object' && 'stdout' in err) {
    const maybeStdout = (err as { stdout: unknown }).stdout;
    return typeof maybeStdout === 'string' ? maybeStdout : '';
  }
  return '';
}

/**
 * Safely extract stderr from error
 */
function getStderr(err: unknown): string {
  if (err !== null && typeof err === 'object' && 'stderr' in err) {
    const maybeStderr = (err as { stderr: unknown }).stderr;
    return typeof maybeStderr === 'string' ? maybeStderr : '';
  }
  if (err instanceof Error) {
    return err.message;
  }
  return '';
}

/**
 * Safely extract status from error
 */
function getStatus(err: unknown): number {
  if (err !== null && typeof err === 'object' && 'status' in err) {
    const maybeStatus = (err as { status: unknown }).status;
    return typeof maybeStatus === 'number' ? maybeStatus : 1;
  }
  return 1;
}

/**
 * 执行长运行命令（支持实时输出）
 * @param command 命令
 * @param args 参数数组
 * @param onOutput 输出回调
 */
export async function execFileWithOutput(
  command: string,
  args: string[],
  onOutput?: (line: string, isStderr: boolean) => void
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args);
    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n');
      stdout.push(...lines);
      lines.forEach((line: string) => onOutput?.(line, false));
    });

    child.stderr?.on('data', (data) => {
      const lines = data.toString().split('\n');
      stderr.push(...lines);
      lines.forEach((line: string) => onOutput?.(line, true));
    });

    child.on('error', (err) => {
      resolve({
        stdout: stdout.join('\n'),
        stderr: err.message,
        status: -1,
      });
    });

    child.on('close', (code) => {
      resolve({
        stdout: stdout.join('\n'),
        stderr: stderr.join('\n'),
        status: code || 0,
      });
    });

    // 清理孤儿进程
    child.on('exit', () => {
      child.removeAllListeners();
    });
  });
}
