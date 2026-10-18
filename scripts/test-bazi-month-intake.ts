import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Solar } from 'lunar-javascript';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { closeAccountConnections, createSession, registerUser, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { createBaziBirthProfile } from '../lib/db/bazi';
import { claimBaziReading, finishBaziReading, fingerprintBaziReading, listBaziReadings } from '../lib/db/bazi-readings';
import { calculateBazi } from '../lib/bazi/engine';
import { analyzeBaziInterpretation } from '../lib/bazi/interpretation-engine';
import { auditBaziPatternConditions } from '../lib/bazi/pattern-condition-engine';
import { buildBaziReadingChatSnapshot, buildBaziReadingFacts } from '../lib/bazi/reading-engine';
import { buildBaziMonthIntakeReview, describeBaziMonthIntakeReview } from '../lib/bazi/month-intake-engine';
import { findBaziMonthIntakeOutputViolations } from '../lib/bazi/month-intake-output';
import { BAZI_MONTH_INTAKE_POLICY, BAZI_MONTH_INTAKE_VERSION } from '../lib/bazi/month-intake-types';
import { BAZI_INTAKE_READING_PROMPT_VERSION, BAZI_READING_PROMPT_VERSION, buildBaziReadingMessages, resolveBaziReadingPromptVersion, validateBaziReadingContent } from '../lib/bazi/reading-interpretation';
import { generateBaziReading, getBaziReadingDetail } from '../lib/bazi/reading-service';
import { BAZI_READING_SECTIONS, type BaziReadingContent, type BaziReadingFacts } from '../lib/bazi/reading-types';
import type { BaziCalculationResult, BaziElement, BaziPillar } from '../lib/bazi/types';
import type { BaziStrengthCompositeResult } from '../lib/bazi/strength-composite-types';
import { GET as read, POST as generate } from '../app/api/bazi/charts/[id]/reading/route';

// 所有账号、命盘与报告只在本次临时空间，模型请求只指向本机模拟服务。
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-bazi-month-intake-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
process.env.AI_PROVIDER = 'deepseek';
process.env.DEEPSEEK_API_KEY = 'synthetic-bazi-month-intake-key';
process.env.DEEPSEEK_MODEL = 'synthetic-bazi-month-intake-model';
let checks = 0, calls = 0;
function check(value: unknown, label: string): asserts value { assert.ok(value, label); checks++; }
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); checks++; }
function rejects(work: () => unknown, label: string) { assert.throws(work, label); checks++; }
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function epoch(at: string) { return Date.parse(at.replace(' ', 'T') + 'Z'); }
function wall(at: number) { return new Date(at).toISOString().slice(0, 19).replace('T', ' '); }
function shift(at: string, seconds: number) { return wall(epoch(at) + seconds * 1000); }
function chartAt(at: string, unknownTime = false) {
  return calculateBazi({ birthDate: at.slice(0, 10), birthTime: unknownTime ? undefined : at.slice(11), gender: 'female', timeZoneId: 'Etc/GMT-8', unknownTime });
}

