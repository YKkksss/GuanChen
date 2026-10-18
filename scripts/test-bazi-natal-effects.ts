import assert from 'node:assert/strict';
import { Solar } from 'lunar-javascript';
import { calculateBazi } from '../lib/bazi/engine';
import { buildBaziNatalEffectReview, reviewBaziNatalPeriod } from '../lib/bazi/natal-effect-engine';
import { analyzeBaziClimate, buildBaziReadingChatSnapshot, buildBaziReadingFacts } from '../lib/bazi/reading-engine';
import { analyzeBaziInterpretation } from '../lib/bazi/interpretation-engine';
import { BAZI_NATAL_EFFECT_VERSION } from '../lib/bazi/natal-effect-rules';
import { findBaziNatalOutputViolations } from '../lib/bazi/natal-effect-output';
import { buildBaziReadingMessages, validateBaziReadingContent } from '../lib/bazi/reading-interpretation';
import { BAZI_READING_SECTIONS, type BaziReadingContent } from '../lib/bazi/reading-types';
import { fingerprintBaziReading } from '../lib/db/bazi-readings';
import type { BaziCalculationResult, BaziElement } from '../lib/bazi/types';

let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks++; }
const elements: Record<string, BaziElement> = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const hidden: Record<string, string> = { 子: '癸', 丑: '己癸辛', 寅: '甲丙戊', 卯: '乙', 辰: '戊乙癸', 巳: '丙庚戊', 午: '丁己', 未: '己丁乙', 申: '庚壬戊', 酉: '辛', 戌: '戊辛丁', 亥: '壬甲' };
const keys = ['year', 'month', 'day', 'time'] as const;
const base = calculateBazi({ birthDate: '2000-02-20', birthTime: '12:00', gender: 'female' });
// 人工四柱仅验证位置规则，不冒充与基准生日一致的真实命盘。
function fixture(stems: string, branches = '子寅午亥', unknown = false): BaziCalculationResult {
  const pillars = Object.fromEntries(keys.map((key, i) => [key, unknown && key === 'time' ? null : {
    ...base.pillars[key]!, stem: stems[i], branch: branches[i], ganZhi: stems[i] + branches[i], stemElement: elements[stems[i]],
    hiddenStems: [...hidden[branches[i]]].map(stem => ({ stem, element: elements[stem], tenGod: '合成角色' })),
  }])) as BaziCalculationResult['pillars'];
  return { ...base, pillars, dayMaster: { stem: stems[2], element: elements[stems[2]] }, input: { ...base.input, unknownTime: unknown }, completeness: unknown ? 'partial_unknown_time' : 'complete' };
}
function shift(at: string, seconds: number) { return new Date(Date.parse(at.replace(' ', 'T') + 'Z') + seconds * 1000).toISOString().slice(0, 19).replace('T', ' '); }
function atTime(at: string, dayStem: string, unknown = false, timeZoneId = 'Etc/GMT-8') {
  const chart = calculateBazi({ birthDate: at.slice(0, 10), birthTime: at.slice(11), gender: 'female', timeZoneId, unknownTime: unknown });
  // 月内条件单测替换日干，其他时间与节令月保持真实历法定位。
  chart.dayMaster = { stem: dayStem, element: elements[dayStem] };
  chart.pillars.day = { ...chart.pillars.day, stem: dayStem, stemElement: elements[dayStem], ganZhi: dayStem + chart.pillars.day.branch };
  return chart;
}
const beforeText = JSON.stringify(base);
const deterministic = buildBaziNatalEffectReview(base);
check(deterministic.version === BAZI_NATAL_EFFECT_VERSION, '规则版本明确');
check(JSON.stringify(base) === beforeText, '不修改已保存原盘');
check(JSON.stringify(deterministic) === JSON.stringify(buildBaziNatalEffectReview(base)), '相同输入复核结果确定且无当前时间');

