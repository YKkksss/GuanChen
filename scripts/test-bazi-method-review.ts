import assert from 'node:assert/strict';
import { calculateBazi } from '../lib/bazi/engine';
import { analyzeBaziInterpretation } from '../lib/bazi/interpretation-engine';
import { auditBaziPatternConditions } from '../lib/bazi/pattern-condition-engine';
import type { BaziStrengthCompositeResult } from '../lib/bazi/strength-composite-types';
import type { BaziCalculationResult, BaziElement } from '../lib/bazi/types';
import { buildBaziReadingChatSnapshot, buildBaziReadingFacts } from '../lib/bazi/reading-engine';
import { BAZI_METHOD_REVIEW_VERSION } from '../lib/bazi/method-review-rules';
import { describeBaziMethodReview } from '../lib/bazi/method-review-engine';
import { findBaziMethodOutputViolations } from '../lib/bazi/method-review-output';
import { buildBaziReadingMessages, validateBaziReadingContent } from '../lib/bazi/reading-interpretation';
import { fingerprintBaziReading } from '../lib/db/bazi-readings';
import { BAZI_READING_SECTIONS, type BaziReadingContent } from '../lib/bazi/reading-types';

let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
function factsFor(chart: BaziCalculationResult) {
  const interpretation = analyzeBaziInterpretation(chart);
  // 格局条件引擎只读取综合层的静态上下文；单测不伪造岁运结果。
  const staticContext = { methodologyVersion: 'unit-static-context', engineVersion: 'unit-static-context', staticBaseline: interpretation.strength } as unknown as BaziStrengthCompositeResult;
  const patterns = auditBaziPatternConditions(chart, interpretation, staticContext);
  return buildBaziReadingFacts(chart, interpretation, patterns, 'synthetic-method-review');
}
const base = calculateBazi({ birthDate: '1992-10-11', birthTime: '09:30', gender: 'female' });
const before = JSON.stringify(base), facts = factsFor(base), review = facts.methodReview!;
check(review.version === BAZI_METHOD_REVIEW_VERSION, '方法规则独立版本');
check(JSON.stringify(base) === before, '不改变已保存排盘');
check(JSON.stringify(review) === JSON.stringify(factsFor(base).methodReview), '复核不包含当前时间等非确定性值');
check(review.patterns.length > 1 && review.patterns.length === facts.patterns.candidates.length, '杂气月全部候选保留而非首项');
check(review.patterns.every(p => p.conditions.at(-1)?.status === 'pending'), '任何候选都不自动裁决成败');
check(facts.usefulElements.every(e => !e.suggestedBy.some(m => m.includes('格局'))), '月令格局来源不直接当作补偏喜用');
check(new Set(facts.evidence.map(e => e.id)).size === facts.evidence.length, '可引用依据ID唯一');
check(JSON.parse(buildBaziReadingMessages(facts)[1].content).methodReview.version === review.version, '报告使用完整同版复核');
check(buildBaziReadingChatSnapshot(base, '复核旺衰、格局、扶抑取用和通关', { interpretation: facts.interpretation, patterns: facts.patterns }).includes(describeBaziMethodReview(review)), '聊天使用同源方法快照');
check(!buildBaziReadingChatSnapshot(base, '解释2026年的流日十神', { interpretation: facts.interpretation, patterns: facts.patterns }).includes('【分方法旺衰格局取用复核】'), '纯岁运问题不挤入整份方法矩阵');
check(!buildBaziReadingChatSnapshot(base, '解释2026年的流月格局条件', { interpretation: facts.interpretation, patterns: facts.patterns }).includes('【分方法旺衰格局取用复核】'), '动态格局问题优先保留动态条件上下文');
check(fingerprintBaziReading(facts) === fingerprintBaziReading(factsFor(base)), '重复预览指纹稳定');
check(fingerprintBaziReading(facts) !== fingerprintBaziReading({ ...facts, methodReview: undefined, methodologyVersion: 'bazi-reading-v3-natal-period-contact-review' }), '旧规则与新复核指纹隔离');

