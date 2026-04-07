/**
 * EKET Framework - k6 压力测试脚本
 * TASK-004: 性能基准测试和优化
 *
 * 测试场景：
 * 1. HTTP Hook 服务器性能
 * 2. WebSocket 消息传递性能
 * 3. 1000 并发连接压力测试
 *
 * 运行方式：
 * k6 run k6/load-test.js
 * k6 run --vus 100 --duration 5m k6/load-test.js
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ============================================================================
// 自定义指标
// ============================================================================

const hookLatency = new Trend('hook_latency');
const hookErrors = new Rate('hook_errors');
const wsMessages = new Counter('ws_messages');
const wsErrors = new Rate('ws_errors');

// ============================================================================
// 测试配置
// ============================================================================

export const options = {
  scenarios: {
    // 场景 1: 渐进式负载测试
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },   // 2 分钟爬升到 100 并发
        { duration: '5m', target: 500 },   // 5 分钟爬升到 500 并发
        { duration: '3m', target: 1000 },  // 3 分钟爬升到 1000 并发
        { duration: '5m', target: 1000 },  // 维持 1000 并发 5 分钟
        { duration: '2m', target: 0 },     // 2 分钟降到 0
      ],
      gracefulRampDown: '30s',
      exec: 'httpHookTest',
    },

    // 场景 2: 稳定负载测试
    steady_state: {
      executor: 'constant-vus',
      vus: 500,
      duration: '10m',
      exec: 'httpHookTest',
      startTime: '17m', // 在场景 1 结束后开始
    },

    // 场景 3: WebSocket 连接测试
    websocket_test: {
      executor: 'constant-vus',
      vus: 100,
      duration: '5m',
      exec: 'websocketTest',
      startTime: '27m', // 在场景 2 结束后开始
    },

    // 场景 4: 峰值负载测试
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 2000 },  // 快速爬升到 2000 并发
        { duration: '1m', target: 2000 },   // 维持 1 分钟
        { duration: '30s', target: 0 },     // 快速降到 0
      ],
      exec: 'httpHookTest',
      startTime: '32m', // 在场景 3 结束后开始
    },
  },

  // 阈值定义（测试成功标准）
  thresholds: {
    'http_req_duration': ['p(95)<100'], // 95% 请求 <100ms
    'http_req_failed': ['rate<0.01'],   // 错误率 <1%
    'hook_latency': ['p(95)<50'],       // Hook 延迟 <50ms
    'hook_errors': ['rate<0.01'],       // Hook 错误率 <1%
    'ws_errors': ['rate<0.05'],         // WebSocket 错误率 <5%
  },
};

// ============================================================================
// 测试数据生成
// ============================================================================

function generateHookPayload() {
  return JSON.stringify({
    event: 'pre-tool-use',
    instanceId: `instance-${__VU}`,
    toolName: 'test-tool',
    timestamp: Date.now(),
    metadata: {
      vu: __VU,
      iter: __ITER,
    },
  });
}

function generateMessage() {
  return JSON.stringify({
    id: `msg-${__VU}-${__ITER}`,
    type: 'test',
    sender: `vu-${__VU}`,
    recipient: 'server',
    timestamp: Date.now(),
    payload: {
      iteration: __ITER,
      data: 'x'.repeat(100),
    },
  });
}

// ============================================================================
// 场景 1/2/4: HTTP Hook 测试
// ============================================================================

export function httpHookTest() {
  const baseUrl = __ENV.EKET_HOOK_URL || 'http://localhost:8899';

  // 测试 1: pre-tool-use hook
  const preToolUseStart = Date.now();
  const res1 = http.post(
    `${baseUrl}/hooks/pre-tool-use`,
    generateHookPayload(),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { hook: 'pre-tool-use' },
    }
  );

  check(res1, {
    'pre-tool-use status 200': (r) => r.status === 200,
    'pre-tool-use latency <50ms': (r) => r.timings.duration < 50,
  });

  hookLatency.add(Date.now() - preToolUseStart);
  if (res1.status !== 200) {
    hookErrors.add(1);
  } else {
    hookErrors.add(0);
  }

  sleep(0.1); // 100ms 间隔

  // 测试 2: post-tool-use hook
  const postToolUseStart = Date.now();
  const res2 = http.post(
    `${baseUrl}/hooks/post-tool-use`,
    generateHookPayload(),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { hook: 'post-tool-use' },
    }
  );

  check(res2, {
    'post-tool-use status 200': (r) => r.status === 200,
    'post-tool-use latency <50ms': (r) => r.timings.duration < 50,
  });

  hookLatency.add(Date.now() - postToolUseStart);
  if (res2.status !== 200) {
    hookErrors.add(1);
  } else {
    hookErrors.add(0);
  }

  sleep(0.1);

  // 测试 3: 健康检查
  const res3 = http.get(`${baseUrl}/health`, {
    tags: { endpoint: 'health' },
  });

  check(res3, {
    'health status 200': (r) => r.status === 200,
  });

  sleep(1); // 迭代间隔
}

// ============================================================================
// 场景 3: WebSocket 测试
// ============================================================================

export function websocketTest() {
  const wsUrl = __ENV.EKET_WS_URL || 'ws://localhost:8899/ws';

  const res = ws.connect(wsUrl, {}, function (socket) {
    socket.on('open', () => {
      // 发送连接消息
      socket.send(generateMessage());
    });

    socket.on('message', (data) => {
      wsMessages.add(1);

      // 检查消息格式
      try {
        const msg = JSON.parse(data);
        check(msg, {
          'message has id': (m) => m.id !== undefined,
          'message has type': (m) => m.type !== undefined,
        });
        wsErrors.add(0);
      } catch (e) {
        wsErrors.add(1);
      }
    });

    socket.on('error', (e) => {
      console.error('WebSocket error:', e);
      wsErrors.add(1);
    });

    // 发送多条消息
    for (let i = 0; i < 10; i++) {
      socket.send(generateMessage());
      socket.setTimeout(() => {}, 100);
    }

    // 保持连接 5 秒
    socket.setTimeout(() => {
      socket.close();
    }, 5000);
  });

  check(res, {
    'WebSocket connected': (r) => r && r.status === 101,
  });

  sleep(5); // 等待 WebSocket 关闭
}

// ============================================================================
// 设置和清理
// ============================================================================

export function setup() {
  console.log('🚀 开始 EKET 压力测试');
  console.log(`📊 目标 Hook URL: ${__ENV.EKET_HOOK_URL || 'http://localhost:8899'}`);
  console.log(`📊 目标 WS URL: ${__ENV.EKET_WS_URL || 'ws://localhost:8899/ws'}`);
  console.log(`🎯 测试阈值:`);
  console.log(`   - P95 延迟 <100ms`);
  console.log(`   - 错误率 <1%`);
  console.log(`   - Hook 延迟 <50ms`);
  console.log(`   - 最大并发 1000`);
  console.log(`   - 峰值并发 2000`);
}

export function teardown(data) {
  console.log('✅ 压力测试完成');
}

// ============================================================================
// 自定义汇总报告
// ============================================================================

export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = `./k6/reports/load-test-${timestamp}.json`;

  return {
    [reportPath]: JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

// 简单的文本汇总函数
function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;

  let summary = '\n';
  summary += indent + '='.repeat(70) + '\n';
  summary += indent + '📊 压力测试报告\n';
  summary += indent + '='.repeat(70) + '\n\n';

  summary += indent + '📈 请求统计:\n';
  summary += indent + `  - 总请求数: ${data.metrics.http_reqs.values.count}\n`;
  summary += indent + `  - 失败请求: ${data.metrics.http_req_failed.values.rate.toFixed(4)}%\n`;
  summary += indent + `  - 请求速率: ${data.metrics.http_reqs.values.rate.toFixed(2)} req/s\n\n`;

  summary += indent + '⏱️  响应时间:\n';
  summary += indent + `  - 平均值: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
  summary += indent + `  - 中位数: ${data.metrics.http_req_duration.values.med.toFixed(2)}ms\n`;
  summary += indent + `  - P95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  summary += indent + `  - P99: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n`;
  summary += indent + `  - 最大值: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms\n\n`;

  summary += indent + '🎯 目标检查:\n';
  const p95Latency = data.metrics.http_req_duration.values['p(95)'];
  const errorRate = data.metrics.http_req_failed.values.rate;
  summary += indent + `  - P95 <100ms: ${p95Latency < 100 ? '✅ PASS' : '❌ FAIL'} (${p95Latency.toFixed(2)}ms)\n`;
  summary += indent + `  - 错误率 <1%: ${errorRate < 0.01 ? '✅ PASS' : '❌ FAIL'} (${(errorRate * 100).toFixed(2)}%)\n\n`;

  summary += indent + '='.repeat(70) + '\n';

  return summary;
}