// 独立列举全部四柱表干组合，以五组配对关系和柱距作预期，不导入生产规则表作断言。
const pairSets = ['甲己', '乙庚', '丙辛', '丁壬', '戊癸'];
function partnered(a: string, b: string) { return pairSets.some(pair => pair.includes(a) && pair.includes(b) && a !== b); }
for (const a of Object.keys(elements)) for (const b of Object.keys(elements)) for (const c of Object.keys(elements)) for (const d of Object.keys(elements)) {
  const stems = a + b + c + d, r = buildBaziNatalEffectReview(fixture(stems));
  const expected: string[] = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (partnered(stems[i], stems[j])) expected.push(`${keys[i]}-${keys[j]}`);
  check(r.combinations.map(v => v.id).join() === expected.join(), '全部天干组合的五合对象、顺序及去重正确');
  for (const item of r.combinations) {
    const i = keys.indexOf(item.pillars[0]), j = keys.indexOf(item.pillars[1]);
    const direct = j === i + 1;
    check((item.conditions[0].status === 'matched') === direct, '只按固定柱距判断近邻');
    if (direct) {
      const competitor = [0, 1, 2, 3].some(k => k !== i && k !== j && ((Math.abs(k - i) === 1 && stems[k] === stems[j]) || (Math.abs(k - j) === 1 && stems[k] === stems[i])));
      check(item.status === (competitor ? 'adjacent_competing' : 'adjacent_clear'), '近邻争合仅计直接对象');
    }
    if (j - i === 3) check(item.status === 'remote_restricted', '年时远隔不作近合');
    check(item.conditions.at(-1)?.status === 'pending', '位置门槛通过不放行实际合去或化气');
  }
}
let r = buildBaziNatalEffectReview(fixture('庚乙甲乙'));
check(r.combinations.find(c => c.id === 'year-month')?.status === 'adjacent_clear' && !r.combinations.some(c => c.status === 'adjacent_competing'), '原典隔位重复例不直接当争合');
r = buildBaziNatalEffectReview(fixture('甲己甲壬'));
check(r.combinations.filter(c => c.status === 'adjacent_competing').length === 2, '甲己甲双侧近邻均保留争合');
r = buildBaziNatalEffectReview(fixture('甲庚己壬'));
check(r.combinations.find(c => c.id === 'year-day')?.status === 'control_between', '甲庚己列克隔条件，不跨过庚视为直接近合');
r = buildBaziNatalEffectReview(fixture('甲壬己壬'));
check(r.combinations.find(c => c.id === 'year-day')?.status === 'separated_pending', '普通隔位不能擅判克隔');
r = buildBaziNatalEffectReview(fixture('甲壬壬己'));
check(r.combinations.find(c => c.id === 'year-time')?.status === 'remote_restricted', '年时远合受限');
r = buildBaziNatalEffectReview(fixture('甲己甲壬', '子寅午亥', true));
check(r.combinations.every(c => c.pillars.every(p => p !== 'time')) && r.unknownTime, '未知时柱不补对象');
r = buildBaziNatalEffectReview(fixture('壬己甲壬', '子寅午亥', true));
check(r.combinations.find(c => c.id === 'month-day')?.conditions[1].status === 'pending', '缺时柱不能断言近邻对象唯一');
check(r.combinations.find(c => c.id === 'month-day')?.status === 'adjacent_unknown', '缺时近邻摘要同时降级，不能将待核显示为通过');

