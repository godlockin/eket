/**
 * EKET Framework - Message Bus (TASK-042)
 * sendMessage() + readMessage() with Zod bidirectional validation.
 */

import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';

import { EketErrorClass, EketErrorCode, type Result } from '../types/index.js';
import { BaseMessage, type TypedMessage } from '../types/messages.js';

/**
 * Validate and write a message to the shared inbox.
 */
export async function sendMessage(
  repoRoot: string,
  msg: TypedMessage,
): Promise<Result<void>> {
  const parsed = BaseMessage.safeParse(msg);
  if (!parsed.success) {
    return {
      success: false,
      error: new EketErrorClass(
        EketErrorCode.INVALID_MESSAGE,
        parsed.error.message,
      ),
    };
  }

  const filename = `${msg.type}-${msg.ticketId}-${Date.now()}.json`;
  const filePath = join(
    repoRoot,
    'shared',
    'message_queue',
    'inbox',
    filename,
  );

  await writeFile(filePath, JSON.stringify(parsed.data, null, 2), 'utf-8');
  return { success: true, data: undefined };
}

/**
 * Read and validate a message from a file path.
 */
export async function readMessage(
  filePath: string,
): Promise<Result<TypedMessage>> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (e: unknown) {
    const err = e as { message?: string };
    return {
      success: false,
      error: new EketErrorClass(
        EketErrorCode.FILE_READ_ERROR,
        err.message ?? 'read error',
      ),
    };
  }

  let parsed: ReturnType<typeof BaseMessage.safeParse>;
  try {
    parsed = BaseMessage.safeParse(JSON.parse(raw));
  } catch {
    return {
      success: false,
      error: new EketErrorClass(
        EketErrorCode.INVALID_MESSAGE,
        'Failed to parse message JSON',
      ),
    };
  }

  if (!parsed.success) {
    return {
      success: false,
      error: new EketErrorClass(
        EketErrorCode.INVALID_MESSAGE,
        parsed.error.message,
      ),
    };
  }

  return { success: true, data: parsed.data };
}
