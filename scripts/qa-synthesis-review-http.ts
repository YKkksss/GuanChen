import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeAccountConnections, createSession, getUserByUsername, registerUser, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { SYNTHESIS_DYNAMIC_REVIEW_VERSION } from '../lib/synthesis/dynamic-review-types';
import { LEGACY_SYNTHESIS_DYNAMIC_PROMPT_VERSION, SYNTHESIS_DYNAMIC_PROMPT_VERSION } from '../lib/synthesis/interpretation';
import { SYNTHESIS_TOPICS } from '../lib/synthesis/types';
import type { SynthesisDynamicDetail } from '../lib/synthesis/dynamic-types';

const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('只允许独立临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
const manifest = JSON.parse(readFileSync(path.join(directory, 'synthesis-review-manifest.json'), 'utf8'));
const user = getUserByUsername(manifest.username);
if (!user || !user.username.startsWith('synthesis-review-')) throw new Error('需要本轮合成验收账号');
const base = 'http://127.0.0.1:30002';
const checks: Array<{ label: string; passed: true }> = [];
function check(value: unknown, label: string) { assert.ok(value, label); checks.push({ label, passed: true }); }
async function request(url: string, token?: string, body?: unknown, origin = base) {
  return fetch(base + url, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json', origin }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function expectStatus(response: Response, status: number, label: string) {
  check(response.status === status, `${label}：HTTP ${status}`);
  return response.json();
}
const pathFor = (id: string) => `/api/synthesis/${id}/dynamic`;
const query = (topic = 'overview', level = manifest.selection.level, dateTime = manifest.selection.dateTime) => `?${new URLSearchParams({ topic, level, dateTime })}`;
const mockMode = (mode: string) => fetch(`http://127.0.0.1:30003/__qa/${mode}`);
async function main() {
  const token = createSession(user!.id);
  const other = await registerUser({ username: `synthesis-http-${randomUUID().slice(0, 8)}`, password: `${randomUUID()}!Qa`, displayName: '动态复核账号隔离合成乙' });
  const otherToken = createSession(other.id);
  const beforeStats = await (await fetch('http://127.0.0.1:30003/__qa/stats')).json();
  const snapshots = new Map<string, { raw: string; key: string }>();
  for (const key of ['current', 'unknown', 'birthUnknown', 'preLuck', 'afterLuck', 'legacy']) {
    const id = manifest.plans[key], response = await request(pathFor(id), token);
    check(response.headers.get('cache-control') === 'private, no-store', `${key}响应私有不缓存`);
    const detail: SynthesisDynamicDetail = (await expectStatus(response, 200, `${key}当前账号读取`)).detail;
    snapshots.set(id, { raw: JSON.stringify(detail.facts), key: detail.facts.dynamic.key });
    if (key === 'legacy') check(!detail.facts.dynamic.review && detail.facts.dynamic.key === manifest.plans.legacyKey, '旧阶段不追加新复核字段');
    else check(detail.facts.dynamic.review?.version === SYNTHESIS_DYNAMIC_REVIEW_VERSION, `${key}保存完整复核版本`);
    if (key === 'unknown') check(detail.facts.dynamic.review?.status === 'partial_unknown_time' && !detail.facts.dynamic.review.bazi.nodes.some(item => item.pillarKey === 'time' || item.layer === 'luck_cycle'), '未知时辰后日无时柱及精确大运');
    if (key === 'birthUnknown') check(detail.facts.dynamic.review?.status === 'birth_time_unconfirmed' && detail.facts.dynamic.review.bazi.nodes.length === 0 && detail.facts.dynamic.review.bazi.relations.length === 0, '未知出生当日撤回个人作用适用');
    if (key === 'preLuck' || key === 'afterLuck') check(!detail.facts.dynamic.review?.bazi.nodes.some(item => item.layer === 'luck_cycle'), `${key}不补大运节点`);
  }
  const id = manifest.plans.current, endpoint = pathFor(id);
  for (const topic of Object.keys(SYNTHESIS_TOPICS)) {
    const detail: SynthesisDynamicDetail = (await expectStatus(await request(endpoint + query(topic), token), 200, `${topic}主题读取`)).detail;
    check(detail.facts.dynamic.review?.topic === topic && detail.facts.topic === topic, `${topic}复核事实不混主题`);
  }
  const saved = await expectStatus(await request(endpoint, token, { topic: 'career', action: 'save', selection: { ...manifest.selection, review: { version: 'qa-forged-review' } }, review: { version: 'qa-forged-review' }, userId: other.id }), 200, '服务端保存阶段');
  check(saved.detail.facts.dynamic.review.version === SYNTHESIS_DYNAMIC_REVIEW_VERSION && !JSON.stringify(saved).includes('qa-forged-review'), '伪造复核字段和账号参数不进入快照');
  const noAiStats = await (await fetch('http://127.0.0.1:30003/__qa/stats')).json();
  check(noAiStats.requestCount === beforeStats.requestCount, '预览读取与保存不调用AI');
  await expectStatus(await request(endpoint), 401, '匿名读取拒绝');
  const forbidden = await expectStatus(await request(endpoint, otherToken), 404, '跨账号读取拒绝');
  check(!JSON.stringify(forbidden).includes('nodes') && !JSON.stringify(forbidden).includes(manifest.input.displayName), '跨账号错误不泄漏命盘及关系');
  await expectStatus(await request(endpoint, otherToken, { topic: 'overview', action: 'save', selection: manifest.selection }), 404, '跨账号写入拒绝');
  await expectStatus(await request(endpoint, token, { topic: 'overview', action: 'save', selection: manifest.selection }, 'https://untrusted.example'), 403, '异源写入拒绝');
  for (const badTopic of ['__proto__', 'constructor', 'bad']) await expectStatus(await request(endpoint + query(badTopic), token), 400, '非法主题拒绝');
  for (const selection of [null, {}, { ...manifest.selection, level: 'day' }, { ...manifest.selection, dateTime: '2026-10-16T12:00:00Z' }, { ...manifest.selection, dateTime: '1992-07-09T09:29:59' }]) await expectStatus(await request(endpoint, token, { topic: 'overview', action: 'save', selection }), 400, '非法观察与出生前拒绝');
  await expectStatus(await request(endpoint, token, { topic: 'overview', action: 'save', selection: manifest.selection, stageKey: manifest.plans.legacyKey }), 404, '旧键不跨会话访问');
  await expectStatus(await request(pathFor(manifest.plans.legacy), token, { topic: 'career', action: 'save', selection: manifest.selection, stageKey: manifest.plans.legacyKey }), 404, '旧键不跨主题访问');
  const make = async (sessionId: string, topic: string, extra: Record<string, unknown> = {}) => expectStatus(await request(pathFor(sessionId), token, { topic, selection: manifest.selection, action: 'generate', ...extra }), 200, `${topic}模拟AI完成`);
  for (const topic of Object.keys(SYNTHESIS_TOPICS)) {
    const detail: SynthesisDynamicDetail = (await make(id, topic)).detail;
    const report = detail.versions.find(item => item.id === detail.activeVersionId)!;
    check(report.content?.sections.length === 5 && report.content.sections.every(section => section.evidenceIds.every(value => value.includes(':dynamic:review:'))), `${topic}五章引用当前双侧复核依据`);
    const prompt = runAsUser(user!, () => (getDatabase().prepare('SELECT prompt_version AS v FROM synthesis_report_versions WHERE id=?').get(report.id) as { v: string }).v);
    check(prompt === SYNTHESIS_DYNAMIC_PROMPT_VERSION, `${topic}保存深化提示版本`);
  }
  const oldDetail: SynthesisDynamicDetail = (await make(manifest.plans.legacy, 'overview', { stageKey: manifest.plans.legacyKey })).detail;
  const oldReport = oldDetail.versions.find(item => item.id === oldDetail.activeVersionId)!;
  check(!oldReport.facts.dynamic?.review && !oldReport.content?.sections.some(section => section.evidenceIds.some(value => value.includes(':review:'))), '旧阶段报告不消费新复核');
  check(runAsUser(user!, () => (getDatabase().prepare('SELECT prompt_version AS v FROM synthesis_report_versions WHERE id=?').get(oldReport.id) as { v: string }).v) === LEGACY_SYNTHESIS_DYNAMIC_PROMPT_VERSION, '旧阶段保留v1提示版本');
  await mockMode('fail');
  await expectStatus(await request(endpoint, token, { topic: 'overview', action: 'generate', selection: manifest.selection, regenerate: true }), 502, '供应商失败返回脱敏错误');
  const failed: SynthesisDynamicDetail = (await expectStatus(await request(endpoint + query(), token), 200, '失败后仍能读取')).detail;
  check(failed.versions[0].status === 'failed' && Boolean(failed.activeVersionId), '失败保留旧报告和阶段依据');
  await mockMode('normal');
  const retry = await make(id, 'overview', { regenerate: true });
  check(retry.detail.versions[0].status === 'completed', '失败后重试完成');
  for (const [sessionId, snapshot] of snapshots) {
    const detail = (await expectStatus(await request(pathFor(sessionId) + `?${new URLSearchParams({ topic: 'overview', stageKey: snapshot.key })}`, token), 200, '复读固定阶段')).detail;
    check(JSON.stringify(detail.facts) === snapshot.raw, '生成报告不改写已存阶段事实');
  }
  const stats = await (await fetch('http://127.0.0.1:30003/__qa/stats')).json();
  writeFileSync('docs/qa-evidence/2026-10-16-synthesis-review-http.json', JSON.stringify({ at: new Date().toISOString(), scope: '真实应用、独立账号数据库与本机模拟AI；真实供应商请求0', passed: true, count: checks.length, checks, mockRequests: stats.requestCount - beforeStats.requestCount }, null, 2) + '\n');
  console.log(`真实HTTP验收通过：${checks.length}项；本轮模拟AI${stats.requestCount - beforeStats.requestCount}次。`);
  runAsUser(user!, closeDatabaseConnection); runAsUser(other, closeDatabaseConnection); closeAccountConnections();
}
main().catch(async error => { await mockMode('normal').catch(() => {}); console.error(error); process.exitCode = 1; });
