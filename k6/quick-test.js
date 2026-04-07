/**
 * EKET Framework - k6 快速压力测试
 * 简化版本，用于快速验证性能
 *
 * 运行方式：
 * k6 run k6/quick-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // 30 秒爬升到 50 并发
    { duration: '1m', target: 100 },   // 1 分钟爬升到 100 并发
    { duration: '2m', target: 500 },   // 2 分钟爬升到 500 并发
    { duration: '1m', target: 500 },   // 维持 500 并发 1 分钟
    { duration: '30s', target: 0 },    // 30 秒降到 0
  ],
  thresholds: {
    'http_req_duration': ['p(95)<100'],
    'http_req_failed': ['rate<0.01'],
  },
};

export default function () {
  const baseUrl = __ENV.EKET_HOOK_URL || 'http://localhost:8899';

  const payload = JSON.stringify({
    event: 'test',
    instanceId: `vu-${__VU}`,
    timestamp: Date.now(),
  });

  const res = http.post(`${baseUrl}/hooks/pre-tool-use`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'latency < 100ms': (r) => r.timings.duration < 100,
  });

  sleep(1);
}
