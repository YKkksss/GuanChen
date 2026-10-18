import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { closeAccountConnections, createSession, getUserByUsername, registerUser, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { createBaziBirthProfile, deleteBaziBirthProfile } from '../lib/db/bazi';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { createElectionPlan } from '../lib/db/election';
import { PERSONAL_ELECTION_LEGACY_VERSION, type PersonalElectionInput } from '../lib/election/personal-types';
import type { ElectionInput } from '../lib/election/types';

// 只能给本轮网页隔离环境准备合成档案，不操作日常服务账号。
const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('仅允许系统临时目录下的独立验收环境');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
const user = getUserByUsername(process.env.GUANCHEN_QA_USERNAME || '');
if (!user || !user.username.startsWith('luck-qa-')) throw new Error('仅允许本轮已注册的合成验收账号');
const baseUrl = 'http://127.0.0.1:30002', token = createSession(user.id);
let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
const request = (url: string, auth: string | undefined, method = 'GET', body?: unknown, origin = baseUrl) => fetch(baseUrl + url, { method, headers: { ...(auth ? { cookie: `${SESSION_COOKIE}=${auth}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json', origin }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
function add(label: string, birthDate: string, unknownTime = false) {
  return runAsUser(user!, () => createBaziBirthProfile({ displayName: `合成验收·${label}`, birthDate, birthTime: unknownTime ? undefined : '09:30', unknownTime, gender: 'female', initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'next_day' } }));
}
function conditions(ids: string[], enabled = true): PersonalElectionInput {
  return { participants: ids.map(chartId => ({ chartId, preferredElements: [], cautiousElements: [], basisNote: '' })), avoidDayYearClash: false, avoidDayBranchClash: false, avoidHourYearClash: false, avoidHourBranchClash: false, filterStems: false, ...(enabled ? { includeLuckContext: true } : {}) };
}
function input(ids: string[], enabled = true, date = '2026-11-07'): ElectionInput {
  return { event: 'marriage', startDate: date, endDate: date, ruleMode: 'compare', weekdays: [0, 1, 2, 3, 4, 5, 6], excludedZodiacs: [], personal: conditions(ids, enabled) };
}
async function main() {
  const full = add('完整岁运', '1992-10-11'), unknown = add('时辰未知', '1995-07-21', true), dst = add('历史夏令时', '1988-07-10'), deleted = add('来源删除后', '1990-06-15');
  const fullId = full.charts[0].id, unknownId = unknown.charts[0].id, dstId = dst.charts[0].id;
  const plans = runAsUser(user!, () => {
    const make = (title: string, ids: string[], enabled = true, date = '2026-11-07') => createElectionPlan({ title, input: input(ids, enabled, date) }).plan;
    const pair = make('双人交节背景', [fullId, unknownId]);
    const dstPlan = make('历史夏令时边界', [dstId]);
    const removed = make('来源删除仍保留岁运', [deleted.charts[0].id]);
    const legacy = make('旧版无岁运方案', [fullId], false);
    legacy.result.personal!.version = PERSONAL_ELECTION_LEGACY_VERSION;
    getDatabase().prepare('UPDATE election_plans SET result_json=? WHERE id=?').run(JSON.stringify(legacy.result), legacy.id);
    deleteBaziBirthProfile(deleted.id);
    const cycle = pair.result.personal!.participants.find(p => p.chartId === fullId)!.luck!.cycles[3];
    const transition = make('真实交运秒界', [fullId], true, cycle.startAt!.slice(0, 10));
    return { pair, dst: dstPlan, removed, legacy, transition };
  });
  const outsider = await registerUser({ username: `luck-qa-other-${Date.now().toString(36)}`, password: randomUUID(), displayName: '合成隔离乙' }), other = createSession(outsider.id);
  for (const [name, plan] of Object.entries(plans)) {
    const read = await request(`/api/election/${plan.id}`, token), saved = await read.json();
    check(read.status === 200 && saved.plan.id === plan.id, `${name}方案真实HTTP读取`);
    const response = await request('/api/election/hours', token, 'POST', { planId: plan.id, date: plan.input.startDate }), payload = await response.json();
    check(response.status === 200 && payload.hours.slots.length >= 13, `${name}方案真实HTTP复算时段`);
    check(name === 'legacy' ? payload.hours.slots.every((s: any) => !s.personal.participants.some((p: any) => p.luck)) : payload.hours.slots.every((s: any) => s.personal.participants.every((p: any) => p.luck.segments.length === 1)), `${name}时段完整覆盖且旧版不补写`);
    for (const auth of [undefined, other]) {
      const denied = await request(`/api/election/${plan.id}`, auth); check(denied.status === (auth ? 404 : 401), '匿名与跨账号不可读取个人方案'); await denied.text();
      const deniedHours = await request('/api/election/hours', auth, 'POST', { planId: plan.id, date: plan.input.startDate }); check(deniedHours.status === (auth ? 404 : 401), '匿名与跨账号不可计算个人时段'); await deniedHours.text();
    }
  }
  const malicious = [
    ['/api/election/preview', { ...input([fullId]), personal: { ...conditions([fullId]), participants: [{ ...conditions([fullId]).participants[0], luck: { cycles: [] } }] } }],
    ['/api/election/hours', { planId: plans.pair.id, date: '2026-11-07', savedSnapshot: plans.pair.result.personal }],
    ['/api/election/preview', input([plans.removed.result.personal!.participants[0].chartId])],
  ] as const;
  for (const [endpoint, body] of malicious) { const denied = await request(endpoint, token, 'POST', body); check(denied.status === (endpoint.endsWith('preview') && (body as ElectionInput).personal?.participants[0].chartId !== fullId ? 404 : 400), '伪造快照拒绝且来源删除复筛不降级'); await denied.text(); }
  const crossSource = await request('/api/election/preview', other, 'POST', input([fullId])); check(crossSource.status === 404, '跨账号八字来源不可解析'); await crossSource.text();
  const crossOrigin = await request('/api/election/preview', token, 'POST', input([fullId]), 'https://invalid.example'); check(crossOrigin.status === 403, '异源写入拒绝'); await crossOrigin.text();
  const manifest = { username: user!.username, fullId, unknownId, dstId, plans: Object.fromEntries(Object.entries(plans).map(([name, p]) => [name, { id: p.id, url: `${baseUrl}/election/${p.id}`, date: p.input.startDate }])) };
  writeFileSync(path.join(directory, 'luck-manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync('docs/qa-evidence/2026-10-16-election-luck-http.json', JSON.stringify({ at: new Date().toISOString(), passed: true, checks, scope: '真实应用HTTP、独立账号SQLite、合成出生资料；本模块无AI请求' }, null, 2));
  console.log(JSON.stringify({ checks, passed: true, manifest }));
  runAsUser(outsider, closeDatabaseConnection);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { runAsUser(user!, closeDatabaseConnection); closeAccountConnections(); });