// 覆盖真实历法日期中的九种格局、完整和缺时资料；预期按上游逐项核对而不按候选计分。
const archetypes = new Set<string>(), directions = new Set<string>();
for (let month = 1; month <= 12; month++) for (let day = 8; day <= 27; day++) for (const unknownTime of [false, true]) {
  const current = factsFor(calculateBazi({ birthDate: `2001-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, birthTime: unknownTime ? undefined : '09:30', unknownTime, gender: 'female' })), r = current.methodReview!;
  directions.add(r.balancing.direction);
  check(r.patterns.map(p => p.id).join() === current.patterns.candidates.map(p => p.id).join(), '全部候选身份和顺序保持');
  for (let i = 0; i < r.patterns.length; i++) {
    const path = r.patterns[i], upstream = current.patterns.candidates[i]; archetypes.add(path.archetype);
    check(path.support.length === upstream.formationSupport.length && path.risks.length === upstream.breakingRisks.length && path.rescues.length === upstream.rescueCandidates.length, '支持风险救应不互相覆盖');
    for (const [items, original] of [[path.support, upstream.formationSupport], [path.risks, upstream.breakingRisks], [path.rescues, upstream.rescueCandidates]] as const) for (let j = 0; j < items.length; j++) {
      if (original[j].status === 'not_applicable') check(items[j].status === 'not_applicable', '未适用救应不能冒充已见或未决');
      if (original[j].status === 'unknown_due_to_missing_time') check(items[j].status === 'pending', '缺时不能改写为条件缺失');
    }
    if (['build_prosperity', 'month_robbery', 'yang_blade'].includes(path.archetype)) check(path.meaning === 'peer_month_separate_selection' && path.conditions.some(c => c.id === 'separate-selection' && c.status === 'pending'), '禄劫刃另查取用路径');
    if (path.archetype === 'yang_blade') check(path.label.includes('阳刃路径'), '阳刃路径显式标注，不混在普通月劫名称中');
  }
  if (unknownTime) check(r.balancing.direction === 'undetermined' && !r.balancing.elements.length && current.usefulElements.every(e => e.status === 'undetermined'), '缺时无扶抑裁决或强行补缺');
  if (r.balancing.direction === 'undetermined') check(!r.balancing.elements.length, '证据并见不强行选一边');
  check(r.flow.length === 5 && r.flow.every(f => f.conditions.filter(c => ['opposition-parity', 'flow-effective'].includes(c.id)).every(c => c.status === 'pending')), '五条桥接永远保留未计算的势均和效力门槛');
  check(current.usefulElements.every(e => e.status !== 'method_conflict'), '五行方向不相交不等于方法冲突');
}
check(archetypes.size === 9, '九种格局路径均覆盖');
check(directions.has('undetermined') && directions.has('support') && directions.has('drain_control'), '扶抑三类状态均覆盖');

// 人工四柱只验证桥接位置边界，不宣称与生日一致，也不用于生成实际档案。
const sparse = structuredClone(base);
for (const p of Object.values(sparse.pillars)) if (p) { p.stem = '甲'; p.stemElement = '木'; p.hiddenStems = []; }
sparse.dayMaster = { stem: '甲', element: '木' };
sparse.pillars.year.stem = '戊'; sparse.pillars.year.stemElement = '土';
const woodEarth = factsFor(sparse).methodReview!.flow.find(f => f.opposing.join() === '木,土')!;
check(woodEarth.bridge === '火' && woodEarth.conditions[0].status === 'observed' && woodEarth.conditions[1].status === 'observed' && woodEarth.conditions[3].status === 'not_observed', '木土同见无火，只定位缺少桥接位置');
check(woodEarth.conditions[2].status === 'pending' && woodEarth.conditions[4].status === 'pending', '两方同见不能判通关');
const independentPaths = ['木土火', '火金土', '土水金', '金木水', '水火木'];
check(review.flow.every(f => independentPaths.includes(f.opposing.join('') + f.bridge)), '五条克制与中介路径独立期望核对');
const onlyDayWood = structuredClone(sparse);
for (const key of ['year', 'month', 'time'] as const) if (onlyDayWood.pillars[key]) onlyDayWood.pillars[key]!.stemElement = '土';
check(factsFor(onlyDayWood).methodReview!.flow.find(f => f.opposing[0] === '木')?.positions[0].surface.some(s => s.startsWith('日柱')), '通关对峙参照纳入日干');
const missing = structuredClone(sparse); missing.pillars.time = null; missing.completeness = 'partial_unknown_time'; missing.input.unknownTime = true;
check(factsFor(missing).methodReview!.flow.find(f => f.opposing[0] === '木')?.conditions[3].status === 'pending', '缺时未见中介不能断全盘无桥接');

const allowed: BaziReadingContent = { summary: '分方法必要条件复核，保留各自语义、反证与尚未确定的信息。', sections: Object.keys(BAZI_READING_SECTIONS).map(key => ({ key: key as keyof typeof BAZI_READING_SECTIONS, content: `${key}：候选不等于已经成格，也不能认为通关已经成立，最终身强身弱尚未裁决。`, evidenceIds: key === 'action' ? ['chart:policy'] : [facts.evidence.find(e => e.id.startsWith(key + ':' + (facts.monthCommandReview && (key === 'strength' || key === 'pattern') ? 'month-command:' : '')))!.id, ...(key === 'pattern' && facts.monthIntake ? [facts.evidence.find(e => e.id.startsWith('pattern:month-intake:'))!.id] : [])] })) };
check(validateBaziReadingContent(JSON.stringify(allowed), facts).sections.length === 5, '正常否定边界解释可保存');
for (const text of ['两行同见，因此已经通关。', '当前通关成立，火为桥梁。', '病药已经生效。', '此局已经成格。', '救应已经完成。', '最终身强，可以定论。']) {
  check(findBaziMethodOutputViolations(text).length > 0, '拦截未计算的最终作用');
  assert.throws(() => validateBaziReadingContent(JSON.stringify({ ...allowed, summary: text + '请据此参考已提供的其他条件。' }), facts)); checks++;
}
for (const text of ['不能宣告通关成立。', '同见不代表已经通关。', '救应已经完成尚未确认。', '不能直接判定成格。', '不等于最终身强。']) check(!findBaziMethodOutputViolations(text).length, '否定与待核不误拦');
console.log(`分方法旺衰格局取用复核专项通过：${checks}项；九类格局、全部候选、扶抑前提、五条桥接、缺时降级、报告问答同源与输出边界。`);
