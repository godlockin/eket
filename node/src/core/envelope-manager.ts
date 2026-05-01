/**
 * Envelope Manager — 管理 Task Envelope 的读写
 * TASK-118: Skill Stacking + Task Envelope
 */

import * as fs from 'fs';
import * as path from 'path';

import type { TaskEnvelope } from '../types/index.js';

export class EnvelopeManager {
  private envelopesDir: string;

  constructor(dataRoot: string) {
    this.envelopesDir = path.join(dataRoot, 'envelopes');
  }

  async writeEnvelope(envelope: TaskEnvelope): Promise<void> {
    if (!fs.existsSync(this.envelopesDir)) {
      fs.mkdirSync(this.envelopesDir, { recursive: true });
    }
    const filePath = path.join(this.envelopesDir, `${envelope.ticketId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2), 'utf-8');
  }

  async readEnvelope(ticketId: string): Promise<TaskEnvelope | null> {
    const filePath = path.join(this.envelopesDir, `${ticketId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TaskEnvelope;
  }
}
