import { Solar } from 'lunar-javascript';
import {
  BAZI_ANNUAL_TIMELINE_ENGINE_VERSION,
  BAZI_ANNUAL_TIMELINE_METHODOLOGY,
  BAZI_ANNUAL_TIMELINE_METHODOLOGY_VERSION,
} from './annual-timeline-methodology';
import type {
  BaziAnnualLuckSegment,
  BaziAnnualTimelineItem,
  BaziAnnualTimelineResult,
} from './annual-timeline-types';
import type { BaziLuckCycleResult } from './luck-cycle-types';
import type { BaziCalculationResult } from './types';

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const JIA_ZI = Array.from({ length: 60 }, (_, index) => `${STEMS[index % 10]}${BRANCHES[index % 12]}`);

interface SolarTermLike { toYmdHms(): string }
interface LunarAnnualLike {
  getJieQiTable(): Record<string, SolarTermLike>;
  getYearInGanZhiExact(): string;
}

interface AnnualBoundary { year: number; ganZhi: string; liChunAt: string }

export function calculateBaziAnnualTimeline(
  chart: BaziCalculationResult,
  luckCycles: BaziLuckCycleResult,
): BaziAnnualTimelineResult {
  const exactBoundary = BAZI_ANNUAL_TIMELINE_METHODOLOGY.policy.supportedTimezoneIds
    .includes(chart.input.timeZoneId as 'Asia/Shanghai');
  const startYear = resolveFirstAnnualYear(chart);
  const endYear = exactBoundary && luckCycles.status === 'complete'
    ? resolveLastAnnualYear(luckCycles)
    : startYear + BAZI_ANNUAL_TIMELINE_METHODOLOGY.policy.fallbackYears - 1;
  const source = {
    chartMethodologyVersion: chart.methodologyVersion,
    chartEngineVersion: chart.engineVersion,
    chartYearPillar: chart.pillars.year.ganZhi,
    birthAt: chart.input.birthTime ? `${chart.input.birthDate} ${chart.input.birthTime}` : null,
    timeZoneId: chart.input.timeZoneId,
    luckCycleMethodologyVersion: luckCycles.methodologyVersion,
    luckCycleEngineVersion: luckCycles.engineVersion,
    luckCycleStatus: luckCycles.status,
  };

  if (!exactBoundary) {
    const years = rangeYears(startYear, endYear).map(year => buildSequenceOnlyYear(year));
    return {
      ...baseResult(source, startYear, endYear, years),
      status: 'sequence_only_unsupported_timezone',
      capabilities: {
        annualGanZhi: true, exactLiChunBoundary: false, luckCycleOverlap: false,
        annualInterpretation: false, eventPrediction: false,
      },
      warnings: [`M9-5 v1 尚未校准 ${chart.input.timeZoneId} 的立春绝对时刻，仅提供流年干支顺序。`],
      boundary: '当前时区只提供流年干支顺序，不得补写立春时刻、大运归属、流年吉凶或具体事件。',
    };
  }

  const boundaries = new Map<number, AnnualBoundary>();
  for (let year = startYear; year <= endYear + 1; year += 1) boundaries.set(year, getAnnualBoundary(year));
  const canJoinLuckCycles = luckCycles.status === 'complete';
  const years = rangeYears(startYear, endYear).map(year => buildExactYear(
    boundaries.get(year)!, boundaries.get(year + 1)!, chart, luckCycles, canJoinLuckCycles,
  ));
  return {
    ...baseResult(source, startYear, endYear, years),
    status: canJoinLuckCycles ? 'complete' : 'annual_schedule_only',
    capabilities: {
      annualGanZhi: true, exactLiChunBoundary: true, luckCycleOverlap: canJoinLuckCycles,
      annualInterpretation: false, eventPrediction: false,
    },
    warnings: canJoinLuckCycles
      ? ['流年内若发生交运，系统按实际交运时刻拆段；本结果不表示任一流年或大运的吉凶。']
      : ['大运精确边界条件不足：仍保留立春流年时间轴，但不生成大运归属。'],
    boundary: canJoinLuckCycles
      ? '只计算流年立春区间及其与大运的时间交集，不解释旺衰、喜忌、吉凶或具体事件。'
      : '只计算流年立春区间；条件不足时不得补写大运归属、流年吉凶或具体事件。',
  };
}

function baseResult(
  source: BaziAnnualTimelineResult['source'],
  startYear: number,
  endYear: number,
  years: BaziAnnualTimelineItem[],
): Pick<BaziAnnualTimelineResult, 'methodologyVersion' | 'engineVersion' | 'calculatedAt' | 'source' | 'range' | 'years' | 'rulesApplied'> {
  return {
    methodologyVersion: BAZI_ANNUAL_TIMELINE_METHODOLOGY_VERSION,
    engineVersion: BAZI_ANNUAL_TIMELINE_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    source,
    range: { startYear, endYear, yearCount: years.length },
    years,
    rulesApplied: [
      '以精确立春时刻作为流年干支交接边界',
      '每个流年采用前闭后开的［本年立春、次年立春）区间',
      '以公历出生瞬间裁剪出生流年的有效起点',
      '按流年区间与已保存大运区间的实际交集确定归属',
      '同一流年跨越交运时刻时拆分为多个连续片段',
    ],
  };
}

