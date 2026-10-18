import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Solar } from 'lunar-javascript';
import { getUserByUsername, createSession, closeAccountConnections, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { createBaziBirthProfile } from '../lib/db/bazi';
import { closeDatabaseConnection } from '../lib/db/client';
import { calculateBazi } from '../lib/bazi/engine';
import { getBaziReadingDetail } from '../lib/bazi/reading-service';
import { claimBaziReading, finishBaziReading } from '../lib/db/bazi-readings';
import { BAZI_READING_SECTIONS, type BaziReadingFacts } from '../lib/bazi/reading-types';

const directory = path.resolve(process.env.GUANCHEN_QA_DIRECTORY || '');
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) throw new Error('仅允许独立临时验收目录');
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'test.sqlite');
const user = getUserByUsername(process.env.GUANCHEN_QA_USERNAME || '');
if (!user || !user.username.startsWith('natal-qa-')) throw new Error('仅允许已创建的原局验收账号');
const token = createSession(user.id), baseUrl = 'http://127.0.0.1:30002';
const cases: Array<{ label: string; chartId: string; url: string; birthDate: string; period: string; nearCompeting: boolean }> = [];
let checks = 0;
function check(v: unknown, label: string) { assert.ok(v, label); checks++; }
function dayList(from: string, until: string) {
  const result: string[] = [];
  for (let d = Date.parse(from + 'T12:00:00Z'); d < Date.parse(until + 'T12:00:00Z'); d += 86400000) result.push(new Date(d).toISOString().slice(0, 10));
  return result;
}
function findDate(from: string, until: string, stem: string) {
  const date = dayList(from, until).find(birthDate => calculateBazi({ birthDate, birthTime: '09:30', gender: 'female' }).dayMaster.stem === stem);
  if (!date) throw new Error('未找到对应合成示例日期');
  return date;
}
function add(label: string, birthDate: string, unknownTime = false, legacy = false) {
  return runAsUser(user!, () => {
    const profile = createBaziBirthProfile({ displayName: '合成验收·' + label, birthDate, birthTime: '09:30', gender: 'female', unknownTime, initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'next_day' } });
    const chartId = profile.charts[0].id, facts = getBaziReadingDetail(chartId).facts;
    if (legacy) {
      const old: BaziReadingFacts = { ...facts, methodologyVersion: 'bazi-reading-v2-monthly-conditional-review', natalReview: undefined, evidence: facts.evidence.filter(e => !e.id.includes(':natal-')) };
      const claim = claimBaziReading({ chartId, facts: old, regenerate: false, provider: 'synthetic', model: '旧版合成报告', promptVersion: 'bazi-reading-report-v2-monthly-conditions' });
      check(finishBaziReading(claim.version.id, claim.requestId!, { summary: '旧规则合成报告，用于核对本次升级后原有报告仍按原快照保存。', sections: Object.keys(BAZI_READING_SECTIONS).map(key => ({ key: key as keyof typeof BAZI_READING_SECTIONS, content: `${key}旧版合成说明，保留原有透藏与章节依据，不应补写本次新增原局复核。`, evidenceIds: [key === 'action' ? 'chart:policy' : old.evidence.find(e => e.id.startsWith(key + ':'))!.id] })) }, 1, 1), '旧版报告准备');
    }
    const item = { label, chartId, url: baseUrl + '/bazi/reading/' + chartId, birthDate, period: facts.natalReview!.period.status, nearCompeting: facts.natalReview!.combinations.some(c => c.status === 'adjacent_competing') };
    cases.push(item); return item;
  });
}
async function main() {
  add('秋分前', findDate('2026-09-08', '2026-09-22', '乙'), false, true);
  add('秋分后', findDate('2026-09-24', '2026-10-07', '乙'));
  add('谷雨前', findDate('2026-04-06', '2026-04-19', '癸'));
  add('谷雨后', findDate('2026-04-21', '2026-05-05', '癸'));
  add('半月口径待核', findDate('2026-06-07', '2026-07-06', '乙'));
  add('近邻争合', findDate('2014-05-07', '2014-06-05', '甲'));
  add('藏根受冲', findDate('2016-02-06', '2016-03-04', '甲'));
  for (let year = 2000; year < 2035; year++) {
    const at = (Solar.fromYmdHms(year, 7, 1, 12, 0, 0).getLunar() as unknown as { getJieQiTable(): Record<string, { toYmdHms(): string }> }).getJieQiTable()['秋分'].toYmdHms();
    if (calculateBazi({ birthDate: at.slice(0, 10), gender: 'female', unknownTime: true }).dayMaster.stem === '乙') { add('交界日未知时辰', at.slice(0, 10), true); break; }
  }
  check(cases.length === 8 && cases.find(c => c.label === '近邻争合')?.nearCompeting, '八类页面验收示例准备');
  const request = async (url: string, authenticated: boolean, method = 'GET', body?: unknown) => fetch(baseUrl + url, { method, headers: { ...(authenticated ? { cookie: SESSION_COOKIE + '=' + token } : {}), ...(body ? { 'content-type': 'application/json', origin: baseUrl } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const c of cases) {
    const r = await request('/api/bazi/charts/' + c.chartId + '/reading', true), data = await r.json();
    check(r.status === 200 && data.detail.facts.natalReview.period.status === c.period, 'HTTP复核同源');
    check(/private/.test(r.headers.get('cache-control') || '') && /no-store/.test(r.headers.get('cache-control') || ''), '复核响应不公开缓存');
    check((await request('/api/bazi/charts/' + c.chartId + '/reading', false)).status === 401, '匿名不可读');
  }
  const target = cases[0], endpoint = '/api/bazi/charts/' + target.chartId + '/reading';
  const spoof = await request(endpoint, true, 'POST', { regenerate: false, facts: { natalReview: { period: { status: '伪造分支' } } }, natalReview: { version: '伪造规则' } });
  const generated = await spoof.json();
  check(spoof.status === 200 && generated.detail.versions[0].facts.natalReview.version !== '伪造规则', '客户端伪造事实不能覆盖服务端复核');
  check(generated.detail.versions.length === 2 && !generated.detail.versions[1].facts.natalReview, '升级新报告保留旧版且旧快照不补写');
  check(generated.detail.versions[0].content.sections.find((s: {key: string}) => s.key === 'climate').evidenceIds.includes('climate:natal-period'), '实际生成报告引用新分支依据');
  const cached = await (await request(endpoint, true, 'POST', { regenerate: false })).json();
  check(cached.detail.versions.length === 2, '相同规则非重生复用保存版本');
  const blocked = await fetch(baseUrl + endpoint, { method: 'POST', headers: { cookie: SESSION_COOKIE + '=' + token, 'content-type': 'application/json', origin: 'http://external.invalid' }, body: JSON.stringify({ regenerate: true }) });
  check(blocked.status === 403, '异源写入拒绝');
  const result = { environment: '临时账号和独立SQLite，模型为本机模拟服务', checks, cases };
  writeFileSync(path.join(directory, 'natal-manifest.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { runAsUser(user!, closeDatabaseConnection); closeAccountConnections(); });
