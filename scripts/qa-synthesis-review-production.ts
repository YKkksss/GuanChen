import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, createSession, getUserByUsername, SESSION_COOKIE } from '../lib/auth/accounts';
import { SYNTHESIS_TOPICS } from '../lib/synthesis/types';
import { SYNTHESIS_DYNAMIC_REVIEW_VERSION } from '../lib/synthesis/dynamic-review-types';

const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('只允许独立临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
const manifest = JSON.parse(readFileSync(path.join(directory, 'synthesis-review-manifest.json'), 'utf8'));
const base = 'http://127.0.0.1:30002';
const checks: Array<{ label: string; passed: true }> = [];
function check(value: unknown, label: string) { assert.ok(value, label); checks.push({ label, passed: true }); }
async function main() {
  const user = getUserByUsername(manifest.username);
  if (!user || !user.username.startsWith('synthesis-review-')) throw new Error('需要本轮合成验收账号');
  const token = createSession(user.id);
  const anonymous = await fetch(`${base}/api/synthesis/${manifest.plans.current}/dynamic`);
  check(anonymous.status === 401, '生产服务匿名API仍拒绝');
  for (const topic of Object.keys(SYNTHESIS_TOPICS)) {
    const query = new URLSearchParams({ topic, ...manifest.selection });
    const response = await fetch(`${base}/api/synthesis/${manifest.plans.current}/dynamic?${query}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    check(response.ok && response.headers.get('cache-control') === 'private, no-store', `${topic}编译后API私有读取`);
    const { detail } = await response.json();
    check(detail.facts.dynamic.review.version === SYNTHESIS_DYNAMIC_REVIEW_VERSION && detail.facts.dynamic.review.topic === topic, `${topic}编译后复核版本与主题正确`);
  }
  const old = await (await fetch(`${base}/api/synthesis/${manifest.plans.legacy}/dynamic?topic=overview&stageKey=${encodeURIComponent(manifest.plans.legacyKey)}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } })).json();
  check(!old.detail.facts.dynamic.review && old.detail.facts.dynamic.key === manifest.plans.legacyKey, '生产服务旧阶段不补新能力');
  const page = await fetch(`${base}/synthesis/${manifest.plans.current}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
  const html = await page.text();
  // 账号边界在客户端确认登录；原始服务端文档应提供待确认壳及编译资源，页面交互另由浏览器验收。
  check(page.ok && html.includes('正在确认登录状态') && html.includes('/_next/static/'), '生产合参页面提供登录确认壳及编译资源');
  writeFileSync('docs/qa-evidence/2026-10-16-synthesis-review-production.json', JSON.stringify({ at: new Date().toISOString(), scope: '生产构建启动后只读冒烟；独立临时账号，无AI请求', harnessNote: '初轮前12项API检查通过，最后一项错误地要求原始SSR文档出现客户端登录确认后的按钮；按AccountProvider实际渲染契约校正为确认壳与编译资源后复验，未修改业务代码。', passed: true, count: checks.length, checks }, null, 2) + '\n');
  console.log(`生产启动验收通过：${checks.length}项，无AI请求。`);
  closeAccountConnections();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
