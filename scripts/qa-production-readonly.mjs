import { writeFileSync } from 'node:fs';

const base = (process.env.GUANCHEN_BASE_URL || 'http://127.0.0.1:30001').replace(/\/+$/, '');
const rawCookie = process.env.GUANCHEN_COOKIE || process.env.GUANCHEN_SESSION || '';
const cookie = rawCookie.includes('=') ? rawCookie : rawCookie ? `guanchen_session=${rawCookie}` : '';
const endpoints = [
  '/api/auth/session',
  '/api/conversations?type=chart',
  '/api/bazi/profiles',
  '/api/election',
  '/api/reminders',
  '/api/backups',
  '/api/learning/courses',
  '/api/cases',
];

if (!cookie) {
  console.error('缺少 GUANCHEN_COOKIE 或 GUANCHEN_SESSION；本脚本只做只读 GET，不使用匿名后门。');
  process.exit(1);
}

const results = [];
let passed = true;
for (const path of endpoints) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${base}${path}`, {
      method: 'GET',
      headers: { cookie, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    let shape = 'text';
    try {
      const data = JSON.parse(text);
      shape = Array.isArray(data) ? `array(${data.length})` : data && typeof data === 'object' ? `object(${Object.keys(data).slice(0, 5).join(',')})` : typeof data;
    } catch {
      shape = `non-json(${text.length})`;
    }
    const cacheControl = response.headers.get('cache-control') || '';
    const item = {
      path,
      status: response.status,
      durationMs: Date.now() - startedAt,
      cacheControl,
      shape,
      passed: response.status === 200 && cacheControl.includes('no-store'),
    };
    if (!item.passed) passed = false;
    results.push(item);
  } catch (error) {
    passed = false;
    results.push({ path, status: 0, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.name : 'UnknownError', passed: false });
  }
}

const report = {
  at: new Date().toISOString(),
  base,
  scope: '只读 GET；不创建、不修改、不生成、不调用 AI',
  writes: 0,
  aiRequests: 0,
  passed,
  count: results.length,
  results,
};
const output = JSON.stringify(report, null, 2);
if (process.env.GUANCHEN_READONLY_OUT) writeFileSync(process.env.GUANCHEN_READONLY_OUT, `${output}\n`);
console.log(output);
process.exitCode = passed ? 0 : 1;