function buildExactYear(
  boundary: AnnualBoundary,
  nextBoundary: AnnualBoundary,
  chart: BaziCalculationResult,
  luckCycles: BaziLuckCycleResult,
  canJoinLuckCycles: boolean,
): BaziAnnualTimelineItem {
  const birthAt = chart.input.birthTime ? `${chart.input.birthDate} ${chart.input.birthTime}` : null;
  const finalEnd = canJoinLuckCycles ? luckCycles.cycles.at(-1)?.endAtExclusive ?? null : null;
  const activeFrom = birthAt && birthAt > boundary.liChunAt ? birthAt : boundary.liChunAt;
  const activeUntilExclusive = finalEnd && finalEnd < nextBoundary.liChunAt ? finalEnd : nextBoundary.liChunAt;
  const hasActiveInterval = activeFrom < activeUntilExclusive;
  const segments = canJoinLuckCycles && hasActiveInterval
    ? buildLuckSegments(activeFrom, activeUntilExclusive, luckCycles)
    : [];
  return {
    year: boundary.year,
    ganZhi: boundary.ganZhi,
    stem: boundary.ganZhi[0],
    branch: boundary.ganZhi[1],
    liChunAt: boundary.liChunAt,
    nextLiChunAt: nextBoundary.liChunAt,
    activeFrom: hasActiveInterval ? activeFrom : null,
    activeUntilExclusive: hasActiveInterval ? activeUntilExclusive : null,
    startsBeforeBirth: birthAt ? boundary.liChunAt < birthAt : null,
    segments,
    crossesLuckCycleBoundary: segments.length > 1,
    scheduleStatus: canJoinLuckCycles ? 'established_with_luck_cycle' : 'established_without_luck_cycle',
  };
}

function buildLuckSegments(startAt: string, endAtExclusive: string, luckCycles: BaziLuckCycleResult): BaziAnnualLuckSegment[] {
  const segments: BaziAnnualLuckSegment[] = [];
  let cursor = startAt;
  for (const cycle of luckCycles.cycles) {
    if (!cycle.startAt || !cycle.endAtExclusive) continue;
    if (cycle.endAtExclusive <= cursor || cycle.startAt >= endAtExclusive) continue;
    if (cursor < cycle.startAt) {
      const preEnd = minDate(cycle.startAt, endAtExclusive);
      if (cursor < preEnd) segments.push({
        startAt: cursor, endAtExclusive: preEnd, kind: 'pre_luck',
        luckCycleIndex: null, luckCycleGanZhi: null, label: '交入首运前',
      });
      cursor = preEnd;
    }
    const segmentStart = maxDate(cursor, cycle.startAt);
    const segmentEnd = minDate(endAtExclusive, cycle.endAtExclusive);
    if (segmentStart < segmentEnd) segments.push({
      startAt: segmentStart,
      endAtExclusive: segmentEnd,
      kind: 'luck_cycle',
      luckCycleIndex: cycle.index,
      luckCycleGanZhi: cycle.ganZhi,
      label: `第 ${cycle.index} 步 ${cycle.ganZhi} 大运`,
    });
    cursor = maxDate(cursor, segmentEnd);
    if (cursor >= endAtExclusive) break;
  }
  if (cursor < endAtExclusive) segments.push({
    startAt: cursor, endAtExclusive, kind: 'pre_luck',
    luckCycleIndex: null, luckCycleGanZhi: null, label: '交入首运前',
  });
  return segments;
}

function resolveFirstAnnualYear(chart: BaziCalculationResult): number {
  const birthYear = Number(chart.input.birthDate.slice(0, 4));
  const target = chart.pillars.year.ganZhi;
  if (ganZhiForYear(birthYear) === target) return birthYear;
  if (ganZhiForYear(birthYear - 1) === target) return birthYear - 1;
  return birthYear;
}

function resolveLastAnnualYear(luckCycles: BaziLuckCycleResult): number {
  const finalEnd = luckCycles.cycles.at(-1)?.endAtExclusive;
  if (!finalEnd) throw new Error('完整大运结果缺少结束边界');
  const calendarYear = Number(finalEnd.slice(0, 4));
  return finalEnd <= getAnnualBoundary(calendarYear).liChunAt ? calendarYear - 1 : calendarYear;
}

function getAnnualBoundary(year: number): AnnualBoundary {
  const lunar = Solar.fromYmdHms(year, 7, 1, 12, 0, 0).getLunar() as unknown as LunarAnnualLike;
  const liChun = lunar.getJieQiTable()['立春'];
  if (!liChun) throw new Error(`无法取得 ${year} 年立春时刻`);
  return { year, ganZhi: lunar.getYearInGanZhiExact(), liChunAt: liChun.toYmdHms() };
}

function buildSequenceOnlyYear(year: number): BaziAnnualTimelineItem {
  const ganZhi = ganZhiForYear(year);
  return {
    year, ganZhi, stem: ganZhi[0], branch: ganZhi[1],
    liChunAt: null, nextLiChunAt: null, activeFrom: null, activeUntilExclusive: null,
    startsBeforeBirth: null, segments: [], crossesLuckCycleBoundary: false,
    scheduleStatus: 'provisional_sequence_only',
  };
}

function ganZhiForYear(year: number): string {
  return JIA_ZI[((year - 1984) % 60 + 60) % 60];
}

function rangeYears(startYear: number, endYear: number): number[] {
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

function minDate(a: string, b: string): string { return a < b ? a : b; }
function maxDate(a: string, b: string): string { return a > b ? a : b; }

export const getBaziAnnualBoundaryForTest = getAnnualBoundary;