// 独立转录三合、三会、六合、六冲与天干五合，不复用生产规则表。
const GROUPS: Array<{ id: string; type: 'three_harmony' | 'three_meeting'; branches: [string, string, string]; element: BaziElement }> = [
  { id: 'sanhe-shen-zi-chen', type: 'three_harmony', branches: ['申', '子', '辰'], element: '水' },
  { id: 'sanhe-hai-mao-wei', type: 'three_harmony', branches: ['亥', '卯', '未'], element: '木' },
  { id: 'sanhe-yin-wu-xu', type: 'three_harmony', branches: ['寅', '午', '戌'], element: '火' },
  { id: 'sanhe-si-you-chou', type: 'three_harmony', branches: ['巳', '酉', '丑'], element: '金' },
  { id: 'sanhui-hai-zi-chou', type: 'three_meeting', branches: ['亥', '子', '丑'], element: '水' },
  { id: 'sanhui-yin-mao-chen', type: 'three_meeting', branches: ['寅', '卯', '辰'], element: '木' },
  { id: 'sanhui-si-wu-wei', type: 'three_meeting', branches: ['巳', '午', '未'], element: '火' },
  { id: 'sanhui-shen-you-xu', type: 'three_meeting', branches: ['申', '酉', '戌'], element: '金' },
];
const MAIN_QI: Record<string, string> = { 子: '癸', 丑: '己', 寅: '甲', 卯: '乙', 辰: '戊', 巳: '丙', 午: '丁', 未: '己', 申: '庚', 酉: '辛', 戌: '戊', 亥: '壬' };
const SIX: string[][] = [['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未']];
const CLASH: string[][] = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
const STEM_COMBINES: string[][] = [['甲', '己'], ['乙', '庚'], ['丙', '辛'], ['丁', '壬'], ['戊', '癸']];
const STEM_MONTH: Record<string, string> = { 甲: '寅', 乙: '卯', 丙: '巳', 丁: '午', 戊: '辰', 己: '丑', 庚: '申', 辛: '酉', 壬: '子', 癸: '亥' };
const ALL_BRANCHES = [...'子丑寅卯辰巳午未申酉戌亥'];
const termNames = ['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒', '立春'];
function termAt(year: number, name: string) {
  const terms = (Solar.fromYmdHms(year, 7, 1, 12, 0, 0).getLunar() as unknown as { getJieQiTable(): Record<string, { toYmdHms(): string }> }).getJieQiTable();
  return terms[name].toYmdHms();
}
function monthStarts(year: number) {
  return termNames.map((name, index) => termAt(index >= 11 ? year + 1 : year, name));
}
function factsFor(chart: BaziCalculationResult) {
  const interpretation = analyzeBaziInterpretation(chart);
  const staticContext = { methodologyVersion: 'unit-static-context', engineVersion: 'unit-static-context', staticBaseline: interpretation.strength } as unknown as BaziStrengthCompositeResult;
  return buildBaziReadingFacts(chart, interpretation, auditBaziPatternConditions(chart, interpretation, staticContext), 'synthetic-month-intake');
}
function contentFor(facts: BaziReadingFacts): BaziReadingContent {
  const pick = (prefix: string) => facts.evidence.find(item => item.id.startsWith(prefix))?.id;
  return {
    summary: '合成月令取用入口复核摘要，并列本气、他藏、透干与会支，保留缺字、六合与相克条件，不裁去留与最终喜忌。',
    sections: (Object.keys(BAZI_READING_SECTIONS) as Array<keyof typeof BAZI_READING_SECTIONS>).map((key, index) => {
      let evidenceIds: string[] = [];
      if (key === 'action') evidenceIds = ['chart:policy'];
      else if (key === 'strength') evidenceIds = [pick('strength:month-command:') ?? pick('strength:')!];
      else if (key === 'pattern') evidenceIds = [pick('pattern:month-command:'), facts.monthIntake ? pick('pattern:month-intake:') : undefined].filter((id): id is string => Boolean(id));
      else evidenceIds = [pick(`${key}:`)!];
      return { key, content: `第${index + 1}节${key}合成解释：本气、透干与会支入口并列保留，缺字、六合与相克只作条件，不据此裁去留、合化或最终喜忌。`, evidenceIds };
    }),
  };
}
function withoutIntake(facts: BaziReadingFacts): BaziReadingFacts {
  const { monthIntake: _removed, ...rest } = facts;
  return { ...rest, evidence: facts.evidence.filter(item => !item.id.includes(':month-intake:')) };
}
function request(id: string, token?: string, body?: unknown) {
  return new Request(`http://local/api/bazi/charts/${id}/reading`, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function responseBody(response: Response, status: number, label: string) { equal(response.status, status, label); return response.json(); }
function setBranch(chart: BaziCalculationResult, key: 'year' | 'day' | 'time', branch: string) {
  const pillar = chart.pillars[key];
  if (!pillar) throw new Error('合成夹具缺少柱');
  pillar.branch = branch; pillar.ganZhi = `${pillar.stem}${branch}`;
}
function setStem(chart: BaziCalculationResult, key: 'year' | 'month', stem: string) {
  const pillar = chart.pillars[key];
  pillar.stem = stem; pillar.ganZhi = `${stem}${pillar.branch}`;
}

const received: BaziReadingFacts[] = [];
const server = createServer(async (request_, response) => {
  calls++; let raw = ''; for await (const chunk of request_) raw += chunk;
  const messages = JSON.parse(raw).messages as Array<{ content: string }>;
  const facts = JSON.parse(messages.at(-1)!.content) as BaziReadingFacts; received.push(facts);
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(contentFor(facts)) } }], usage: { prompt_tokens: 50, completion_tokens: 70 } }));
});

