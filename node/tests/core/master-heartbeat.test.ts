/**
 * Master Heartbeat Manager Tests
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { MasterHeartbeatManager, createMasterHeartbeat } from '../../src/core/master-heartbeat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('MasterHeartbeatManager', () => {
  const testHeartbeatPath = path.resolve(__dirname, '../../../.eket/state/test-master-heartbeat');
  let manager: MasterHeartbeatManager;

  beforeEach(() => {
    // 清理测试文件
    if (fs.existsSync(testHeartbeatPath)) {
      fs.unlinkSync(testHeartbeatPath);
    }
  });

  afterEach(() => {
    // 停止心跳
    if (manager) {
      manager.stop();
    }
    // 清理测试文件
    if (fs.existsSync(testHeartbeatPath)) {
      fs.unlinkSync(testHeartbeatPath);
    }
  });

  it('should start heartbeat and create file', async () => {
    manager = new MasterHeartbeatManager({
      heartbeatPath: testHeartbeatPath,
      heartbeatInterval: 100,
    });

    manager.start();

    // 等待文件创建
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fs.existsSync(testHeartbeatPath)).toBe(true);

    const content = fs.readFileSync(testHeartbeatPath, 'utf8');
    const timestamp = parseInt(content.trim(), 10);
    expect(isNaN(timestamp)).toBe(false);
    expect(timestamp).toBeGreaterThan(0);
  });

  it('should update heartbeat periodically', async () => {
    manager = new MasterHeartbeatManager({
      heartbeatPath: testHeartbeatPath,
      heartbeatInterval: 100,
    });

    manager.start();

    // 读取初始心跳
    await new Promise(resolve => setTimeout(resolve, 50));
    const firstTimestamp = parseInt(fs.readFileSync(testHeartbeatPath, 'utf8').trim(), 10);

    // 等待下一次心跳
    await new Promise(resolve => setTimeout(resolve, 150));
    const secondTimestamp = parseInt(fs.readFileSync(testHeartbeatPath, 'utf8').trim(), 10);

    expect(secondTimestamp).toBeGreaterThan(firstTimestamp);
  });

  it('should stop heartbeat and cleanup file', async () => {
    manager = new MasterHeartbeatManager({
      heartbeatPath: testHeartbeatPath,
      heartbeatInterval: 100,
    });

    manager.start();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fs.existsSync(testHeartbeatPath)).toBe(true);

    manager.stop();

    expect(fs.existsSync(testHeartbeatPath)).toBe(false);
  });

  it('should read last heartbeat timestamp', async () => {
    manager = new MasterHeartbeatManager({
      heartbeatPath: testHeartbeatPath,
      heartbeatInterval: 100,
    });

    manager.start();
    await new Promise(resolve => setTimeout(resolve, 50));

    const timestamp = MasterHeartbeatManager.readLastHeartbeat(testHeartbeatPath);
    expect(timestamp).not.toBeNull();
    expect(timestamp!).toBeGreaterThan(0);
  });

  it('should return null when heartbeat file does not exist', () => {
    const timestamp = MasterHeartbeatManager.readLastHeartbeat(testHeartbeatPath);
    expect(timestamp).toBeNull();
  });

  it('should detect alive master', async () => {
    manager = new MasterHeartbeatManager({
      heartbeatPath: testHeartbeatPath,
      heartbeatInterval: 100,
    });

    manager.start();
    await new Promise(resolve => setTimeout(resolve, 50));

    const isAlive = MasterHeartbeatManager.isAlive(testHeartbeatPath, 1000);
    expect(isAlive).toBe(true);
  });

  it('should detect dead master after timeout', async () => {
    // 写入旧心跳
    const dir = path.dirname(testHeartbeatPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const oldTimestamp = Date.now() - 100000; // 100 秒前
    fs.writeFileSync(testHeartbeatPath, oldTimestamp.toString(), 'utf8');

    const isAlive = MasterHeartbeatManager.isAlive(testHeartbeatPath, 90000);
    expect(isAlive).toBe(false);
  });

  it('should create heartbeat manager with factory function', () => {
    manager = createMasterHeartbeat({
      heartbeatPath: testHeartbeatPath,
      heartbeatInterval: 100,
    });

    expect(manager).toBeInstanceOf(MasterHeartbeatManager);
  });

  it('should use default config values', () => {
    manager = new MasterHeartbeatManager();
    expect(manager).toBeTruthy();
  });
});
