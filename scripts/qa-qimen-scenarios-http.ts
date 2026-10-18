import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, createSession, getUserByUsername, registerUser, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { QIMEN_SCENARIO_VERSION } from '../lib/qimen/scenario-types';
import { QIMEN_PROMPT_VERSION } from '../lib/qimen/chat';
import type { QimenDetail, QimenSession } from '../lib/qimen/types';

const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('只允许独立临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
const manifest = JSON.parse(readFileSync(path.join(directory, 'qimen-scenarios-manifest.json'), 'utf8'));
const user = getUserByUsername(manifest.username);
if (!user || !user.username.startsWith('qimen-scene-')) throw new Error('需要本轮合成验收账号');
const base = 'http://127.0.0.1:30002';
const checks: Array<{ label: string; passed: true }> = [];
function check(value: unknown, label: string) { assert.ok(value, label); checks.push({ label, passed: true }); }
async function request(url: string, token?: string, method = 'GET', body?: unknown, origin = base) {
  return fetch(base + url, { method, headers: { ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json', origin }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function expectStatus(response: Response, status: number, label: string) {
  check(response.status === status, `${label}：HTTP ${status}`);
  return response.json();
}
async function main() {
  const token = createSession(user!.id);
  const other = await registerUser({ username: `qimen-http-${randomUUID().slice(0, 8)}`, password: `${randomUUID()}!Qa`, displayName: '占类条件隔离合成乙' });
  const otherToken = createSession(other.id);
  const snapshots = new Map<string, string>();
  for (const [key, id] of Object.entries(manifest.plans) as Array<[string, string]>) {
    const response = await request(`/api/qimen/${id}`, token);
    check(response.headers.get('cache-control') === 'private, no-store', `${key}响应私有不缓存`);
    const body = await expectStatus(response, 200, `${key}当前账号读取`);
    const session = (body as { detail: QimenDetail }).detail.session;
    snapshots.set(id, JSON.stringify(session.result));
    if (key === 'v1') check(!session.result.reading?.scenario && session.result.reading?.version.includes('v1'), '上一版条件快照不追加占类条件');
    else if (key === 'old') check(!session.result.reading, '基础旧快照不补reading');
    else check(session.result.reading?.scenario?.version === QIMEN_SCENARIO_VERSION, `${key}新版含保存的占类依据`);
  }
  const id = manifest.plans.study as string;
  await expectStatus(await request(`/api/qimen/${id}`), 401, '匿名拒绝');
  const forbidden = await expectStatus(await request(`/api/qimen/${id}`, otherToken), 404, '跨账号拒绝');
  check(!JSON.stringify(forbidden).includes('scenario'), '跨账号错误不泄漏占类依据');
  await expectStatus(await request('/api/qimen/preview', token, 'POST', manifest.inputs.study, 'https://untrusted.example'), 403, '异源写入拒绝');
  await expectStatus(await request('/api/qimen/preview', token, 'POST', { ...manifest.inputs.study, focusTarget: 'manual_palace', focusPalace: 0 }), 400, '非法取用位置拒绝');
  await expectStatus(await request('/api/qimen/preview', token, 'POST', { ...manifest.inputs.study, focusTarget: '__proto__' }), 400, '原型属性模板拒绝');
  for (const invalid of ['__proto__', 'constructor', 'unknown', null, 1]) {
    await expectStatus(await request('/api/qimen/preview', token, 'POST', { ...manifest.inputs.study, scenario: invalid }), 400, '非法占类场景拒绝');
  }
  const preview = await expectStatus(await request('/api/qimen/preview', token, 'POST', { ...manifest.inputs.study, reading: { scenario: { version: 'qa-forged-qimen-scenario' } } }), 200, '预览服务端重算');
  check(preview.result.reading.scenario.version === QIMEN_SCENARIO_VERSION && !JSON.stringify(preview).includes('qa-forged-qimen-scenario'), '输入伪造占类结果不进入快照');
  const newBody = { title: 'HTTP占类条件合成验收', question: '合成验收：解释来源条件。', input: manifest.inputs.study, userId: other.id, result: { reading: { scenario: { version: 'qa-forged-qimen-scenario' } } } };
  const created = await expectStatus(await request('/api/qimen', token, 'POST', newBody), 201, '新建独立合成占问');
  const newSession: QimenSession = created.session;
  check(newSession.result.reading?.scenario?.version === QIMEN_SCENARIO_VERSION, '保存只消费原始输入与当前规则');
  await expectStatus(await request(`/api/qimen/${newSession.id}`, otherToken), 404, '伪造userId不跨库写入');
  await expectStatus(await request('/api/qimen', token, 'POST', newBody), 200, '同条件重复保存复用');

  const send = async (sessionId: string, message: string, extra: Record<string, string> = {}) => expectStatus(await request(`/api/qimen/${sessionId}/messages`, token, 'POST', { message, requestId: randomUUID(), ...extra }), 200, '模拟AI回复完成');
  const fresh = await send(newSession.id, '请解释保存的占类取用。');
  const turn = fresh.detail.turns.at(-1);
  check(turn.status === 'completed' && turn.evidenceIds.every((value: string) => value.startsWith('reading:scenario:')), '新版回复引用真实占类依据');
  check(runAsUser(user!, () => (getDatabase().prepare('SELECT prompt_version AS v FROM qimen_turns WHERE id=?').get(turn.id) as { v: string }).v) === QIMEN_PROMPT_VERSION, '新版回复保存v3提示策略');
  for (const key of ['wealth', 'travel']) {
    const scene = await send(manifest.plans[key], '请解释保存的占类条件和比较层级。');
    check(scene.detail.turns.at(-1).evidenceIds.every((value: string) => value.startsWith('reading:scenario:')), `${key}回复引用该占类保存依据`);
  }
  for (const [key, version] of [['v1', 'qimen-chat-v2-conditional-reading'], ['old', 'qimen-chat-v1']]) {
    const legacy = await send(manifest.plans[key], '请只解释这份旧快照已保存的范围。');
    const legacyTurn = legacy.detail.turns.at(-1);
    check(!legacyTurn.evidenceIds.some((value: string) => value.startsWith('reading:scenario:')), `${key}不引用新占类依据`);
    check(runAsUser(user!, () => (getDatabase().prepare('SELECT prompt_version AS v FROM qimen_turns WHERE id=?').get(legacyTurn.id) as { v: string }).v) === version, `${key}保存自身提示版本`);
  }
  await fetch('http://127.0.0.1:30003/__qa/fail');
  await expectStatus(await request(`/api/qimen/${newSession.id}/messages`, token, 'POST', { message: '合成失败与重试', requestId: randomUUID() }), 502, '模拟供应商失败可恢复');
  const failed = await expectStatus(await request(`/api/qimen/${newSession.id}`, token), 200, '失败后原对话保留');
  check(failed.detail.turns.at(-1).status === 'failed' && failed.detail.turns.some((item: { status: string }) => item.status === 'completed'), '失败记录与已完成对话并存');
  await fetch('http://127.0.0.1:30003/__qa/normal');
  const retried = await send(newSession.id, '合成失败与重试', { retryOf: failed.detail.turns.at(-1).id });
  check(retried.detail.turns.at(-1).status === 'completed', '失败后按原消息另存重试');
  for (const [sessionId, snapshot] of snapshots) {
    const body = await expectStatus(await request(`/api/qimen/${sessionId}`, token), 200, '复读原占问');
    check(JSON.stringify(body.detail.session.result) === snapshot, '问答与回看不改写原卦及三代快照');
  }
  const stats = await (await fetch('http://127.0.0.1:30003/__qa/stats')).json();
  writeFileSync('docs/qa-evidence/2026-10-16-qimen-scenarios-http.json', JSON.stringify({ at: new Date().toISOString(), scope: '真实应用、独立账号数据库与本机模拟AI；无真实供应商', harnessNote: '首轮通用词断言误中既有提示文案；改用唯一伪造标记后复验，未修改业务代码', passed: true, count: checks.length, checks, mockRequestsAtCompletion: stats.requestCount }, null, 2) + '\n');
  console.log(`真实HTTP验收通过：${checks.length}项；模拟请求累计${stats.requestCount}次。`);
  runAsUser(user!, closeDatabaseConnection);
  runAsUser(other, closeDatabaseConnection);
  closeAccountConnections();
}
main().catch(async error => { await fetch('http://127.0.0.1:30003/__qa/normal').catch(() => {}); console.error(error); process.exitCode = 1; });