async function main() {
  const users: Awaited<ReturnType<typeof registerUser>>[] = [];
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('本机模拟端口不存在');
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}`;
  try {
    equal(BAZI_MONTH_INTAKE_POLICY, 'ziping-zhenquan-useful-god-change-narrow', '只采用子平真诠窄条目口径');
    check(BAZI_INTAKE_READING_PROMPT_VERSION.startsWith('bazi-reading-report-v6-'), '入口层有独立第六代报告策略');

    // 十二节月 × 十日主：真实历法盘，逐项独立核对本气、透干、会支、缺字与六合。
    const starts = monthStarts(2026), baseByBranch: Record<string, BaziCalculationResult> = {};
    let realCharts = 0;
    for (let month = 0; month < 12; month++) {
      for (let day = 12; day < 22; day++) {
        const chart = chartAt(shift(starts[month], day * 86400));
        const branch = chart.pillars.month.branch;
        if (!baseByBranch[branch]) baseByBranch[branch] = copy(chart);
        const before = JSON.stringify(chart), review = buildBaziMonthIntakeReview(chart);
        realCharts++;
        equal([review.version, review.policy, review.monthBranch, review.status], [BAZI_MONTH_INTAKE_VERSION, BAZI_MONTH_INTAKE_POLICY, branch, 'complete'], '真实月支的版本、口径与完整状态一致');
        equal(JSON.stringify(chart), before, '入口复核不改变四柱、藏干或排盘输入');
        equal(buildBaziMonthIntakeReview(chart), review, '相同输入确定，不读取当前时间');
        const hidden = chart.pillars.month.hiddenStems, mainQi = MAIN_QI[branch];
        equal(review.monthMainQiStem, mainQi, '本气识别与独立藏干表一致');
        equal(review.routes.map(route => [route.stem, route.element]), hidden.map(item => [item.stem, item.element]), '全部已保存月藏逐干保留，不筛掉他藏');
        for (const [index, route] of review.routes.entries()) {
          const expectedQi = hidden[index].stem === mainQi ? 'main_qi' : index === 1 ? 'secondary_qi' : 'residual_qi';
          const positions = [chart.pillars.year, chart.pillars.month, chart.pillars.time].filter((pillar): pillar is BaziPillar => pillar !== null).filter(pillar => pillar.stem === route.stem).map(pillar => `${pillar.label}${pillar.stem}`);
          equal([route.sourceQi, route.positions, route.tenGod, route.dayMasterSameStem], [expectedQi, positions, hidden[index].tenGod, chart.dayMaster.stem === route.stem], '藏干次序、透出位置、十神与日干参照逐项一致');
          equal(route.transparency, positions.length === 0 ? 'not_transparent' : positions.length === 1 ? 'single_transparent' : 'multiple_transparent', '单透、多透与未透按实际位置计数');
          equal(route.entry, route.sourceQi === 'main_qi' ? 'main_qi_entry' : positions.length ? 'transparency_entry' : 'hidden_candidate', '本气、透干与他藏候选分流不排名');
          equal(route.evidenceId, `pattern:month-intake:route:${route.id}`, '每条入口有独立可引用依据ID');
        }
        const branchSet = new Set([chart.pillars.year, chart.pillars.month, chart.pillars.day, chart.pillars.time].filter(Boolean).map(pillar => pillar!.branch));
        const expectedMeetings = GROUPS.filter(group => group.branches.includes(branch) && group.branches.every(item => branchSet.has(item)));
        const expectedIncomplete = GROUPS.filter(group => group.branches.includes(branch) && group.branches.filter(item => branchSet.has(item)).length === 2);
        equal(review.meetings.map(item => item.id), expectedMeetings.map(item => item.id), '完整会支仅在含月支且三支齐见时成立');
        equal(review.incompleteMeetings.map(item => item.id), expectedIncomplete.map(item => item.id), '缺字组合单列，不升级为入口');
        equal(review.meetings.every(item => item.complete && item.entry && item.targetElement === GROUPS.find(group => group.id === item.id)!.element && item.conclusion === 'target_element_only_not_transformed'), true, '会支只到五行且不称已化');
        equal(review.sixCombines.map(item => item.branches), SIX.filter(pair => pair.includes(branch) && branchSet.has(pair[0] === branch ? pair[1] : pair[0])).map(pair => [...pair]), '六合单列，不并入三合三会');
        equal(review.obstructions.filter(item => item.kind === 'month_branch_clash').length, CLASH.filter(pair => pair.includes(branch) && branchSet.has(pair[0] === branch ? pair[1] : pair[0])).length, '月支六冲按实际并见记录');
        equal([review.counts.hiddenRoutes, review.counts.completeMeetings, review.counts.incompleteMeetings, review.counts.sixCombines], [hidden.length, expectedMeetings.length, expectedIncomplete.length, review.sixCombines.length], '统计与实际数组一致，不按条数计分');
        check(review.boundaries.length >= 6 && describeBaziMonthIntakeReview(review).includes(review.policyLabel) && describeBaziMonthIntakeReview(review).includes(BAZI_MONTH_INTAKE_VERSION), '来源口径与边界进入同源描述');
      }
    }
    equal(realCharts, 120, '十二节月×十日主均为真实历法盘');
    equal(Object.keys(baseByBranch).length, 12, '真实盘覆盖十二个月支');

    // 合成结构矩阵：完整会支、缺字、六合、六冲、天干五合、五行相克。
    for (const group of GROUPS) {
      const monthBranch = group.branches.find(branch => baseByBranch[branch])!;
      const others = group.branches.filter(branch => branch !== monthBranch);
      const neutrals = ALL_BRANCHES.filter(branch => branch !== monthBranch && !GROUPS.some(item => item.branches.includes(monthBranch) && item.branches.includes(branch)));
      const complete = copy(baseByBranch[monthBranch]);
      setBranch(complete, 'year', others[0]); setBranch(complete, 'day', others[1]); setBranch(complete, 'time', neutrals[0]);
      const completeReview = buildBaziMonthIntakeReview(complete);
      equal(completeReview.meetings.map(item => item.id), [group.id], '含月支完整组逐组建立唯一会支入口');
      equal(completeReview.incompleteMeetings.length, 0, '完整组不再另记为缺字');
      equal(completeReview.meetings[0].targetElement, group.element, '会支目标五行独立核对');

      const incomplete = copy(baseByBranch[monthBranch]);
      setBranch(incomplete, 'year', others[0]); setBranch(incomplete, 'day', neutrals[0]); setBranch(incomplete, 'time', neutrals[1]);
      const incompleteReview = buildBaziMonthIntakeReview(incomplete);
      const partial = incompleteReview.incompleteMeetings.find(item => item.id === group.id)!;
      check(partial && !partial.complete && !partial.entry && partial.missingBranches.length === 1 && partial.missingBranches[0] === others[1], '缺一支只作缺字条件，不装成完整会支');
      equal(incompleteReview.meetings.some(item => item.id === group.id), false, '缺字组不进入会支入口集合');
    }
    for (const pair of SIX) {
      const monthBranch = pair[0], partner = pair[1], neutrals = ALL_BRANCHES.filter(branch => branch !== monthBranch && branch !== partner);
      const chart = copy(baseByBranch[monthBranch]);
      setBranch(chart, 'year', partner); setBranch(chart, 'day', neutrals[0]); setBranch(chart, 'time', neutrals[1]);
      const review = buildBaziMonthIntakeReview(chart);
      check(review.sixCombines.some(item => item.branches.includes(monthBranch) && item.branches.includes(partner)) && review.meetings.every(item => !item.branches.every(branch => [monthBranch, partner].some(value => value === branch))), '六合与三合三会分开记录，不互相冒充');
    }
    for (const pair of CLASH) {
      const monthBranch = pair[0], partner = pair[1], neutrals = ALL_BRANCHES.filter(branch => branch !== monthBranch && branch !== partner);
      const chart = copy(baseByBranch[monthBranch]);
      setBranch(chart, 'year', partner); setBranch(chart, 'day', neutrals[0]); setBranch(chart, 'time', neutrals[1]);
      const review = buildBaziMonthIntakeReview(chart);
      const clash = review.obstructions.find(item => item.kind === 'month_branch_clash');
      check(clash && clash.label.includes(monthBranch) && clash.label.includes(partner) && clash.status === 'condition_pending', '月支六冲只作待核条件，不裁解冲或去留');
    }
    for (const [left, right] of STEM_COMBINES) {
      const chart = copy(baseByBranch[STEM_MONTH[left]]);
      setStem(chart, 'year', left); setStem(chart, 'month', right);
      const review = buildBaziMonthIntakeReview(chart), route = review.routes.find(item => item.stem === left)!;
      const combine = review.obstructions.find(item => item.kind === 'surface_stem_combine' && item.relatedRouteIds.includes(route.id));
      check(route.positions.includes(`年柱${left}`) && combine && combine.detail.includes('不裁合去'), '天干五合与透干入口并见时只作条件，不裁合去或合化');
    }
    {
      const chart = copy(baseByBranch['辰']);
      setBranch(chart, 'year', '申'); setBranch(chart, 'day', '子'); setBranch(chart, 'time', '巳');
      const review = buildBaziMonthIntakeReview(chart);
      const opposition = review.obstructions.find(item => item.kind === 'element_opposition');
      check(review.meetings.some(item => item.id === 'sanhe-shen-zi-chen') && opposition && opposition.relatedMeetingIds.includes('sanhe-shen-zi-chen') && opposition.detail.includes('未裁优先级'), '会支与本气五行相克只并列待核，不裁去留');
    }
    {
      const chart = chartAt('2026-02-20 12:00:00', true), before = JSON.stringify(chart), review = buildBaziMonthIntakeReview(chart);
      equal(review.status, 'partial_unknown_time', '缺时柱入口层降级');
      check(review.routes.every(route => route.tenGod === null) && review.monthHiddenStems.every(item => item.tenGod === null), '缺时不输出全日唯一十神');
      check(review.routes.every(route => route.positions.every(item => !item.startsWith('时柱'))), '缺时没有虚构时柱透出位置');
      check(describeBaziMonthIntakeReview(review).includes('缺时柱'), '缺时状态进入同源描述');
      equal(JSON.stringify(chart), before, '缺时降级不改写保存命盘');
    }

    // 输出边界：明确否定与待核放行，越权结论拦截。
    for (const text of ['三合已经合化成功。', '缺字组合视为完整三合。', '六合等同于三合。', '按入口数量排名取唯一用神。', '本气入口因此可判身强。', '会支取甲木为用。']) check(findBaziMonthIntakeOutputViolations(text).length > 0, `越权入口结论被拦截：${text}`);
    for (const text of ['三合结构出现不等于已经合化，仍待核。', '缺字组合不能视为完整三合。', '六合不等同三合，仍单列。', '本气未透仍保留本气入口，不能据此判身强身弱。', '会支只指向五行，不指定阴阳天干。']) equal(findBaziMonthIntakeOutputViolations(text), [], `否定与待核表达放行：${text}`);

    const userA = await registerUser({ username: `mi-a-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '入口合成甲' }); users.push(userA);
    const userB = await registerUser({ username: `mi-b-${randomUUID().slice(0, 8)}`, password: randomUUID(), displayName: '入口合成乙' }); users.push(userB);
    const tokenA = createSession(userA.id), tokenB = createSession(userB.id); let chartId = '';
    await runAsUser(userA, async () => {
      const profile = createBaziBirthProfile({ displayName: '月令入口合成资料', birthDate: '2026-02-20', birthTime: '12:00', gender: 'female', timeZoneId: 'Etc/GMT-8', initialChart: { timeStandard: 'civil_time', lateZiPolicy: 'next_day' } });
      chartId = profile.charts[0].id;
      const facts = getBaziReadingDetail(chartId).facts;
      equal(facts.monthIntake!.version, BAZI_MONTH_INTAKE_VERSION, '入口层进入完整服务端事实');
      equal(new Set(facts.evidence.map(item => item.id)).size, facts.evidence.length, '入口依据与原依据ID无冲突');
      check(facts.evidence.some(item => item.id === 'pattern:month-intake:overview') && facts.evidence.filter(item => item.id.startsWith('pattern:month-intake:')).every(item => item.family === 'pattern'), '入口依据统一进入格局方法族');
      equal(resolveBaziReadingPromptVersion(facts), BAZI_INTAKE_READING_PROMPT_VERSION, '已支持入口层精确选择第六代能力');
      equal(JSON.parse(buildBaziReadingMessages(facts)[1].content).monthIntake, facts.monthIntake, '报告输入只取保存的同版入口事实');
      const valid = contentFor(facts);
      equal(validateBaziReadingContent(JSON.stringify(valid), facts).sections.length, 5, '五章合法内容满足司令与入口两个引用门槛');
      const pattern = copy(valid); pattern.sections.find(item => item.key === 'pattern')!.evidenceIds = [facts.evidence.find(item => item.id.startsWith('pattern:month-command:'))!.id];
      rejects(() => validateBaziReadingContent(JSON.stringify(pattern), facts), '新报告格局章必须引用入口依据');
      const intakeOnly = copy(valid); intakeOnly.sections.find(item => item.key === 'pattern')!.evidenceIds = [facts.evidence.find(item => item.id.startsWith('pattern:month-intake:'))!.id];
      rejects(() => validateBaziReadingContent(JSON.stringify(intakeOnly), facts), '入口依据不能替代司令依据');
      for (const text of ['三合已经合化成功。', '按入口数量排名取唯一用神。', '缺字组合视为完整三合。']) rejects(() => validateBaziReadingContent(JSON.stringify({ ...valid, summary: text }), facts), 'Markdown或摘要不能绕过入口越权门控');
      validateBaziReadingContent(JSON.stringify({ ...valid, summary: '三合结构出现不等于已经合化，缺字与六合仍单列待核。' }), facts); checks++;

      const v5 = withoutIntake(facts);
      equal(resolveBaziReadingPromptVersion(v5), BAZI_READING_PROMPT_VERSION, '缺少入口层时仍按第五代司令能力解释');
      const v5Messages = JSON.parse(buildBaziReadingMessages(v5)[1].content) as BaziReadingFacts;
      check(!v5Messages.monthIntake && v5Messages.evidence.every(item => !item.id.includes(':month-intake:')), '第五代载荷撤回入口层及其依据');
      validateBaziReadingContent(JSON.stringify(contentFor(v5)), v5); checks++;
      const future = copy(facts); future.monthIntake!.version = 'future-unsupported'; const futureRaw = JSON.stringify(future);
      equal(resolveBaziReadingPromptVersion(future), BAZI_READING_PROMPT_VERSION, '未知入口版本只降至第五代');
      const futureMessages = JSON.parse(buildBaziReadingMessages(future)[1].content) as BaziReadingFacts;
      check(!futureMessages.monthIntake && futureMessages.evidence.every(item => !item.id.includes(':month-intake:')), '未知入口层及其依据同步撤回');
      rejects(() => validateBaziReadingContent(JSON.stringify(valid), future), '未知入口层不能借已撤回依据通过');
      validateBaziReadingContent(JSON.stringify(contentFor(futureMessages)), future); checks++;
      equal(JSON.stringify(future), futureRaw, '消息过滤与校验不修改保存原文');
      const noCommand = copy(facts); noCommand.monthCommandReview!.version = 'future-unsupported'; const noCommandRaw = JSON.stringify(noCommand);
      equal(resolveBaziReadingPromptVersion(noCommand), 'bazi-reading-report-v4-method-premises', '司令未知时入口层不能单独冒充更高中代能力');
      const noCommandMessages = JSON.parse(buildBaziReadingMessages(noCommand)[1].content) as BaziReadingFacts;
      check(!noCommandMessages.monthCommandReview && !noCommandMessages.monthIntake, '司令未知时两层同时撤回');
      equal(JSON.stringify(noCommand), noCommandRaw, '撤回操作不修改保存原文');

      check(buildBaziReadingChatSnapshot(facts.chart, '请核对月令取用入口的透干与会支', { interpretation: facts.interpretation, patterns: facts.patterns }).includes('【月令取用入口复核】'), '入口问题带入同源入口描述');
      check(!buildBaziReadingChatSnapshot(facts.chart, '解释2026年的流月十神', { interpretation: facts.interpretation, patterns: facts.patterns }).includes('【月令取用入口复核】'), '纯岁运问题不强塞入口层');
      equal(fingerprintBaziReading(facts), fingerprintBaziReading(getBaziReadingDetail(chartId).facts), '反复预览不引入当前时间与随机指纹');
      const changed = copy(facts); changed.monthIntake!.detail += '（合成变更）';
      check(fingerprintBaziReading(changed) !== fingerprintBaziReading(facts), '入口层变化进入完整事实指纹');

      const generated = await generateBaziReading(chartId), current = generated.versions[0];
      equal(current.status, 'completed', '入口层报告完成并固定保存');
      equal((getDatabase().prepare('SELECT prompt_version FROM bazi_reading_versions WHERE id=?').get(current.id) as { prompt_version: string }).prompt_version, BAZI_INTAKE_READING_PROMPT_VERSION, '新版本记录真实第六代提示策略');
      check(current.content!.sections.find(item => item.key === 'pattern')!.evidenceIds.some(id => id.startsWith('pattern:month-intake:')), '新报告格局章引用实际入口依据');
      const once = calls; await generateBaziReading(chartId); equal(calls, once, '入口层仍保持报告缓存幂等');

      const old = withoutIntake(copy(facts)); old.methodologyVersion = 'bazi-reading-v5-month-command-review';
      const claimed = claimBaziReading({ chartId, facts: old, regenerate: true, provider: 'synthetic-local', model: '第五代合成', promptVersion: BAZI_READING_PROMPT_VERSION });
      check(claimed.requestId && finishBaziReading(claimed.version.id, claimed.requestId, contentFor(old), 0, 0), '第五代旧报告可完整保存');
      const detail = getBaziReadingDetail(chartId), oldVersion = detail.versions.find(item => item.id === claimed.version.id)!;
      check(oldVersion.facts.monthIntake === undefined && oldVersion.facts.evidence.every(item => !item.id.includes(':month-intake:')), '旧报告不补算入口层');
      check(Boolean(detail.facts.monthIntake) && detail.activeVersionId !== oldVersion.id, '当前事实与旧报告分别保留，不被旧版覆盖');
      closeDatabaseConnection();
      equal(getBaziReadingDetail(chartId).versions.find(item => item.id === claimed.version.id)!.facts.monthIntake, undefined, '重开连接不补写旧报告');
      equal(listBaziReadings(chartId).length, 2, '新旧两代报告共存');
    });
    const context = { params: Promise.resolve({ id: chartId }) };
    for (const [token, status] of [[undefined, 401], [tokenB, 404], [tokenA, 200]] as const) {
      const response = await read(request(chartId, token), context);
      check(/no-store/.test(response.headers.get('cache-control') ?? ''), '入口层读取与拒绝响应禁止共享缓存');
      const body = await responseBody(response, status, '新旧报告遵守当前账号隔离');
      if (status !== 200) check(!JSON.stringify(body).includes(BAZI_MONTH_INTAKE_VERSION), '拒绝响应不泄漏入口快照');
    }
    await responseBody(await generate(request(chartId, tokenB, { regenerate: true }), context), 404, '另一账号不能生成本命报告');
    const forged = await responseBody(await generate(request(chartId, tokenA, { regenerate: true, userId: userB.id, facts: { monthIntake: { version: 'FORGED' } } }), context), 200, '客户端事实不能覆盖服务器生成');
    check(forged.detail.facts.monthIntake.version === BAZI_MONTH_INTAKE_VERSION && !JSON.stringify(forged).includes('FORGED'), '报告只从当前账号保存命盘计算，伪造入口层不进入快照');
    const foreign = await middleware(new NextRequest(`http://127.0.0.1:30001/api/bazi/charts/${chartId}/reading`, { method: 'POST', headers: { host: '127.0.0.1:30001', origin: 'http://untrusted.invalid', 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }, body: JSON.stringify({ regenerate: true }) }));
    equal(foreign.status, 403, '异源入口层写入在中间件拒绝'); await foreign.json();
    equal(received.length, calls, '本机模拟请求计数与实际接收一致');
    console.log(`八字月令取用入口专项通过：${checks}项；120真实月支日主、本气/他藏/单透/多透分流、八组完整会支与缺字、六合六冲天干五合五行相克条件、缺时降级、输出边界、六代报告引用撤回与账号防伪；本机模拟供应商${calls}次，真实供应商0次。`);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    for (const user of users) runAsUser(user, closeDatabaseConnection);
    closeAccountConnections();
    const absolute = path.resolve(directory), temporary = path.resolve(tmpdir());
    if (path.dirname(absolute) !== temporary || !path.basename(absolute).startsWith('guanchen-bazi-month-intake-')) throw new Error('临时测试清理路径超出预期范围');
    rmSync(absolute, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
