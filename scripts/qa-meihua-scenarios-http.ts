import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, createSession, getUserByUsername, registerUser, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { MEIHUA_SCENARIO_VERSION } from '../lib/meihua/scenario-types';
import { MEIHUA_BASE_PROMPT_VERSION, MEIHUA_PROMPT_VERSION, MEIHUA_SEASON_PROMPT_VERSION, MEIHUA_IMAGERY_PROMPT_VERSION } from '../lib/meihua/chat';
import type { MeihuaDetail } from '../lib/meihua/types';

const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('只允许独立临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
const manifest = JSON.parse(readFileSync(path.join(directory, 'meihua-scenarios-manifest.json'), 'utf8'));
const user = getUserByUsername(manifest.username);
if (!user || !user.username.startsWith('meihua-scenes-')) throw new Error('需要本轮合成验收账号');
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
  const other = await registerUser({ username: `scene-http-${randomUUID().slice(0, 8)}`, password: `${randomUUID()}!Qa`, displayName: '占类隔离合成乙' });
  const otherToken = createSession(other.id), snapshots = new Map<string, string>();
  const before = await (await fetch('http://127.0.0.1:30003/__qa/stats')).json();
  for (const [key, id] of Object.entries(manifest.plans) as Array<[string, string]>) {
    const response = await request(`/api/meihua/${id}`, token);
    check(response.headers.get('cache-control') === 'private, no-store', `${key}私有响应不缓存`);
    const detail: MeihuaDetail = (await expectStatus(response, 200, `${key}本人读取`)).detail;
    const { result } = detail.session, scenario = result.reading?.scenario;
    snapshots.set(id, JSON.stringify(result));
    if (['imagery', 'season', 'base'].includes(key)) check(!scenario && !result.evidence.some(item => item.id.startsWith('reading:scenario:')), `${key}旧快照不追加占类`);
    else if (key === 'none') check(scenario?.status === 'unspecified' && scenario.key === 'none' && scenario.roles.length === 0 && scenario.primaryCondition === null && scenario.supplements.length === 0, '含求财出行文字但未指定不猜占类');
    else {
      check(scenario?.version === MEIHUA_SCENARIO_VERSION && scenario.roles.length === 5 && scenario.supplements.length === 3, `${key}五角色及三个辅助位置完整`);
      check(scenario?.primaryCondition?.ruleScope === 'selected_scenario_primary' && scenario.supplements.every(item => item.ruleScope === 'shared_body_use_reference'), `${key}占类条文与通用辅助分开`);
    }
    if (key === 'noTime') check(scenario?.roles.every(item => item.seasonState === null) && scenario.primaryCondition?.bodySeasonState === null, '无时刻不补两侧季节');
    if (key === 'pure') check(scenario?.roles.find(item => item.nodeKey === 'mutual_lower')?.sourceBoard === 'changed', '纯乾异例场景沿用真实变盘来源');
  }
  const endpoint = `/api/meihua/${manifest.plans.current}`;
  await expectStatus(await request(endpoint), 401, '匿名拒绝');
  const forbidden = await expectStatus(await request(endpoint, otherToken), 404, '跨账号读取拒绝');
  check(!JSON.stringify(forbidden).includes('scenario'), '拒绝响应不泄漏占类');
  await expectStatus(await request(`${endpoint}/messages`, otherToken, { message: '越权请求', requestId: randomUUID() }), 404, '跨账号问答拒绝');
  await expectStatus(await request('/api/meihua/preview', token, manifest.input, 'https://untrusted.example'), 403, '异源预览拒绝');
  await expectStatus(await request('/api/meihua', token, { title: '异源合成', question: '不得建立', input: manifest.input }, 'https://untrusted.example'), 403, '异源保存拒绝');
  for (const scenario of [null, 1, true, [], {}, '__proto__', 'constructor', 'health', '']) await expectStatus(await request('/api/meihua/preview', token, { ...manifest.input, scenario }), 400, '非法占类和原型键拒绝');
  const forged = await expectStatus(await request('/api/meihua/preview', token, { ...manifest.input, reading: { scenario: { version: 'qa-forged' } }, result: { reading: { scenario: { version: 'qa-forged' } } } }), 200, '预览服务端重算');
  check(forged.result.reading.scenario.version === MEIHUA_SCENARIO_VERSION && !JSON.stringify(forged).includes('qa-forged'), '伪造占类不进入预览');
  const createBody = { title: 'HTTP占类合成', question: '合成条件不认定事件', input: manifest.input, userId: other.id, result: { reading: { scenario: { version: 'qa-forged' } } } };
  const created = await expectStatus(await request('/api/meihua', token, createBody), 201, '保存合成占问');
  check(created.session.result.reading.scenario.version === MEIHUA_SCENARIO_VERSION && !JSON.stringify(created).includes('qa-forged'), '保存采用原始参数重算');
  const duplicate = await expectStatus(await request('/api/meihua', token, createBody), 200, '同条件保存复用');
  check(duplicate.session.id === created.session.id, '幂等复用同一占问');
  const changed = await expectStatus(await request('/api/meihua', token, { ...createBody, input: { ...manifest.input, scenario: 'wealth' } }), 201, '更换占类另存');
  check(changed.session.id !== created.session.id && changed.session.result.reading.scenario.key === 'wealth', '占类进入指纹隔离');
  await expectStatus(await request(`/api/meihua/${created.session.id}`, otherToken), 404, '伪造用户字段不能跨库保存');
  const noAi = await (await fetch('http://127.0.0.1:30003/__qa/stats')).json();
  check(noAi.requestCount === before.requestCount, '预览保存回看均不调用AI');
  const send = async (id: string, message: string, extra: Record<string, string> = {}) => expectStatus(await request(`/api/meihua/${id}/messages`, token, { message, requestId: randomUUID(), ...extra }), 200, '模拟问答完成');
  for (const [key, prompt] of [['current', MEIHUA_PROMPT_VERSION], ['none', MEIHUA_PROMPT_VERSION], ['imagery', MEIHUA_IMAGERY_PROMPT_VERSION], ['season', MEIHUA_SEASON_PROMPT_VERSION], ['base', MEIHUA_BASE_PROMPT_VERSION]] as const) {
    const detail: MeihuaDetail = (await send(manifest.plans[key], '请按保存快照的能力范围复核。')).detail;
    const turn = detail.turns.at(-1)!;
    check(turn.status === 'completed', `${key}对应能力完成回复`);
    check(runAsUser(user!, () => (getDatabase().prepare('SELECT prompt_version AS v FROM meihua_turns WHERE id=?').get(turn.id) as { v: string }).v) === prompt, `${key}保存实际提示版本`);
    check(turn.evidenceIds.some(id => id.startsWith('reading:scenario:')) === ['current', 'none'].includes(key), `${key}占类引用符合保存能力`);
  }
  await mockMode('fail');
  await expectStatus(await request(`${endpoint}/messages`, token, { message: '合成失败重试', requestId: randomUUID() }), 502, '供应商失败脱敏');
  const failed: MeihuaDetail = (await expectStatus(await request(endpoint, token), 200, '失败后读取')).detail;
  check(failed.turns.at(-1)?.status === 'failed' && failed.turns.some(turn => turn.status === 'completed'), '失败保留原完成回复');
  await mockMode('normal');
  const retried = await send(manifest.plans.current, '合成失败重试', { retryOf: failed.turns.at(-1)!.id });
  check(retried.detail.turns.at(-1).status === 'completed', '重试另存完成');
  await mockMode('slow');
  const pending = request(`${endpoint}/messages`, token, { message: '合成停止测试', requestId: randomUUID() });
  let generating: MeihuaDetail['turns'][number] | undefined;
  for (let i = 0; i < 20; i++) {
    const detail = (await (await request(endpoint, token)).json()).detail as MeihuaDetail;
    generating = detail.turns.find(turn => turn.status === 'generating');
    if (generating) break;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  check(Boolean(generating), '慢回复进入生成状态');
  await expectStatus(await request(`${endpoint}/cancel`, token, { turnId: generating!.id }), 200, '生成中停止');
  await pending;
  await mockMode('normal');
  const stopped: MeihuaDetail = (await (await request(endpoint, token)).json()).detail;
  check(stopped.turns.find(turn => turn.id === generating!.id)?.status === 'canceled', '停止后未被迟到回复覆盖');
  for (const [id, snapshot] of snapshots) {
    const detail: MeihuaDetail = (await expectStatus(await request(`/api/meihua/${id}`, token), 200, '复读固定快照')).detail;
    check(JSON.stringify(detail.session.result) === snapshot, '问答和重开不重写四代快照');
  }
  const stats = await (await fetch('http://127.0.0.1:30003/__qa/stats')).json();
  writeFileSync('docs/qa-evidence/2026-10-17-meihua-scenarios-http.json', JSON.stringify({ at: new Date().toISOString(), scope: '真实本地HTTP、独立合成账号和本机模拟供应商；真实供应商0', passed: true, count: checks.length, checks, mockRequests: stats.requestCount - before.requestCount }, null, 2) + '\n');
  console.log(`真实HTTP通过${checks.length}项，模拟AI${stats.requestCount - before.requestCount}次。`);
  runAsUser(user!, closeDatabaseConnection); runAsUser(other, closeDatabaseConnection); closeAccountConnections();
}
main().catch(async error => { await mockMode('normal').catch(() => {}); console.error(error); process.exitCode = 1; });
