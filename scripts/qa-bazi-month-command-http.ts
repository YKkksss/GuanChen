import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, createSession, getUserByUsername, registerUser, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { BAZI_MONTH_COMMAND_VERSION } from '../lib/bazi/month-command-types';
import { BAZI_READING_PROMPT_VERSION } from '../lib/bazi/reading-interpretation';
import type { BaziReadingDetail } from '../lib/bazi/reading-types';

const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('只允许独立临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
const manifest = JSON.parse(readFileSync(path.join(directory, 'bazi-month-command-manifest.json'), 'utf8'));
const user = getUserByUsername(manifest.username);
if (!user || !user.username.startsWith('month-command-')) throw new Error('需要本轮合成账号');
const base = 'http://127.0.0.1:30002', checks: Array<{ label: string; passed: true }> = [];
function check(value: unknown, label: string) { assert.ok(value, label); checks.push({ label, passed: true }); }
async function request(url: string, token?: string, body?: unknown, origin = base) {
  return fetch(base + url, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json', origin }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function expectStatus(response: Response, expected: number, label: string) { check(response.status === expected, `${label}：HTTP ${expected}`); return response.json(); }
const mockMode = (mode: string) => fetch(`http://127.0.0.1:30003/__qa/${mode}`);
async function main() {
  const token = createSession(user!.id), other = await registerUser({ username: `command-http-${randomUUID().slice(0, 8)}`, password: `${randomUUID()}!Qa`, displayName: '司事隔离合成乙' });
  const otherToken = createSession(other.id), saved = new Map<string, string>();
  const before = await (await fetch('http://127.0.0.1:30003/__qa/stats')).json();
  for (const item of manifest.cases) {
    const endpoint = `/api/bazi/charts/${item.chartId}/reading`, response = await request(endpoint, token);
    check(response.headers.get('cache-control') === 'private, no-store', `${item.key}私有结果不缓存`);
    const detail: BaziReadingDetail = (await expectStatus(response, 200, `${item.key}本人读取`)).detail;
    const review = detail.facts.monthCommandReview!;
    check(review.version === BAZI_MONTH_COMMAND_VERSION && review.status === item.status && review.candidateSegmentIds.length === item.candidateCount, `${item.key}复核状态及候选与原计算一致`);
    check(detail.facts.evidence.some(evidence => evidence.id === 'strength:month-command:policy') && detail.facts.evidence.some(evidence => evidence.id === 'pattern:month-command:comparison'), `${item.key}两方法依据完整`);
    if (item.key === 'literal' || item.key === 'short') check(review.segments.find(segment => segment.id === review.activeSegmentId)?.stem === null, `${item.key}原文字未擅改天干`);
    if (item.key === 'different') check(review.segments.find(segment => segment.id === review.activeSegmentId)?.stem === '壬' && !review.comparisons.monthHiddenStems.some(hidden => hidden.stem === '壬'), '辰月原文壬与盘中月藏差异保留');
    if (review.unknownTime) check(review.segments.every(segment => segment.tenGod === null) && review.comparisons.monthHiddenStems.every(hidden => hidden.tenGod === null), `${item.key}新层不冒用整日唯一十神`);
    saved.set(item.chartId, JSON.stringify(detail.facts));
    const denied = await expectStatus(await request(endpoint, otherToken), 404, `${item.key}跨账号拒绝`);
    check(!JSON.stringify(denied).includes('monthCommandReview'), `${item.key}拒绝响应不泄漏司事事实`);
  }
  const target = manifest.cases.find((item: { key: string }) => item.key === 'different'), endpoint = `/api/bazi/charts/${target.chartId}/reading`;
  await expectStatus(await request(endpoint), 401, '匿名读取拒绝');
  await expectStatus(await request(endpoint, otherToken, { regenerate: true }), 404, '跨账号生成拒绝');
  await expectStatus(await request(endpoint, undefined, { regenerate: true }), 401, '匿名生成拒绝');
  await expectStatus(await request(endpoint, token, { regenerate: true }, 'https://untrusted.example'), 403, '异源生成拒绝');
  await expectStatus(await request(endpoint, token, { regenerate: 'yes' }), 400, '错误生成参数拒绝');
  const withoutAi = await (await fetch('http://127.0.0.1:30003/__qa/stats')).json();
  check(withoutAi.requestCount === before.requestCount, '读取及所有拒绝请求不调用AI');
  const generated: BaziReadingDetail = (await expectStatus(await request(endpoint, token, { regenerate: false, facts: { monthCommandReview: { version: 'qa-forged-command' } }, userId: other.id }), 200, '服务端生成新报告')).detail;
  const version = generated.versions[0];
  check(version.status === 'completed' && version.facts.monthCommandReview?.version === BAZI_MONTH_COMMAND_VERSION && !JSON.stringify(version).includes('qa-forged-command'), '伪造事实及账号不覆盖服务端新快照');
  check(version.content?.sections.find(section => section.key === 'strength')?.evidenceIds.some(id => id.startsWith('strength:month-command:')) && version.content.sections.find(section => section.key === 'pattern')?.evidenceIds.some(id => id.startsWith('pattern:month-command:')), '新报告旺衰及格局均引用实际司事依据');
  const prompt = runAsUser(user!, () => (getDatabase().prepare('SELECT prompt_version FROM bazi_reading_versions WHERE id=?').get(version.id) as { prompt_version: string }).prompt_version);
  check(prompt === BAZI_READING_PROMPT_VERSION, '数据库保存实际v5提示');
  const reused: BaziReadingDetail = (await expectStatus(await request(endpoint, token, {}), 200, '同事实复用已完成报告')).detail;
  check(reused.versions[0].id === version.id, '重复生成不新增版本');
  await mockMode('fail');
  await expectStatus(await request(endpoint, token, { regenerate: true }), 502, '供应商失败返回脱敏错误');
  const failed: BaziReadingDetail = (await expectStatus(await request(endpoint, token), 200, '失败后旧版仍可读')).detail;
  check(failed.versions[0].status === 'failed' && failed.versions.some(item => item.id === version.id && item.status === 'completed'), '失败不覆盖完成报告');
  await mockMode('normal');
  const retry: BaziReadingDetail = (await expectStatus(await request(endpoint, token, { regenerate: true }), 200, '失败重试另存新报告')).detail;
  check(retry.versions[0].status === 'completed' && retry.versions[0].id !== version.id, '重试完成且保留历史版本');
  const conversation = (await expectStatus(await request('/api/bazi/conversations', token, { chartVersionId: target.chartId }), 201, '建立当前盘连续问答')).conversation;
  const response = await request(`/api/bazi/conversations/${conversation.id}/respond`, token, { message: '请核对原局人元司令分日和藏干的区别，不判断现实事件。', requestId: randomUUID() });
  check(response.ok && response.headers.get('content-type')?.includes('text/event-stream'), '连续问答返回有效事件流'); await response.text();
  const logs = readFileSync(path.join(directory, 'ai-requests.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const chat = logs.findLast(item => item.messages.at(-1)?.content === '请核对原局人元司令分日和藏干的区别，不判断现实事件。');
  check(chat?.messages.some((message: { content: string }) => message.content.includes('【人元司事分日复核】') && message.content.includes(BAZI_MONTH_COMMAND_VERSION)), '实际供应商请求携带同源分日快照');
  await expectStatus(await request(`/api/bazi/conversations/${conversation.id}/messages`, otherToken), 404, '连续问答历史按账号隔离');
  for (const item of manifest.cases) {
    const detail: BaziReadingDetail = (await expectStatus(await request(`/api/bazi/charts/${item.chartId}/reading`, token), 200, '再次读取固定命盘复核')).detail;
    check(JSON.stringify(detail.facts) === saved.get(item.chartId), '报告及问答不改原命盘复核事实');
    for (const legacy of detail.versions.filter(item => item.facts.methodologyVersion === 'bazi-reading-v4-method-premise-review')) check(!legacy.facts.monthCommandReview && !legacy.facts.evidence.some(evidence => evidence.id.includes(':month-command:')), '旧v4报告未补入新层或新依据');
  }
  const stats = await (await fetch('http://127.0.0.1:30003/__qa/stats')).json();
  writeFileSync('docs/qa-evidence/2026-10-17-bazi-month-command-http.json', JSON.stringify({ at: new Date().toISOString(), scope: '真实本地HTTP与独立合成账号、本机模拟供应商；真实供应商0', passed: true, count: checks.length, checks, mockRequests: stats.requestCount - before.requestCount }, null, 2) + '\n');
  console.log(`真实HTTP验收通过${checks.length}项；本轮模拟AI${stats.requestCount - before.requestCount}次。`);
  runAsUser(user!, closeDatabaseConnection); runAsUser(other, closeDatabaseConnection); closeAccountConnections();
}
main().catch(async error => { await mockMode('normal').catch(() => {}); console.error(error); process.exitCode = 1; });
