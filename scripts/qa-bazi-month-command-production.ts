import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, createSession, getUserByUsername, SESSION_COOKIE } from '../lib/auth/accounts';
import { BAZI_MONTH_COMMAND_VERSION } from '../lib/bazi/month-command-types';
const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('只允许独立临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
const manifest = JSON.parse(readFileSync(path.join(directory, 'bazi-month-command-manifest.json'), 'utf8'));
const base = 'http://127.0.0.1:30002', checks: Array<{ label: string; passed: true }> = [];
function check(value: unknown, label: string) { assert.ok(value, label); checks.push({ label, passed: true }); }
async function main() {
  const user = getUserByUsername(manifest.username);
  if (!user?.username.startsWith('month-command-')) throw new Error('需要合成账号');
  const token = createSession(user.id);
  for (const item of manifest.cases) {
    const response = await fetch(`${base}/api/bazi/charts/${item.chartId}/reading`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    check(response.ok && response.headers.get('cache-control') === 'private, no-store', `${item.key}生产私有API读取`);
    const { detail } = await response.json(); check(detail.facts.monthCommandReview.version === BAZI_MONTH_COMMAND_VERSION && detail.facts.monthCommandReview.status === item.status, `${item.key}生产复核状态一致`);
    for (const version of detail.versions.filter((version: { facts: { methodologyVersion: string } }) => version.facts.methodologyVersion === 'bazi-reading-v4-method-premise-review')) check(!version.facts.monthCommandReview, '生产旧v4不补算');
  }
  const first = manifest.cases[0];
  check((await fetch(`${base}/api/bazi/charts/${first.chartId}/reading`)).status === 401, '生产匿名拒绝');
  const page = await fetch(`${base}/bazi/reading/${first.chartId}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } }); const html = await page.text();
  check(page.ok && html.includes('正在确认登录状态') && html.includes('/_next/static/'), '生产页面返回登录确认与编译资源');
  writeFileSync('docs/qa-evidence/2026-10-17-bazi-month-command-production.json', JSON.stringify({ at: new Date().toISOString(), passed: true, count: checks.length, checks, mockRequests: 0 }, null, 2) + '\n');
  console.log(`生产只读验收通过${checks.length}项，无AI请求。`); closeAccountConnections();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
