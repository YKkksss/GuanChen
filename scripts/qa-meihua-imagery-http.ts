import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, createSession, getUserByUsername, registerUser, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { MEIHUA_IMAGERY_VERSION } from '../lib/meihua/imagery-types';
import { MEIHUA_BASE_PROMPT_VERSION, MEIHUA_PROMPT_VERSION, MEIHUA_SEASON_PROMPT_VERSION } from '../lib/meihua/chat';
import type { MeihuaDetail } from '../lib/meihua/types';

const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('只允许独立临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
const manifest = JSON.parse(readFileSync(path.join(directory, 'meihua-imagery-manifest.json'), 'utf8'));
const user = getUserByUsername(manifest.username);
if (!user || !user.username.startsWith('meihua-symbols-')) throw new Error('需要本轮合成验收账号');
const base = 'http://127.0.0.1:30002';
const checks: Array<{ label: string; passed: true }> = [];
function check(value: unknown, label: string) { assert.ok(value, label); checks.push({ label, passed: true }); }
async function request(url: string, token?: string, body?: unknown, origin = base) {
  return fetch(base + url, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json', origin }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function expectStatus(response: Response, status: number, label: string) { check(response.status === status, `${label}：HTTP ${status}`); return response.json(); }
const mockMode = (mode: string) => fetch(`http://127.0.0.1:30003/__qa/${mode}`);
async function main() {
  const token = createSession(user!.id);
  const other = await registerUser({ username: `meihua-http-${randomUUID().slice(0, 8)}`, password: `${randomUUID()}!Qa`, displayName: '梅花取象隔离合成乙' });
  const otherToken = createSession(other.id);
  const snapshots = new Map<string, string>();
  const before = await (await fetch('http://127.0.0.1:30003/__qa/stats')).json();
  for (const [key, id] of Object.entries(manifest.plans) as Array<[string, string]>) {
    const response = await request(`/api/meihua/${id}`, token);
    check(response.headers.get('cache-control') === 'private, no-store', `${key}私有响应不缓存`);
    const detail: MeihuaDetail = (await expectStatus(response, 200, `${key}当前账号读取`)).detail;
    snapshots.set(id, JSON.stringify(detail.session.result));
    const imagery = detail.session.result.reading?.imagery;
    if (key === 'season') check(Boolean(detail.session.result.reading) && !imagery, '上一版季节快照不追加取象');
    else if (key === 'base') check(!detail.session.result.reading, '基础旧卦不补深化');
    else check(imagery?.version === MEIHUA_IMAGERY_VERSION && imagery.nodes.length === 5 && imagery.overlaps.length === 10, `${key}完整五节点与十组同源关系`);
    if (key === 'pure') check(imagery?.mutualSource === 'changed' && imagery.nodes.find(node => node.key === 'mutual_lower')?.changedApplied, '纯乾异例读取变卦翻转值');
    if (key === 'middle') check(imagery?.mutualSource === 'primary' && !imagery.nodes.some(node => node.key.startsWith('mutual') && node.changedApplied), '纯乾通用口径不翻互卦值');
    if (key === 'first' || key === 'sixth') check(imagery?.nodes.filter(node => node.key.startsWith('mutual')).every(node => !node.containsMovingOrigin && !node.changedApplied), `${key}原动位不进入互卦`);
    if (key === 'noTime') check(imagery?.nodes.every(node => node.seasonState === null), '无明确时刻不套当前季节');
  }
  const endpoint = `/api/meihua/${manifest.plans.current}`;
  await expectStatus(await request(endpoint), 401, '匿名拒绝');
  const forbidden = await expectStatus(await request(endpoint, otherToken), 404, '跨账号读取拒绝');
  check(!JSON.stringify(forbidden).includes('imagery') && !JSON.stringify(forbidden).includes('普通互卦'), '拒绝响应不泄漏取象与占问');
  await expectStatus(await request(`${endpoint}/messages`, otherToken, { message: '越权合成请求', requestId: randomUUID() }), 404, '跨账号问答拒绝');
  await expectStatus(await request('/api/meihua/preview', token, manifest.input, 'https://untrusted.example'), 403, '异源写入拒绝');
  for (const input of [{ ...manifest.input, upper: 0 }, { ...manifest.input, movingLine: 7 }, { ...manifest.input, method: '__proto__' }, { ...manifest.input, mutualPolicy: 'constructor' }, { ...manifest.input, seasonPolicy: '__proto__' }]) await expectStatus(await request('/api/meihua/preview', token, input), 400, '非法起卦与原型键拒绝');
  const forged = await expectStatus(await request('/api/meihua/preview', token, { ...manifest.input, imagery: { version: 'qa-forged-imagery' }, result: { reading: { imagery: { version: 'qa-forged-imagery' } } } }), 200, '预览服务端计算');
  check(forged.result.reading.imagery.version === MEIHUA_IMAGERY_VERSION && !JSON.stringify(forged).includes('qa-forged-imagery'), '伪造取象不进入预览');
  const createBody = { title: 'HTTP梅花取象合成', question: '合成资料：请核对结构，不认定实际事件。', input: manifest.input, userId: other.id, result: { reading: { imagery: { version: 'qa-forged-imagery' } } } };
  const created = await expectStatus(await request('/api/meihua', token, createBody), 201, '建立合成占问');
  check(created.session.result.reading.imagery.version === MEIHUA_IMAGERY_VERSION && !JSON.stringify(created).includes('qa-forged-imagery'), '保存只采用原始起卦参数计算');
  await expectStatus(await request('/api/meihua', token, createBody), 200, '相同输入重复保存复用');
  await expectStatus(await request(`/api/meihua/${created.session.id}`, otherToken), 404, '伪造账号字段不能跨库写入');
  const noAi = await (await fetch('http://127.0.0.1:30003/__qa/stats')).json();
  check(noAi.requestCount === before.requestCount, '预览保存回看均不调用AI');
  const send = async (id: string, message: string, extra: Record<string, string> = {}) => expectStatus(await request(`/api/meihua/${id}/messages`, token, { message, requestId: randomUUID(), ...extra }), 200, '模拟问答完成');
  for (const [key, prompt] of [['current', MEIHUA_PROMPT_VERSION], ['season', MEIHUA_SEASON_PROMPT_VERSION], ['base', MEIHUA_BASE_PROMPT_VERSION]] as const) {
    const detail: MeihuaDetail = (await send(manifest.plans[key], '请按这份保存快照的范围解释依据。')).detail;
    const turn = detail.turns.at(-1)!;
    check(turn.status === 'completed', `${key}三代快照各自完成回复`);
    check(runAsUser(user!, () => (getDatabase().prepare('SELECT prompt_version AS v FROM meihua_turns WHERE id=?').get(turn.id) as { v: string }).v) === prompt, `${key}保存对应提示版本`);
    check(key === 'current' ? turn.evidenceIds.some(id => id.startsWith('reading:imagery:')) : !turn.evidenceIds.some(id => id.startsWith('reading:imagery:')), `${key}引用符合保存能力`);
  }
  await mockMode('fail');
  await expectStatus(await request(`${endpoint}/messages`, token, { message: '合成失败后按原问题重试', requestId: randomUUID() }), 502, '失败脱敏返回');
  const failed: MeihuaDetail = (await expectStatus(await request(endpoint, token), 200, '失败后读取')).detail;
  check(failed.turns.at(-1)?.status === 'failed' && failed.turns.some(turn => turn.status === 'completed'), '失败不覆盖已完成对话');
  await mockMode('normal');
  const retried = await send(manifest.plans.current, '合成失败后按原问题重试', { retryOf: failed.turns.at(-1)!.id });
  check(retried.detail.turns.at(-1).status === 'completed', '按原消息重试另存完成');
  for (const [id, snapshot] of snapshots) {
    const detail: MeihuaDetail = (await expectStatus(await request(`/api/meihua/${id}`, token), 200, '复读保存卦象')).detail;
    check(JSON.stringify(detail.session.result) === snapshot, '问答及回看不重写三代快照');
  }
  const stats = await (await fetch('http://127.0.0.1:30003/__qa/stats')).json();
  writeFileSync('docs/qa-evidence/2026-10-16-meihua-imagery-http.json', JSON.stringify({ at: new Date().toISOString(), scope: '真实应用、独立账号与本机模拟AI；真实供应商请求0', passed: true, count: checks.length, checks, mockRequests: stats.requestCount - before.requestCount }, null, 2) + '\n');
  console.log(`真实HTTP验收通过：${checks.length}项；本轮模拟AI${stats.requestCount - before.requestCount}次。`);
  runAsUser(user!, closeDatabaseConnection); runAsUser(other, closeDatabaseConnection); closeAccountConnections();
}
main().catch(async error => { await mockMode('normal').catch(() => {}); console.error(error); process.exitCode = 1; });
