import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, createSession, getUserByUsername, SESSION_COOKIE } from '../lib/auth/accounts';
import { MEIHUA_IMAGERY_VERSION } from '../lib/meihua/imagery-types';

const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('只允许独立临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
const manifest = JSON.parse(readFileSync(path.join(directory, 'meihua-imagery-manifest.json'), 'utf8'));
const base = 'http://127.0.0.1:30002';
const checks: Array<{ label: string; passed: true }> = [];
function check(value: unknown, label: string) { assert.ok(value, label); checks.push({ label, passed: true }); }
async function main() {
  const user = getUserByUsername(manifest.username);
  if (!user || !user.username.startsWith('meihua-symbols-')) throw new Error('需要本轮合成验收账号');
  const token = createSession(user.id);
  const anonymous = await fetch(`${base}/api/meihua/${manifest.plans.current}`);
  check(anonymous.status === 401, '生产服务匿名读取拒绝');
  for (const [key, id] of Object.entries(manifest.plans) as Array<[string, string]>) {
    const response = await fetch(`${base}/api/meihua/${id}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    check(response.ok && response.headers.get('cache-control') === 'private, no-store', `${key}编译后私有API正常`);
    const { detail } = await response.json();
    const result = detail.session.result;
    if (key === 'season') check(Boolean(result.reading) && !result.reading.imagery, '生产服务旧季节快照不补取象');
    else if (key === 'base') check(!result.reading, '生产服务基础旧盘不补深化');
    else check(result.reading.imagery.version === MEIHUA_IMAGERY_VERSION && result.reading.imagery.nodes.length === 5, `${key}生产取象快照完整`);
  }
  const page = await fetch(`${base}/meihua/${manifest.plans.current}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
  const html = await page.text();
  check(page.ok && html.includes('正在确认登录状态') && html.includes('/_next/static/'), '生产页面返回正确的登录确认壳与编译资源');
  writeFileSync('docs/qa-evidence/2026-10-16-meihua-imagery-production.json', JSON.stringify({ at: new Date().toISOString(), scope: '生产构建启动后的只读验证；独立合成账号，无AI请求', passed: true, count: checks.length, checks }, null, 2) + '\n');
  console.log(`生产启动验收通过：${checks.length}项，无AI请求。`);
  closeAccountConnections();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