const clashPairs = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'];
for (const a of Object.keys(hidden)) for (const b of Object.keys(hidden)) {
  r = buildBaziNatalEffectReview(fixture('壬乙甲辛', a + b + '午亥'));
  const expected = clashPairs.some(p => p.includes(a) && p.includes(b) && a !== b);
  check(Boolean(r.branchClashes.find(c => c.id === 'year-month')) === expected, '十二支两两交叉独立核对六冲');
  const root = r.roots.find(v => v.stem === '壬')!;
  check(root.roots.some(v => v.id === 'year-壬' && v.kind === 'same_stem') === hidden[a].includes('壬'), '严格根只取相同藏干');
  check(root.roots.some(v => v.id === 'year-癸' && v.kind === 'same_element') === hidden[a].includes('癸'), '癸藏干作为壬的同五行支持');
}
r = buildBaziNatalEffectReview(fixture('壬丁壬辛', '亥巳亥酉'));
check(r.roots.find(v => v.stem === '壬')!.roots.filter(v => v.kind === 'same_stem').length === 2, '两处壬根受冲仍保留根事实');
check(r.roots.find(v => v.stem === '壬')!.conditions[1].status === 'not_matched', '已见根均受冲时无冲门槛不通过，不判拔根');
r = buildBaziNatalEffectReview(fixture('壬乙壬丁', '亥寅子巳'));
check(r.branchClashes.some(c => c.label.includes('亥') && c.concurrentRelations.some(s => s.includes('六合'))), '根支六冲与六合并见保留双方，不自动解冲');
r = buildBaziNatalEffectReview(fixture('甲乙壬丁', '申子辰午'));
check(r.branchClashes.some(c => c.label.includes('子') && c.concurrentRelations.some(s => s.includes('申子辰'))), '完整三合与六冲并见');
r = buildBaziNatalEffectReview(fixture('甲乙壬丁', '申子寅午'));
check(!r.branchClashes.some(c => c.concurrentRelations.some(s => s.includes('完整三合'))), '两支不冒充完整三合');
r = buildBaziNatalEffectReview(fixture('甲乙甲丁', '寅申亥午'));
check(r.roots.find(v => v.stem === '甲')!.conditions[1].status === 'matched', '一根受冲不抹掉另一未见冲的根');
r = buildBaziNatalEffectReview(fixture('甲乙甲丁', '寅申亥午', true));
check(r.roots.find(v => v.stem === '甲')!.conditions[1].status === 'pending', '缺时支无法把未见冲升级完整无冲');

