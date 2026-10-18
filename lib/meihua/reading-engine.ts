import { Solar } from 'lunar-javascript';
import { MEIHUA_READING_VERSION, MEIHUA_SEASON_POLICIES, MEIHUA_TIMING_TARGETS, type MeihuaReading, type MeihuaSeasonState } from './reading-types';
import type { Element, MeihuaResult, MeihuaEvidence } from './types';
import { buildMeihuaImagery, meihuaImageryEvidence } from './imagery-engine';
import { buildMeihuaScenario, meihuaScenarioEvidence } from './scenario-engine';
const GENERATES: Record<Element, Element> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const CONTROLS: Record<Element, Element> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
const BRANCH_ELEMENTS: Record<string, Element> = { 寅: '木', 卯: '木', 巳: '火', 午: '火', 申: '金', 酉: '金', 亥: '水', 子: '水', 辰: '土', 戌: '土', 丑: '土', 未: '土' };
const LUNAR_BRANCHES = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const SOURCE = 'https://zh.wikisource.org/wiki/梅花易數/卷二';
export function meihuaSeasonState(element: Element, season: Element): MeihuaSeasonState {
  if (!Object.hasOwn(GENERATES, element) || !Object.hasOwn(GENERATES, season)) throw new Error('五行不正确');
  return element === season ? '旺' : GENERATES[season] === element ? '相' : GENERATES[element] === season ? '休' : CONTROLS[element] === season ? '囚' : '死';
}
export function analyzeMeihuaReading(result: MeihuaResult): MeihuaReading {
  const { input } = result, dateTime = input.dateTime ?? input.contextDateTime;
  const policy = input.seasonPolicy ?? 'jie_month', target = input.timingTarget ?? 'body';
  let context: MeihuaReading['context'] = null;
  if (dateTime) {
    const [y, m, d] = dateTime.slice(0, 10).split('-').map(Number), [h, min, sec] = dateTime.slice(11).split(':').map(Number);
    const lunar = Solar.fromYmdHms(y, m, d, h, min, sec).getLunar();
    const lunarMonth = Math.abs(lunar.getMonth());
    const branch = policy === 'jie_month' ? (lunar as unknown as { getMonthZhiExact(): string }).getMonthZhiExact() : LUNAR_BRANCHES[lunarMonth - 1];
    context = { dateTime, source: input.dateTime ? 'cast' : 'context', policy, label: MEIHUA_SEASON_POLICIES[policy], monthBranch: branch, monthElement: BRANCH_ELEMENTS[branch], lunarMonth, leapMonth: lunar.getMonth() < 0, note: policy === 'jie_month' ? '按十二节的精确交接时刻取月支，辰戌丑未按土月参考；本轮不叠加四季末十八日或长生十二状态。' : '按实际农历月序配寅至丑，闰月沿用同名月；这是显式项目口径，不与节令月混用。' };
  }
  const rows: MeihuaReading['rows'] = [{ key: 'body', label: '本卦固定体', trigram: result.body.trigram, relationship: '固定体参照', state: null }, ...result.relations.map(r => ({ key: r.id.replace('relation:', ''), label: r.label, trigram: r.trigram, relationship: r.relationship, state: null }))];
  for (const row of rows) row.state = context ? meihuaSeasonState(row.trigram.element, context.monthElement) : null;
  const groups = ['用生体', '用克体', '体生用', '体克用', '比和'].map(relationship => ({ relationship, positions: rows.slice(1).filter(row => row.relationship === relationship).map(row => row.label), note: '只列本用、上下互及变用的结构位置；重复卦与互卦共享爻，不是独立证据，不按数量投票判断成败。' }));
  const trigram = target === 'body' ? result.body.trigram : target === 'use' ? result.use.trigram : result.changed[result.use.position];
  const supporting = (Object.keys(GENERATES) as Element[]).find(element => GENERATES[element] === trigram.element)!;
  const opposing = (Object.keys(CONTROLS) as Element[]).find(element => CONTROLS[element] === trigram.element)!;
  const branches = (element: Element) => Object.keys(BRANCH_ELEMENTS).filter(branch => BRANCH_ELEMENTS[branch] === element);
  const reading: MeihuaReading = {
    version: MEIHUA_READING_VERSION, status: context ? 'ready' : 'needs_time', context, rows, groups,
    timing: { target, label: MEIHUA_TIMING_TARGETS[target], trigram, number: trigram.number, conditions: [
      { label: '参考卦同类旺气月份', branches: branches(trigram.element), detail: `${trigram.name}${trigram.element}的同类月份参考，不表示这些月份会发生占问事件。` },
      { label: '生参考卦者旺气月份', branches: branches(supporting), detail: `${supporting}生${trigram.element}，只观察生扶条件；有生扶标签不等于已判有利应期。` },
      { label: '克参考卦者旺气月份', branches: branches(opposing), detail: `${opposing}克${trigram.element}，与其他条件并列核对，不直接判为不利或应验。` },
    ], note: '以上为条件应期的卦气月份观察，沿用所选月界；不是指定日、时的应验清单。先天卦数只记录象数，不乘动爻、不加时辰换算成若干天或确定公历日期；缺少时间时不能定位当前季节。' },
    boundaries: ['体固定为本卦不含动爻的一侧；变卦用仍与原体比较，不重新换体。', '本、互、变是同一卦的结构展开，不把中间、变化标签硬指定为某天或某阶段的现实经历。', '旺相休囚死是季节五行参考术语，不是对人体、寿命或事情成败的判断。', '原典春夏秋冬及四季土月有不同细分解释；本版明确月界和土月口径，不宣称覆盖全部流派。', '不自动推定占问对象、纳甲六亲、旬空日破、外应或卦爻辞，不合成吉凶分数。', '物数占以原始计数配时数，互卦与体用沿用本项目单动爻口径；没有自动识物、语音采集或文字笔画算法。'],
  };
  reading.imagery = buildMeihuaImagery(result, reading);
  reading.scenario = buildMeihuaScenario(result, reading);
  return reading;
}
export function meihuaReadingEvidence(reading: MeihuaReading): MeihuaEvidence[] {
  return [
    { id: 'reading:season', label: '季节参考时间与月界', detail: reading.context ? `${reading.context.source === 'cast' ? '起卦时间' : '明确补充的季节参考时间'}${reading.context.dateTime}，固定UTC+08:00；${reading.context.label}，${reading.context.monthBranch}月属${reading.context.monthElement}。${reading.context.note}` : '没有明确季节参考时刻，不套用当前时间，不推定季节旺衰。', sourceUrl: SOURCE + '#複明時令之應' },
    { id: 'reading:relations', label: '体用互变逐位季节条件', detail: reading.rows.map(row => `${row.label}：${row.trigram.name}${row.trigram.element}，${row.relationship}，季节${row.state ?? '未定位'}`).join('；') + '。结构关系与季节分开，不据此判成败。', sourceUrl: SOURCE + '#體用總訣' },
    { id: 'reading:groups', label: '结构位置与反证并列', detail: reading.groups.map(group => `${group.relationship}：${group.positions.join('、') || '当前未列'}`).join('；') + '。互变共享卦爻，不能按出现次数投票定吉凶。', sourceUrl: SOURCE + '#卦斷遺論' },
    { id: 'reading:timing', label: '条件应期与象数边界', detail: `${reading.timing.label}：${reading.timing.trigram.name}${reading.timing.trigram.element}，先天卦数${reading.timing.number}。` + reading.timing.conditions.map(c => `${c.label}：${c.branches.join('、')}`).join('；') + '。' + reading.timing.note, sourceUrl: SOURCE + '#先天後天論' },
    ...(reading.imagery ? meihuaImageryEvidence(reading.imagery) : []),
    ...(reading.scenario ? meihuaScenarioEvidence(reading.scenario) : []),
  ];
}
