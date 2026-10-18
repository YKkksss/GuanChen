import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { closeAccountConnections, consumeAiUsage, createSession, registerUser } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { withAccount } from '../lib/auth/route';
import { AiQuotaError, assertAiQuota } from '../lib/ai/quota';
import { redactLogValue } from '../lib/observability/logger';
import { GET as health } from '../app/api/health/route';

const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-release-engineering-'));
const accountRoot = path.join(directory, 'accounts');
process.env.ACCOUNT_DATA_DIR = accountRoot;
let checks = 0;
function check(value: unknown, label: string): asserts value { assert.ok(value, label); checks++; }
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); checks++; }
function rejects(work: () => unknown, label: string) { assert.throws(work, label); checks++; }
function healthRequest() { return new Request('http://local/api/health'); }
function accountRequest(token?: string) {
  return new Request('http://local/api/check', { headers: token ? { cookie: `guanchen_session=${token}` } : {} });
}

async function main() {
  try {
    // 1. 未初始化：目录与账号库都不存在，服务本身仍可用。
    {
      const response = await health(healthRequest());
      const body = await response.json() as { status: string; checks: { dataDir: { status: string }; database: { status: string }; disk: { status: string } } };
      equal(response.status, 200, '未初始化时健康检查仍返回 200');
      equal(body.status, 'ok', '未初始化不阻塞服务');
      equal(body.checks.dataDir.status, 'not_initialized', '账号目录未初始化单独标注');
      equal(body.checks.database.status, 'not_initialized', '账号库未初始化单独标注');
      check(['ok', 'low'].includes(body.checks.disk.status), '磁盘状态有明确结果');
      equal(response.headers.get('cache-control'), 'no-store', '健康检查禁止缓存');
      check(Boolean(response.headers.get('x-request-id')), '健康检查带 request id');
    }

    // 2. 账号库存在且可读。
    mkdirSync(accountRoot, { recursive: true });
    const databaseFile = path.join(accountRoot, 'accounts.sqlite');
    {
      const db = new Database(databaseFile);
      db.exec('CREATE TABLE health_probe (value INTEGER)');
      db.prepare('INSERT INTO health_probe(value) VALUES (1)').run();
      db.close();
      const response = await health(healthRequest());
      const body = await response.json() as { status: string; checks: { database: { status: string } } };
      equal(response.status, 200, '账号库可读时健康检查通过');
      equal(body.checks.database.status, 'ok', '只读探测账号库');
    }

    // 3. 账号库损坏：必须降级，不能假装健康。
    {
      writeFileSync(databaseFile, 'not a sqlite database');
      const response = await health(healthRequest());
      const body = await response.json() as { status: string; checks: { database: { status: string } } };
      equal(response.status, 503, '账号库损坏时返回 503');
      equal(body.status, 'degraded', '损坏时状态为 degraded');
      equal(body.checks.database.status, 'error', '损坏原因单独标注');
      rmSync(accountRoot, { recursive: true, force: true });
    }

    // 4. 日志脱敏：只记录结构，不泄露密码、令牌或超长正文。
    {
      equal(redactLogValue({ password: 'x', nested: { token: 'y', ok: 1 }, note: 'z' }), { password: '[redacted]', nested: { token: '[redacted]', ok: 1 }, note: 'z' }, '敏感字段被脱敏');
      const long = 'a'.repeat(2500);
      equal((redactLogValue({ text: long }) as { text: string }).text.length, 2001, '超长文本被截断');
      equal(redactLogValue({ authorization: 'Bearer secret', cookie: 'guanchen_session=abc' }), { authorization: '[redacted]', cookie: '[redacted]' }, '请求头敏感字段不进入日志');
    }

    // 5. withAccount：未登录 401 也带 request id，登录后成功响应带 request id。
    {
      const wrapped = withAccount(async (_request: Request) => new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }));
      const denied = await wrapped(accountRequest());
      equal(denied.status, 401, '未登录请求被拒绝');
      const deniedId = denied.headers.get('x-request-id') ?? '';
      check(/^[0-9a-f-]{36}$/.test(deniedId), '拒绝响应带合法 request id');
      await denied.text();

      const user = await registerUser({ username: `health-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '健康检查合成账号' });
      const token = createSession(user.id);
      const allowed = await wrapped(accountRequest(token));
      equal(allowed.status, 200, '登录后请求通过');
      const allowedId = allowed.headers.get('x-request-id') ?? '';
      check(/^[0-9a-f-]{36}$/.test(allowedId) && allowedId !== deniedId, '成功响应带独立 request id');
      await allowed.text();
      const open = await health(healthRequest());
      const body = await open.json() as { checks: { database: { status: string } } };
      equal(body.checks.database.status, 'ok', '账号库打开后健康检查仍为 ok');

      equal(consumeAiUsage(user.id, 2), { allowed: true, used: 1, limit: 2 }, 'AI 配额第一次扣减');
      equal(consumeAiUsage(user.id, 2), { allowed: true, used: 2, limit: 2 }, 'AI 配额第二次扣减');
      equal(consumeAiUsage(user.id, 2), { allowed: false, used: 2, limit: 2 }, 'AI 配额超限拒绝');
      process.env.AI_DAILY_LIMIT = '4';
      runAsUser(user, () => {
        assertAiQuota(); assertAiQuota(); checks++;
        rejects(() => assertAiQuota(), 'AI 配额在调用入口抛错');
      });
      delete process.env.AI_DAILY_LIMIT;
      check(new AiQuotaError(2).status === 429, 'AI 配额错误带 429 状态');
    }

    console.log(`发布工程专项通过：${checks}项；健康检查未初始化/正常/损坏、只读数据库探测、日志脱敏、request id 与登录态响应；未调用 AI。`);
  } finally {
    closeAccountConnections();
    const absolute = path.resolve(directory), temporary = path.resolve(tmpdir());
    if (path.dirname(absolute) !== temporary || !path.basename(absolute).startsWith('guanchen-release-engineering-')) throw new Error('临时测试清理路径超出预期范围');
    rmSync(absolute, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
