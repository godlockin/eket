/**
 * Master Heartbeat Manager Tests
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
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

    assert.ok(fs.existsSync(testHeartbeatPath), 'Heartbeat file should exist');

    const content = fs.readFileSync(testHeartbeatPath, 'utf8');
    const timestamp = parseInt(content.trim(), 10);
    assert.ok(!isNaN(timestamp), 'Timestamp should be valid number');
    assert.ok(timestamp > 0, 'Timestamp should be positive');
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

    assert.ok(secondTimestamp > firstTimestamp, 'Second timestamp should be later');
  });

  it('should stop heartbeat and cleanup file', async () => {
    manager = new MasterHeartbeatManager({
      heartbeatPath: testHeartbeatPath,
      heartbeatInterval: 100,
    });

    manager.start();
    await new Promise(resolve => setTimeout(resolve, 50));

    assert.ok(fs.existsSync(testHeartbeatPath), 'File should exist after start');

    manager.stop();

    assert.ok(!fs.existsSync(testHeartbeatPath), 'File should be deleted after stop');
  });

  it('should read last heartbeat timestamp', async () => {
    manager = new MasterHeartbeatManager({
      heartbeatPath: testHeartbeatPath,
      heartbeatInterval: 100,
    });

    manager.start();
    await new Promise(resolve => setTimeout(resolve, 50));

    const timestamp = MasterHeartbeatManager.readLastHeartbeat(testHeartbeatPath);
    assert.ok(timestamp !== null, 'Timestamp should not be null');
    assert.ok(timestamp! > 0, 'Timestamp should be positive');
  });

  it('should return null when heartbeat file does not exist', () => {
    const timestamp = MasterHeartbeatManager.readLastHeartbeat(testHeartbeatPath);
    assert.strictEqual(timestamp, null, 'Should return null when file does not exist');
  });

  it('should detect alive master', async () => {
    manager = new MasterHeartbeatManager({
      heartbeatPath: testHeartbeatPath,
      heartbeatInterval: 100,
    });

    manager.start();
    await new Promise(resolve => setTimeout(resolve, 50));

    const isAlive = MasterHeartbeatManager.isAlive(testHeartbeatPath, 1000);
    assert.ok(isAlive, 'Master should be alive');
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
    assert.ok(!isAlive, 'Master should be dead after timeout');
  });

  it('should create heartbeat manager with factory function', () => {
    manager = createMasterHeartbeat({
      heartbeatPath: testHeartbeatPath,
      heartbeatInterval: 100,
    });

    assert.ok(manager instanceof MasterHeartbeatManager, 'Should create instance');
  });

  it('should use default config values', () => {
    manager = new MasterHeartbeatManager();
    // 无异常即通过
    assert.ok(manager, 'Should create with default config');
  });
});
