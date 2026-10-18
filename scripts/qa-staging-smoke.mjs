import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const port = Number(process.env.STAGING_PORT || 30002);
const base = `http://127.0.0.1:${port}`;
const output = process.env.STAGING_OUT || '';
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-staging-smoke-'));
const accountRoot = path.join(directory, 'accounts');
const reportRoot = path.join(directory, 'report-exports');
mkdirSync(accountRoot, { recursive: true });
mkdirSync(reportRoot, { recursive: true });

const env = {
  ...process.env,
  ACCOUNT_DATA_DIR: accountRoot,
  REPORT_EXPORT_DIR: reportRoot,
  APP_PUBLIC_ORIGIN: base,
  AUTH_COOKIE_SECURE: '0',
  AUTH_REGISTRATION_ENABLED: '1',
  AI_PROVIDER: 'deepseek',
  DEEPSEEK_API_KEY: 'staging-local-placeholder',
  DEEPSEEK_BASE_URL: 'http://127.0.0.1:39999',
  DEEPSEEK_MODEL: 'staging-local-placeholder',
};

const results = [];
function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? '通过' : '失败'} ${name}${detail ? `：${detail}` : ''}`);
}

async function waitForHealth(timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (response.status === 200) return response;
    } catch { /* 服务尚未监听 */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('staging 健康检查超时');
}

async function main() {
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(), env, stdio: 'ignore', windowsHide: true,
  });
  let exited = false;
  let failure = null;
  server.on('exit', () => { exited = true; });
  try {
    const health = await waitForHealth();
    const healthBody = await health.json();
    record('health 200', health.status === 200 && healthBody.service === 'guanchen', JSON.stringify(healthBody.checks));
    record('health 禁止缓存', health.headers.get('cache-control') === 'no-store');

    const login = await fetch(`${base}/login`);
    record('登录页 200', login.status === 200);
    await login.text();

    const username = `staging-${Date.now()}`;
    const password = `staging-${Math.random().toString(36).slice(2)}!A1`;
    const register = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ username, password, displayName: '本地 staging 合成账号' }),
    });
    record('注册 201/200', register.status === 200 || register.status === 201, `status=${register.status}`);
    const registerText = await register.text();
    const setCookie = register.headers.getSetCookie?.() ?? [];
    const cookie = setCookie.map(item => item.split(';')[0]).find(item => item.startsWith('guanchen_session='));
    record('注册返回会话 Cookie', Boolean(cookie), cookie ? 'guanchen_session=***' : registerText.slice(0, 120));

    if (!cookie) throw new Error('注册未返回会话 Cookie，无法继续只读验收');
    const session = await fetch(`${base}/api/auth/session`, { headers: { cookie } });
    const sessionBody = await session.json();
    record('session 200', session.status === 200 && sessionBody.user?.username === username);

    const endpoints = [
      '/api/conversations?type=chart',
      '/api/bazi/profiles',
      '/api/election',
      '/api/reminders',
      '/api/backups',
      '/api/learning/courses',
      '/api/cases',
    ];
    for (const endpoint of endpoints) {
      const response = await fetch(`${base}${endpoint}`, { headers: { cookie } });
      const cache = response.headers.get('cache-control') || '';
      await response.text();
      record(`只读 ${endpoint}`, response.status === 200 && cache.includes('no-store'), `status=${response.status} cache=${cache}`);
    }

    const after = await fetch(`${base}/api/health`, { headers: { cookie } });
    const afterBody = await after.json();
    record('注册后 health 数据库正常', after.status === 200 && afterBody.checks.database.status === 'ok', JSON.stringify(afterBody.checks));
  } catch (error) {
    failure = error;
    record('staging 流程', false, error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    if (!exited) {
      server.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!exited) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    }
    const report = {
      at: new Date().toISOString(),
      base,
      passed: !failure && results.every(item => item.passed),
      count: results.length,
      results,
      scope: '本地 127.0.0.1 staging；隔离临时数据目录；仅健康/登录/注册/只读 GET；不调用 AI。',
      limitation: '未验证正式域名、HTTPS、反向代理、真机或真实模型。',
    };
    if (output) writeFileSync(path.resolve(output), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    rmSync(directory, { recursive: true, force: true });
    process.exitCode = report.passed ? 0 : 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
