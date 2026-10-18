import { Solar } from 'lunar-javascript';
import { BAZI_MONTHLY_CLIMATE_REFERENCES } from './monthly-climate-rules';
import { BAZI_PILLAR_KEYS, type BaziCalculationResult, type BaziPillar } from './types';
import {
  BAZI_NATAL_EFFECT_VERSION, NATAL_BRANCH_CLASH, NATAL_BRANCH_PARTNER, NATAL_CONTROLS,
  NATAL_EFFECT_SOURCES, NATAL_PERIOD_LABELS, NATAL_PERIOD_RULES, NATAL_STEM_ELEMENT, NATAL_STEM_PARTNER, NATAL_TRIADS,
} from './natal-effect-rules';
import type { BaziNatalBranchClash, BaziNatalCombination, BaziNatalEffectReview, BaziNatalPeriodReview, BaziNatalRootReview } from './natal-effect-types';

type IndexedPillar = BaziPillar & { index: number };
interface TermLunar { getJieQiTable(): Record<string, { toYmdHms(): string }>; getMonthInGanZhiExact(): string }
const source = (id: string) => NATAL_EFFECT_SOURCES.find(s => s.id === id)!.url;
function solarAt(at: string) {
  const values = at.split(/[- :]/).map(Number);
  return Solar.fromYmdHms(values[0], values[1], values[2], values[3], values[4], values[5]);
}
function wallAfter(at: string, seconds: number): string {
  const values = at.split(/[- :]/).map(Number);
  return new Date(Date.UTC(values[0], values[1] - 1, values[2], values[3], values[4], values[5]) + seconds * 1000).toISOString().slice(0, 19).replace('T', ' ');
}
/** 只在保存的民用时与 UTC+08:00 相符时定位节气；历史夏令时和太阳时不暗中混算。 */
function isFixedEightClock(chart: BaziCalculationResult, at: string): boolean {
  if (chart.input.timeStandard !== 'civil_time' || chart.effectiveTime.standard !== 'civil_time') return false;
  if (!['Asia/Shanghai', 'Etc/GMT-8'].includes(chart.input.timeZoneId)) return false;
  try {
    const instant = new Date(at.replace(' ', 'T') + '+08:00');
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: chart.input.timeZoneId, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
    const get = (key: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === key)?.value;
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}` === at;
  } catch { return false; }
}
export function reviewBaziNatalPeriod(chart: BaziCalculationResult): BaziNatalPeriodReview {
  const referenceKey = `${chart.dayMaster.stem}:${chart.pillars.month.branch}`, rule = NATAL_PERIOD_RULES[referenceKey];
  const reference = BAZI_MONTHLY_CLIMATE_REFERENCES[referenceKey];
  const result: BaziNatalPeriodReview = {
    referenceKey, status: 'not_applicable', label: NATAL_PERIOD_LABELS.not_applicable,
    detail: '本组合沿用月份段落或合论参考，不额外制造月内分支。', sourceUrl: source('period') + (reference?.sourceUrl.includes('#') ? reference.sourceUrl.slice(reference.sourceUrl.indexOf('#')) : ''),
    boundary: null, observation: null, branches: rule ? rule.branches.map(b => ({ ...b, primary: [...b.primary], support: [...b.support], status: 'pending' })) : [], activeBranchId: null, activeStems: [],
  };
  const pending = (status: BaziNatalPeriodReview['status'], detail: string) => ({ ...result, status, label: NATAL_PERIOD_LABELS[status], detail });
  if (!rule) return result;
  if (!rule.term) return pending('source_ambiguous', '原文仅分上下半月，未明确到本项目可核验的交接时刻。两支并列待核；不以公历十五日、月长中点、中气或另一部书的人元司令表自动替代。');
  const unknown = chart.completeness === 'partial_unknown_time' || chart.input.unknownTime || !chart.pillars.time;
  const from = `${chart.effectiveTime.date} ${unknown ? '00:00:00' : chart.effectiveTime.time}`;
  const untilExclusive = wallAfter(from, unknown ? 86400 : 1), last = wallAfter(untilExclusive, -1);
  if (!isFixedEightClock(chart, from) || !isFixedEightClock(chart, last)) return pending('unsupported_clock', '本版精确节气分支只支持与 UTC+08:00 一致的已保存民用时。历史时差、夏令时、其他时区和真太阳时保留两支，不用当前设备时区补算。');
  const year = Number(chart.effectiveTime.date.slice(0, 4));
  const terms = (Solar.fromYmdHms(year, 7, 1, 12, 0, 0).getLunar() as unknown as TermLunar).getJieQiTable();
  const at = terms[rule.term]?.toYmdHms();
  if (!at) return pending('unsupported_clock', '历法未提供对应节气交接时刻，暂不选择分支。');
  result.boundary = { name: rule.term, at, timeZone: 'UTC+08:00' };
  result.observation = { from, untilExclusive, precision: unknown ? 'day' : 'second' };
  const expected = chart.pillars.month.branch;
  const firstBranch = (solarAt(from).getLunar() as unknown as TermLunar).getMonthInGanZhiExact().slice(-1);
  const lastBranch = (solarAt(last).getLunar() as unknown as TermLunar).getMonthInGanZhiExact().slice(-1);
  if (firstBranch !== expected || lastBranch !== expected) return pending(unknown ? 'uncertain_time' : 'inconsistent_month', unknown ? '出生日期跨月令交节，缺时柱不能以中午试排月支选定月内分支。' : '已保存月支与有效时间的节令月不一致，保留原盘并要求复核，不静默重排。');
  if (from < at && untilExclusive > at) return pending('uncertain_time', `出生日期跨越${rule.term}，未提供出生时间，无法选择交接前后分支。`);
  const index = from >= at ? 1 : 0;
  result.status = 'resolved'; result.label = NATAL_PERIOD_LABELS.resolved;
  result.activeBranchId = rule.branches[index].id;
  result.activeStems = [...rule.branches[index].primary, ...rule.branches[index].support];
  result.branches = result.branches.map((b, i) => ({ ...b, status: i === index ? 'matched' : 'not_matched' }));
  result.detail = `${unknown ? '已按整个出生日期核对，同日未跨本分支边界；出生时间仍未知。' : '按保存的有效民用时定位，交接秒起属于后一段。'}适用“${rule.branches[index].label}”；只定位章节适用条件，不裁调候效力、强弱或喜忌。`;
  return result;
}

function indexedPillars(chart: BaziCalculationResult): IndexedPillar[] {
  return BAZI_PILLAR_KEYS.flatMap((key, index) => chart.pillars[key] ? [{ ...chart.pillars[key]!, index }] : []);
}
function reviewCombinations(pillars: IndexedPillar[], unknown: boolean): BaziNatalCombination[] {
  const result: BaziNatalCombination[] = [];
  for (const a of pillars) for (const b of pillars) {
    if (a.index >= b.index || NATAL_STEM_PARTNER[a.stem] !== b.stem) continue;
    const adjacent = b.index - a.index === 1, between = pillars.filter(p => p.index > a.index && p.index < b.index);
    const controlsBetween = between.filter(p => NATAL_CONTROLS[NATAL_STEM_ELEMENT[p.stem]] === NATAL_STEM_ELEMENT[a.stem] || NATAL_CONTROLS[NATAL_STEM_ELEMENT[p.stem]] === NATAL_STEM_ELEMENT[b.stem]);
    // 只把同一干两侧的直接近邻对象视为本清单争合；隔位重复不冒充直接争合。
    const competing = adjacent ? pillars.filter(p => p.key !== a.key && p.key !== b.key && ((Math.abs(p.index - a.index) === 1 && p.stem === b.stem) || (Math.abs(p.index - b.index) === 1 && p.stem === a.stem))) : [];
    const status = adjacent ? competing.length ? 'adjacent_competing' : unknown ? 'adjacent_unknown' : 'adjacent_clear' : b.index - a.index === 3 ? 'remote_restricted' : controlsBetween.length ? 'control_between' : 'separated_pending';
    const involvesDay = a.key === 'day' || b.key === 'day';
    result.push({
      id: `${a.key}-${b.key}`, pillars: [a.key, b.key], label: `${a.label}${a.stem} · ${b.label}${b.stem}`, status, involvesDay,
      conditions: [
        { label: '直接近邻', status: adjacent ? 'matched' : 'not_matched', detail: adjacent ? '两柱相邻；通过本清单近合的位置门槛。' : `中间隔${between.length}柱；不作为直接近合。` },
        { label: '近邻对象单一', status: !adjacent ? 'pending' : competing.length ? 'not_matched' : unknown ? 'pending' : 'matched', detail: competing.length ? `另见${competing.map(p => `${p.label}${p.stem}`).join('、')}为同一干的近邻对象，暂不选择合去谁。` : !adjacent ? '未通过直接近邻门槛，本项不用于证明隔位合的效力。' : unknown ? '已知三柱未见近邻争合，缺时柱不能排除时干新增对象。' : '已知四柱未见同一干的另一直接近邻对象；隔位重复不计入近邻争合。' },
        { label: '实际合绊、合去或化气', status: 'pending', detail: involvesDay ? '涉及日干本身之合，不能自动套成合去财官；近合入口通过也不证明合绊或化气。' : '仍需结合月令、根气、制化和其他合意复核，不把结构入口当成实际合去。' },
      ],
      observations: [
        ...between.map(p => `中间${p.label}${p.stem}`),
        ...controlsBetween.map(p => `${p.label}${p.stem}对端点有五行相克方向，仅作克隔条件映射，未裁实际克制。`),
        ...(b.index - a.index === 3 ? ['年干与时干远隔，本法不按直接近合处理，不换算成力量百分比。'] : []),
        ...(pillars.some(p => p.key !== a.key && p.key !== b.key && (p.stem === a.stem || p.stem === b.stem) && !competing.includes(p)) ? ['另有隔位同干重复，未直接判为争合。'] : []),
      ],
      pending: ['这里只复核本法的位置适用门槛；未开放全局合化及生克优先级。', ...(unknown ? ['时柱未知，入口通过只适用于已知三柱，不排除新增时干改变复核条件。'] : [])],
    });
  }
  return result;
}
function concurrentRelations(pillars: IndexedPillar[], target: IndexedPillar): string[] {
  const result = pillars.filter(p => p.key !== target.key && p.branch === NATAL_BRANCH_PARTNER[target.branch]).map(p => `${target.label}${target.branch}与${p.label}${p.branch}六合位置`);
  for (const group of NATAL_TRIADS) {
    if (!group.includes(target.branch) || !group.every(b => pillars.some(p => p.branch === b))) continue;
    result.push(`${group.join('')}完整三合支位置（${pillars.filter(p => group.includes(p.branch)).map(p => `${p.label}${p.branch}`).join('、')}）`);
  }
  return result;
}
function reviewClashes(pillars: IndexedPillar[]): BaziNatalBranchClash[] {
  return pillars.flatMap(a => pillars.filter(b => a.index < b.index && NATAL_BRANCH_CLASH[a.branch] === b.branch).map(b => {
    const concurrent = [...new Set([...concurrentRelations(pillars, a), ...concurrentRelations(pillars, b)])];
    return { id: `${a.key}-${b.key}`, label: `${a.label}${a.branch} · ${b.label}${b.branch}相冲`, pillars: [a.key, b.key] as BaziNatalBranchClash['pillars'], adjacent: b.index - a.index === 1, concurrentRelations: concurrent,
      detail: concurrent.length ? '六冲与会合位置并见，需要核对对象与先后；本轮不自动宣告解冲、冲开或拔根。' : '已见六冲位置，本清单未见双方的六合或完整三合位置；仍不能直接宣告拔根或关系失效。' };
  }));
}
function reviewRoots(chart: BaziCalculationResult, pillars: IndexedPillar[], clashes: BaziNatalBranchClash[], unknown: boolean): BaziNatalRootReview[] {
  const reference = BAZI_MONTHLY_CLIMATE_REFERENCES[`${chart.dayMaster.stem}:${chart.pillars.month.branch}`];
  const stems = [...new Set([chart.dayMaster.stem, ...pillars.map(p => p.stem), ...(reference?.stems ?? [])])];
  return stems.map(stem => {
    const roots = pillars.flatMap(p => p.hiddenStems.filter(s => s.element === NATAL_STEM_ELEMENT[stem]).map(s => ({
      id: `${p.key}-${s.stem}`, location: `${p.label}${p.branch}藏${s.stem}`, kind: s.stem === stem ? 'same_stem' as const : 'same_element' as const,
      clashes: clashes.filter(c => c.pillars.includes(p.key)).map(c => c.label), concurrentRelations: concurrentRelations(pillars, p),
    })));
    const exact = roots.filter(r => r.kind === 'same_stem'), unclashed = exact.filter(r => !r.clashes.length);
    return { stem, isDayMaster: stem === chart.dayMaster.stem, surfaces: pillars.filter(p => p.stem === stem).map(p => `${p.label}${p.stem}${p.key === 'day' ? '（日主参照）' : ''}`), roots,
      conditions: [
        { label: '严格同干藏根', status: exact.length ? 'matched' : unknown ? 'pending' : 'not_matched', detail: exact.length ? `已知原局找到${exact.length}处同干藏根；不把同五行其他干混称为本干根。` : unknown ? '已知三柱未找到同干藏根，时柱未知不能判全盘缺失。' : '四柱未找到同干藏根；同五行支持另列，不能据此直接断无助或无效。' },
        { label: '未见六冲的同干藏根', status: !exact.length ? 'pending' : unknown ? 'pending' : unclashed.length ? 'matched' : 'not_matched', detail: !exact.length ? '尚无严格同干藏根供本项检查。' : unknown ? `已知三柱有${unclashed.length}处同干藏根未见六冲；时支未知，结论仍不完整。` : unclashed.length ? `${unclashed.length}处同干藏根未见本清单六冲；有其他根受冲也不抹去这些位置。` : '已见同干藏根均有六冲位置，仍保留藏根事实，不等于全被拔除。' },
        { label: '根气实际效力', status: 'pending', detail: '需另核月令、会合、生克与制化；无冲不等于强根，受冲不等于拔根，同五行支持不等于严格同干根。' },
      ],
    };
  });
}
export function buildBaziNatalEffectReview(chart: BaziCalculationResult): BaziNatalEffectReview {
  const pillars = indexedPillars(chart), unknownTime = chart.completeness === 'partial_unknown_time' || chart.input.unknownTime || !chart.pillars.time;
  const branchClashes = reviewClashes(pillars);
  return {
    version: BAZI_NATAL_EFFECT_VERSION, methodLabel: '原局作用复核 · 节气分支与近合条件法', sources: NATAL_EFFECT_SOURCES.map(s => ({ ...s })),
    period: reviewBaziNatalPeriod(chart), combinations: reviewCombinations(pillars, unknownTime), branchClashes,
    roots: reviewRoots(chart, pillars, branchClashes, unknownTime), unknownTime,
    boundary: '本项满足或不满足，只针对写明的检查条件；不等于整盘断法通过或否定。未完成实际合化、拔根、解冲、最终旺衰、格局成败、完整人元司令与唯一喜忌裁决。',
  };
}
