import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { closeAccountConnections, createSession, getUserByUsername, registerUser, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { createBaziBirthProfile } from '../lib/db/bazi';
import { closeDatabaseConnection } from '../lib/db/client';
import { getBaziReadingDetail } from '../lib/bazi/reading-service';
import { claimBaziReading, finishBaziReading } from '../lib/db/bazi-readings';
import { calculateBazi } from '../lib/bazi/engine';
import { analyzeBaziInterpretation } from '../lib/bazi/interpretation-engine';
import { BAZI_READING_SECTIONS, type BaziReadingFacts } from '../lib/bazi/reading-types';

const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('仅允许隔离的临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
const user = getUserByUsername(process.env.GUANCHEN_QA_USERNAME || '');
if (!user || !user.username.startsWith('method-qa-')) throw new Error('仅允许已创建的分方法验收账号');
const baseUrl = 'http://127.0.0.1:30002', token = createSession(user.id);
let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
const cases: Array<{ label: string; chartId: string; url: string; birthDate: string; patternCount: number; paths: string[]; unknown: boolean }> = [];
function add(label: string, birthDate: string, unknown = false, legacy = false) {
  return runAsUser(user!, () => {
    const profile = createBaziBirthProfile({ displayName: `合成验收·${label}`, birthDate, birthTime: unknown ? undefined : '09:30', unknownTime: unknown, gender: 'female', initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'next_day' } });
    const chartId = profile.charts[0].id, detail = getBaziReadingDetail(chartId);
    if (legacy) {
      const old: BaziReadingFacts = { ...detail.facts, methodologyVersion: 'bazi-reading-v3-natal-period-contact-review', methodReview: undefined, evidence: detail.facts.evidence.filter(e => !e.id.includes(':method-') && !e.id.startsWith('pattern:method:')) };
      const claim = claimBaziReading({ chartId, facts: old, regenerate: false, provider: 'synthetic', model: '旧版合成报告', promptVersion: 'bazi-reading-report-v3-natal-period-contact' });
      check(finishBaziReading(claim.version.id, claim.requestId!, { summary: '上一版原局作用复核合成报告，用于核对新版方法上线后旧快照仍保持原样。', sections: Object.keys(BAZI_READING_SECTIONS).map(key => ({ key: key as keyof typeof BAZI_READING_SECTIONS, content: `${key}旧版合成解释，仅依据生成时保存的原局规则，不应补写本轮分方法复核结果。`, evidenceIds: [key === 'action' ? 'chart:policy' : old.evidence.find(e => e.id.startsWith(key + ':'))!.id] })) }, 1, 1), 'v3旧版准备完成');
    }
    const item = { label, chartId, url: `${baseUrl}/bazi/reading/${chartId}`, birthDate, patternCount: detail.facts.methodReview!.patterns.length, paths: detail.facts.methodReview!.patterns.map(p => p.archetype), unknown };
    cases.push(item); return item;
  });
}
async function main() {
  add('杂气多候选', '1992-10-11', false, true);
  const targets = new Set(['建禄', '月劫', '阳刃']);
  for (let month = 1; month <= 12 && targets.size; month++) for (let day = 8; day <= 27 && targets.size; day++) {
    const birthDate = `2001-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const chart = calculateBazi({ birthDate, birthTime: '09:30', gender: 'female' }), analysis = analyzeBaziInterpretation(chart);
    const peer = analysis.pattern.candidates.find(p => ['比肩', '劫财'].includes(p.tenGod));
    if (!peer) continue;
    const blades: Record<string, string> = { 甲: '卯', 丙: '午', 戊: '午', 庚: '酉', 壬: '子' };
    const label = peer.tenGod === '比肩' ? '建禄' : blades[chart.dayMaster.stem] === chart.pillars.month.branch ? '阳刃' : '月劫';
    if (targets.delete(label)) add(label, birthDate);
  }
  add('冬月调候', '1992-12-18'); add('夏月调候', '1992-07-09'); add('未知时辰', '1992-10-11', true);
  check(cases.length === 7 && cases[0].patternCount > 1, '七类真实历法合成页面就绪');
  const outsider = await registerUser({ username: `method-qa-other-${Date.now().toString(36)}`, password: randomUUID(), displayName: '隔离验收乙' }), otherToken = createSession(outsider.id);
  const request = (url: string, auth?: string, method = 'GET', body?: unknown, origin = baseUrl) => fetch(baseUrl + url, { method, headers: { ...(auth ? { cookie: `${SESSION_COOKIE}=${auth}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json', origin }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  for (const c of cases) {
    const response = await request(`/api/bazi/charts/${c.chartId}/reading`, token), data = await response.json();
    check(response.status === 200 && data.detail.facts.methodReview?.patterns.length === c.patternCount, '持久化资料按新版完整复核');
    check(data.detail.facts.methodReview.flow.length === 5 && data.detail.facts.methodReview.unknownTime === c.unknown, '桥接与缺时状态一致');
    for (const auth of [undefined, otherToken]) {
      const denied = await request(`/api/bazi/charts/${c.chartId}/reading`, auth); check(denied.status === (auth ? 404 : 401), '匿名及跨账号拒绝读取'); await denied.text();
    }
  }
  const first = cases[0], endpoint = `/api/bazi/charts/${first.chartId}/reading`;
  const before = await (await request(endpoint, token)).json(), legacy = JSON.stringify(before.detail.versions[0]);
  const generated = await request(endpoint, token, 'POST', { regenerate: true }), payload = await generated.json();
  check(generated.status === 200 && payload.detail.versions[0].facts.methodReview && payload.detail.versions[0].content.sections.some((s: { evidenceIds: string[]; content: string }) => s.evidenceIds.includes('useful:method-balancing') && s.content.includes('分方法复核：保留2条')), '报告生成消费方法数据并保存新方法快照和可引用依据');
  check(JSON.stringify(payload.detail.versions.find((v: { version: number }) => v.version === 1)) === legacy, 'v3旧快照未补写');
  for (const [auth, origin, status] of [[undefined, baseUrl, 401], [otherToken, baseUrl, 404], [token, 'https://invalid.example', 403]] as const) {
    const denied = await request(endpoint, auth, 'POST', { regenerate: true }, origin); check(denied.status === status, '读写所有权和异源写入拦截'); await denied.text();
  }
  writeFileSync(path.join(directory, 'method-manifest.json'), JSON.stringify({ appUrl: baseUrl, username: user!.username, cases }, null, 2));
  writeFileSync(path.join(process.cwd(), 'docs/qa-evidence/2026-10-16-bazi-method-http.json'), JSON.stringify({ at: new Date().toISOString(), checks, passed: true, cases: cases.map(c => ({ label: c.label, patternCount: c.patternCount, paths: c.paths, unknown: c.unknown })), scope: '真实应用与隔离账号SQLite；供应商为本机合成响应，不证明外部模型质量' }, null, 2));
  console.log(JSON.stringify({ checks, passed: true, manifest: path.join(directory, 'method-manifest.json'), cases }));
  runAsUser(outsider, closeDatabaseConnection);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { runAsUser(user!, closeDatabaseConnection); closeAccountConnections(); });
