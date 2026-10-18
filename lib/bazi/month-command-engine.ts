import { Solar } from 'lunar-javascript';
import { resolveCivilTimeUtcCandidates } from '@/lib/rectification/time-service';
import { resolveBaziTenGod } from './dynamic-ten-god-engine';
import { BAZI_PILLAR_KEYS, type BaziCalculationResult } from './types';
import type { BaziPatternConditionResult } from './pattern-condition-types';
import type { BaziNatalPeriodReview } from './natal-effect-types';
import type { BaziReadingEvidence } from './reading-types';
import { MONTH_COMMAND_BRANCHES, MONTH_COMMAND_SOURCES, MONTH_COMMAND_TABLE, MONTH_COMMAND_TERMS } from './month-command-rules';
import { BAZI_MONTH_COMMAND_POLICY, BAZI_MONTH_COMMAND_VERSION, type BaziMonthCommandReview, type BaziMonthCommandSegment } from './month-command-types';

const DAY = 86400;
interface TermLunar { getJieQiTable(): Record<string, { toYmdHms(): string }>; getMonthInGanZhiExact(): string }
function epoch(at: string) { return Date.parse(at.replace(' ', 'T') + 'Z') / 1000; }
function wall(seconds: number) { return new Date(seconds * 1000).toISOString().slice(0, 19).replace('T', ' '); }
function solar(at: string) { const parts = at.split(/[- :]/).map(Number); return Solar.fromYmdHms(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]); }
function monthAt(at: string) { return (solar(at).getLunar() as unknown as TermLunar).getMonthInGanZhiExact().slice(-1); }
function fixedEight(at: string, zone: string) {
  if (!['Asia/Shanghai', 'Etc/GMT-8'].includes(zone)) return false;
  try {
    if (at.slice(0, 4) >= '1900' && at.slice(0, 4) <= '2100') {
      const candidates = resolveCivilTimeUtcCandidates({ date: at.slice(0, 10), time: at.slice(11), timeZoneId: zone });
      return candidates.length === 1 && candidates[0].utcOffsetMinutes === 480;
    }
    // 日期范围两端的相邻节界可在前后一年；只核对时区，不扩大出生输入范围。
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at.replace(' ', 'T') + '+08:00'));
    const get = (key: string) => parts.find(part => part.type === key)?.value;
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}` === at;
  } catch { return false; }
}
// 只缓存历法节界，不缓存用户命盘或个人资料。
const termCache = new Map<number, Array<{ name: string; at: string; value: number; branch: string }>>();
function yearTerms(year: number) {
  const cached = termCache.get(year); if (cached) return cached;
  const table = (Solar.fromYmdHms(year, 7, 1, 12, 0, 0).getLunar() as unknown as TermLunar).getJieQiTable();
  const result = MONTH_COMMAND_TERMS.map((name, index) => { const at = table[name].toYmdHms(); return { name, at, value: epoch(at), branch: MONTH_COMMAND_BRANCHES[index] }; });
  termCache.set(year, result); return result;
}

export function buildBaziMonthCommandReview(chart: BaziCalculationResult, patterns?: BaziPatternConditionResult, period?: BaziNatalPeriodReview): BaziMonthCommandReview {
  const unknownTime = chart.input.unknownTime || chart.completeness === 'partial_unknown_time' || !chart.pillars.time;
  const review: BaziMonthCommandReview = {
    version: BAZI_MONTH_COMMAND_VERSION, policy: BAZI_MONTH_COMMAND_POLICY, policyLabel: '三命通会主段 · 三十日定长观察',
    status: 'unsupported_clock', label: '时间口径待核', detail: '', savedMonthBranch: chart.pillars.month.branch, unknownTime,
    observation: null, months: [], segments: [], activeSegmentId: null, candidateSegmentIds: [],
    comparisons: { monthHiddenStems: chart.pillars.month.hiddenStems.map(item => ({ ...item, tenGod: unknownTime ? null : item.tenGod })), climatePeriod: { label: period?.label ?? '未附调候月内分支', status: period?.status ?? 'not_provided', activeStems: [...(period?.activeStems ?? [])], note: '调候条文的节气或上下半月条件继续按原规则；司事分日不替它选分支。' }, note: `已保存月令本气与全部藏干保持原文。司事干只与实际表干、同干藏根及格局候选作位置对照；日干单列参照，不重复计为透干。${unknownTime ? '时辰未知，日主仍为保存时的试排参照；不输出整日唯一十神，未见位置不能判全盘缺失。' : ''}` },
    sources: MONTH_COMMAND_SOURCES.map(item => ({ ...item })),
    boundaries: ['原典分日存在不同版本与反对意见，本版仅采用明确的主段原表，不混用玉井表或现代常用表。', '从精确交节起，每满86400秒记一日，左闭右开；这是本项目可复核观察约定，不声称是原书规定的唯一秒级换算。', '短节月到下一节截断；长节月超过三十日的尾段不补算，不比例伸缩，也不延续最后一干。', '艮土、坤土、已土（四库转录作巳土）不擅自指定具体天干、十神、透干或格局；源表与命盘藏干不一致时分别保留。', '只支持与UTC+08:00一致的保存民用时及节月时钟；历史夏令时、重复时刻、其他时区与真太阳时本轮不定位。', '未知时辰核对整个民用出生日期，跨交节或分日边界保留所有候选；不以中午试排代替出生瞬间，晚子时规则不挪动司事节界。', '区间定位、司事名称、透藏位置及格局来源匹配都不等于得令有力、最终旺衰、格局成败或唯一喜忌；不计算力量或吉凶分数。'],
  };
  const pending = (status: BaziMonthCommandReview['status'], label: string, detail: string) => ({ ...review, status, label, detail });
  if (chart.input.timeStandard !== 'civil_time' || chart.effectiveTime.standard !== 'civil_time') return pending('unsupported_clock', '时间标准待核', '本轮不把真太阳时直接当北京时间定位；保留原盘及原调候分支，未建立司事时段。');
  if (chart.effectiveTime.date !== chart.input.birthDate || (!unknownTime && chart.effectiveTime.time !== chart.input.birthTime)) return pending('inconsistent_chart', '保存时间不一致', '保存的有效民用时与原出生资料不一致，保留原盘并要求复核，不静默重排。');
  const from = `${chart.input.birthDate} ${unknownTime ? '00:00:00' : chart.input.birthTime}`, start = epoch(from), until = start + (unknownTime ? DAY : 1), last = wall(until - 1);
  if (!Number.isFinite(start) || !fixedEight(from, chart.input.timeZoneId) || !fixedEight(last, chart.input.timeZoneId)) return pending('unsupported_clock', '民用时区待核', '出生观察区间不满足唯一UTC+08:00时钟；不选择司事干或借当前时区换算。');
  const at = `${chart.effectiveTime.date} ${chart.effectiveTime.time}`;
  if (monthAt(at) !== chart.pillars.month.branch) return pending('inconsistent_chart', '保存月柱待核', '保存月支与原有效时刻的精确节令月不一致；不以本复核重排或覆盖原月柱。');
  const year = Number(chart.input.birthDate.slice(0, 4));
  const terms = [year - 1, year, year + 1].flatMap(yearTerms).sort((a, b) => a.value - b.value);
  const windows = terms.slice(0, -1).map((term, index) => ({ term, next: terms[index + 1] })).filter(item => item.term.value < until && item.next.value > start);
  if (!windows.length) return pending('inconsistent_chart', '节界数据待核', '未找到能覆盖出生观察区间的节令月边界，不指定司事段。');
  if (windows.some(({ term, next }) => !fixedEight(term.at, chart.input.timeZoneId) || !fixedEight(wall(next.value - 1), chart.input.timeZoneId))) return pending('unsupported_clock', '节月时钟待核', '本节月起止与出生时刻不能共同采用唯一UTC+08:00时钟（例如历史夏令时切换）。保留原盘，不将标准时日数与历史民用时混算。');
  review.observation = { from, untilExclusive: wall(until), precision: unknownTime ? 'day' : 'second', timeZone: 'UTC+08:00' };
  const pillars = BAZI_PILLAR_KEYS.flatMap(key => chart.pillars[key] ? [chart.pillars[key]!] : []);
  for (const { term, next } of windows) {
    const tailStart = term.value + 30 * DAY;
    const uncoveredTail = tailStart < next.value ? { from: wall(tailStart), untilExclusive: next.at, overlapsObservation: tailStart < until && next.value > start } : null;
    review.months.push({ branch: term.branch, startTerm: term.name, start: term.at, endTerm: next.name, untilExclusive: next.at, elapsedSecondsFrom: Math.max(0, start - term.value), elapsedSecondsUntilExclusive: Math.min(next.value - term.value, until - term.value), actualDurationSeconds: next.value - term.value, uncoveredTail });
    let cumulative = 0;
    for (const [index, entry] of MONTH_COMMAND_TABLE[term.branch].entries()) {
      const fromDay = cumulative; cumulative += entry.days;
      const begin = term.value + fromDay * DAY, end = Math.min(next.value, term.value + cumulative * DAY);
      if (begin >= end) continue;
      const id = `${term.at.slice(0, 10)}:${term.branch}:${index + 1}`;
      const segment: BaziMonthCommandSegment = { id, monthBranch: term.branch, order: index + 1, sourceText: entry.sourceText, stem: entry.stem, element: entry.element, sourceDays: entry.days, fromDay, untilDay: cumulative, from: wall(begin), untilExclusive: wall(end), overlapsObservation: begin < until && end > start,
        stemStatus: entry.stem ? 'explicit' : 'text_ambiguous', tenGod: entry.stem && !unknownTime ? resolveBaziTenGod(chart.dayMaster.stem, entry.stem) : null,
        surface: entry.stem ? pillars.filter(pillar => pillar.key !== 'day' && pillar.stem === entry.stem).map(pillar => `${pillar.label}${pillar.stem}`) : [],
        dayMasterSameStem: Boolean(entry.stem && chart.dayMaster.stem === entry.stem),
        exactRoots: entry.stem ? pillars.flatMap(pillar => pillar.hiddenStems.filter(hidden => hidden.stem === entry.stem).map(hidden => `${pillar.label}${pillar.branch}藏${hidden.stem}`)) : [],
        sameElementRoots: entry.stem ? pillars.flatMap(pillar => pillar.hiddenStems.filter(hidden => hidden.element === entry.element && hidden.stem !== entry.stem).map(hidden => `${pillar.label}${pillar.branch}藏${hidden.stem}`)) : [],
        monthHiddenMatch: Boolean(entry.stem && chart.pillars.month.hiddenStems.some(hidden => hidden.stem === entry.stem)),
        patternCandidates: entry.stem ? (patterns?.candidates.filter(candidate => candidate.sourceStem === entry.stem).map(candidate => ({ id: candidate.id, label: candidate.label })) ?? []) : [],
        note: entry.note + (end < term.value + cumulative * DAY ? ' 本节月早于原表三十日结束，显示区间在下一节截断，原表天数仍原样保留。' : ''), evidenceId: `strength:month-command:segment:${id}` };
      review.segments.push(segment);
    }
  }
  review.candidateSegmentIds = review.segments.filter(item => item.overlapsObservation).map(item => item.id);
  const tailOverlap = review.months.some(month => month.uncoveredTail?.overlapsObservation);
  if (!tailOverlap && review.candidateSegmentIds.length === 1) {
    review.status = 'resolved'; review.label = '分日区间已定位'; review.activeSegmentId = review.candidateSegmentIds[0];
    const selected = review.segments.find(item => item.id === review.activeSegmentId)!;
    review.detail = `${unknownTime ? '整个出生日期落在同一分日区间，出生瞬间仍未知。' : '按保存的民用出生时刻定位。'}原文“${selected.sourceText}”${selected.stem ? '只作明确司事干的位置参照' : '的具体天干待核，不指派十神'}；不裁定旺衰、格局成败或喜忌。`;
  } else if (!review.candidateSegmentIds.length && tailOverlap) {
    review.status = 'uncovered_tail'; review.label = '原表三十日后待核'; review.detail = '观察区间落在实际节令月超过原表三十日的尾段；不延长末干或改用比例换算。';
  } else {
    review.status = 'uncertain_time'; review.label = '出生日期跨界，候选并列'; review.detail = `观察区间跨司事分段或交节${tailOverlap ? '，并含原表未覆盖尾段' : ''}；保留全部交集，不以中午试排挑选唯一司事。`;
  }
  return review;
}

export function describeBaziMonthCommandReview(review: BaziMonthCommandReview): string {
  const candidates = review.segments.filter(item => review.candidateSegmentIds.includes(item.id));
  return `【人元司事分日复核】${review.version}；${review.policyLabel}；${review.label}。${review.detail}\n` +
    (review.observation ? `观察区间${review.observation.from}至${review.observation.untilExclusive}（右端不含），${review.observation.timeZone}，${review.observation.precision === 'day' ? '整日候选' : '秒级时刻'}。\n` : '') +
    candidates.map(item => `${item.monthBranch}月原文${item.sourceText}：${item.from}至${item.untilExclusive}；${item.stem ? `司事干${item.stem}，十神${item.tenGod ?? '时辰未知，不认全日唯一十神'}；表层${item.surface.join('、') || '未见'}；日干同干参照${item.dayMasterSameStem ? '是' : '否'}；同干藏根${item.exactRoots.join('、') || '未见'}；同五行其他根${item.sameElementRoots.join('、') || '未见'}；保存月藏同干${item.monthHiddenMatch ? '有' : '无'}；格局同源候选${item.patternCandidates.map(candidate => candidate.label).join('、') || '无'}` : '具体天干未定，不列十神、透藏或格局连接'}。${item.note}`).join('\n') + `\n${review.comparisons.note}${review.comparisons.climatePeriod.note}原调候分支：${review.comparisons.climatePeriod.label}。${review.boundaries.join(' ')}`;
}
export function baziMonthCommandEvidence(review: BaziMonthCommandReview): BaziReadingEvidence[] {
  const sourceUrl = review.sources[0].url;
  return [
    { id: 'strength:month-command:policy', label: '司事分日的时间、口径与候选', details: describeBaziMonthCommandReview(review), family: 'strength', sourceUrl },
    ...review.segments.map(item => ({ id: item.evidenceId, label: `${item.monthBranch}月第${item.order}段原文${item.sourceText}`, details: `${item.from}至${item.untilExclusive}（右端不含）；原表第${item.fromDay}至${item.untilDay}满日；${item.overlapsObservation ? '与观察区间相交，仅作候选' : '不与观察区间相交'}。${item.note}；${item.stem ? `表层${item.surface.join('、') || '未见'}；同干根${item.exactRoots.join('、') || '未见'}；十神${item.tenGod ?? '未定位'}` : '具体天干与十神未定'}。`, family: 'strength' as const, sourceUrl })),
    { id: 'pattern:month-command:comparison', label: '司事与月令藏干、格局来源的分别核对', details: `${review.comparisons.note}月柱实际藏干：${review.comparisons.monthHiddenStems.map(item => item.stem).join('、')}；${review.segments.filter(item => item.overlapsObservation).map(item => `原文${item.sourceText}：${item.stem ? `月藏同干${item.monthHiddenMatch ? '有' : '无'}；同源格局候选${item.patternCandidates.map(candidate => candidate.label).join('、') || '无'}` : '未明具体干，不作格局连接'}`).join('；')}。不以司事定位替换本气、增加藏干或删改原格局候选，不宣告成格破格。`, family: 'pattern', sourceUrl },
    { id: 'climate:month-command:boundary', label: '司事分日与调候月内分支的边界', details: `${review.comparisons.climatePeriod.label}；${review.comparisons.climatePeriod.note}不能用本表替《穷通宝鉴》的上下半月或其他条件选择分支。`, family: 'climate', sourceUrl },
  ];
}