for (const year of [1900, 1950, 2000, 2026, 2099, 2100]) {
  const table = (Solar.fromYmdHms(year, 7, 1, 12, 0, 0).getLunar() as unknown as { getJieQiTable(): Record<string, { toYmdHms(): string }> }).getJieQiTable();
  for (const [stem, term, first, last] of [['乙', '秋分', '癸', '丙癸'], ['癸', '谷雨', '丙', '丙辛甲']]) {
    const at = table[term].toYmdHms();
    for (const delta of [-1, 0, 1]) {
      const chart = atTime(shift(at, delta), stem), period = reviewBaziNatalPeriod(chart), climate = analyzeBaziClimate(chart);
      check(period.status === 'resolved' && period.boundary?.at === at, '明确节气按秒定位且保存来源时刻');
      check(period.activeBranchId === (delta < 0 ? 'before' : 'after') && period.activeStems.join('') === (delta < 0 ? first : last), '交接前闭后开，无一秒空洞');
      check(climate.stemReferences.map(v => v.stem).join('') === period.activeStems.join(''), '当前调候入口只使用适用分支');
    }
    const unknown = reviewBaziNatalPeriod(atTime(at, stem, true));
    check(unknown.status === 'uncertain_time' && !unknown.activeBranchId && unknown.branches.every(b => b.status === 'pending'), '节气交界日未知时刻不使用中午试排定分支');
    for (const delta of [-86400, 86400]) {
      const unknownStable = reviewBaziNatalPeriod(atTime(shift(at, delta), stem, true));
      check(unknownStable.status === 'resolved' && unknownStable.observation?.precision === 'day', '未知时辰整日不跨界可定位月份分支但保留缺时');
    }
    const foreign = atTime(at, stem); foreign.input.timeZoneId = 'America/New_York';
    check(reviewBaziNatalPeriod(foreign).status === 'unsupported_clock', '其他时区不套北京节气墙钟');
    const apparent = atTime(at, stem); apparent.input.timeStandard = 'apparent_solar_time'; apparent.effectiveTime.standard = 'apparent_solar_time';
    check(reviewBaziNatalPeriod(apparent).status === 'unsupported_clock', '真太阳时不与民用节气直接比较');
    const wrong = atTime(at, stem); wrong.pillars.month.branch = stem === '乙' ? '酉' : '辰'; wrong.effectiveTime.date = `${year}-02-20`;
    check(reviewBaziNatalPeriod(wrong).status === 'inconsistent_month', '时间与月支不一致只提示、不重排原盘');
  }
}
const summerDst = atTime('1988-09-10 12:00:00', '乙', false, 'Asia/Shanghai');
check(reviewBaziNatalPeriod(summerDst).status === 'unsupported_clock', '历史上海夏令时不能假装固定UTC+08');
for (const [stem, branch] of [['乙', '午'], ['壬', '丑'], ['癸', '未']]) {
  const chart = fixture('甲乙' + stem + '丁'); chart.pillars.month.branch = branch;
  const period = reviewBaziNatalPeriod(chart);
  check(period.status === 'source_ambiguous' && !period.boundary && !period.activeBranchId && !period.activeStems.length && period.branches.every(b => b.status === 'pending'), '含混半月不擅造分界或司令');
}
const raw = JSON.stringify(base);
buildBaziNatalEffectReview(base);
check(JSON.stringify(base) === raw, '反复调用不篡改输入');
const patterns = { candidates: [], monthCommand: { isStorageMonth: false } } as unknown as Parameters<typeof buildBaziReadingFacts>[2];
const facts = buildBaziReadingFacts(base, analyzeBaziInterpretation(base), patterns, 'synthetic-fingerprint');
check(facts.natalReview?.version === BAZI_NATAL_EFFECT_VERSION && facts.evidence.some(e => e.id === 'climate:natal-period'), '新复核进入报告事实与可引用依据');
check(new Set(facts.evidence.map(e => e.id)).size === facts.evidence.length, '依据标识唯一');
check(fingerprintBaziReading(facts) === fingerprintBaziReading(buildBaziReadingFacts(base, analyzeBaziInterpretation(base), patterns, 'synthetic-fingerprint')), '重复预览不产生新报告指纹');
check(fingerprintBaziReading(facts) !== fingerprintBaziReading({ ...facts, natalReview: undefined, methodologyVersion: 'bazi-reading-v2-monthly-conditional-review' }), '新旧规则指纹隔离');
const messages = buildBaziReadingMessages(facts);
check(JSON.parse(messages[1].content).natalReview.version === BAZI_NATAL_EFFECT_VERSION, '报告输入使用同一复核快照');
check(buildBaziReadingChatSnapshot(base, '解释原局争合与根气').includes('【原局作用复核】'), '原局追问带入作用复核');
check(!buildBaziReadingChatSnapshot(base, '解释2026年的流月十神').includes('【原局作用复核】'), '纯岁运问题不注入整份原局复核');
const valid: BaziReadingContent = { summary: '原局条件复核摘要，保留月令、根气与结构的适用范围。', sections: Object.keys(BAZI_READING_SECTIONS).map(key => ({ key: key as keyof typeof BAZI_READING_SECTIONS, content: `${key}近合入口通过不等于合化成功，藏根受冲也不能说明已经拔根。`, evidenceIds: key === 'action' ? ['chart:policy'] : [facts.evidence.find(e => e.id.startsWith(key + ':' + (facts.monthCommandReview && (key === 'strength' || key === 'pattern') ? 'month-command:' : '')))!.id, ...(key === 'pattern' && facts.monthIntake ? [facts.evidence.find(e => e.id.startsWith('pattern:month-intake:'))!.id] : [])] })) };
check(validateBaziReadingContent(JSON.stringify(valid), facts).sections.length === 5, '允许正常解释否定边界');
for (const text of ['这说明已经合化成功。', '所以根气已经失效。', '当前已经拔根，根气不能继续使用。', '近合通过，因此已经合去财星。']) {
  check(findBaziNatalOutputViolations(text).length > 0, '拦截未计算的实际作用结论');
  assert.throws(() => validateBaziReadingContent(JSON.stringify({ ...valid, summary: text + '以上作为合成测试的摘要。' }), facts)); checks++;
}
for (const text of ['条件满足不代表合化成功。', '有冲不能说明已经拔根。', '不能判定已经合去。', '合化成功仍待核。', '无冲不等于强根。']) check(!findBaziNatalOutputViolations(text).length, '保留否定与待核表达');
console.log(`八字原局作用复核专项通过：${checks}项；全四柱表干组合、近邻争合与隔位例、严格根与合冲并见、节气秒界、缺时整日、历史时差降级、报告同源与输出边界。`);
