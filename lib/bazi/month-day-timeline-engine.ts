import { Solar } from 'lunar-javascript';
import {
  BAZI_MONTH_DAY_TIMELINE_ENGINE_VERSION,
  BAZI_MONTH_DAY_TIMELINE_METHODOLOGY,
  BAZI_MONTH_DAY_TIMELINE_METHODOLOGY_VERSION,
} from './month-day-timeline-methodology';
import type {
  BaziFlowDayItem,
  BaziFlowMonthItem,
  BaziMonthDayTimelineResult,
  BaziMonthDayTimelineSegment,
} from './month-day-timeline-types';
import type { BaziAnnualTimelineItem, BaziAnnualTimelineResult } from './annual-timeline-types';
import type { BaziCalculationResult, BaziLateZiPolicy } from './types';

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const MONTH_BRANCHES = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const JIE_NAMES = ['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒'];

interface SolarTermLike { toYmdHms(): string }
interface LunarTimelineLike {
  getJieQiTable(): Record<string, SolarTermLike>;
  getMonthInGanZhiExact(): string;
  getDayInGanZhiExact(): string;
  getDayInGanZhiExact2(): string;
}

interface ExactMonthBoundary {
  index: number;
  jieName: string;
  startAt: string;
  endAtExclusive: string;
  ganZhi: string;
}

export function calculateBaziMonthDayTimeline(
  chart: BaziCalculationResult,
  annualTimeline: BaziAnnualTimelineResult,
  targetYear: number,
): BaziMonthDayTimelineResult {
  const annual = annualTimeline.years.find(item => item.year === targetYear);
  if (!annual) {
    throw new Error(`目标流年 ${targetYear} 不在可用范围 ${annualTimeline.range.startYear}-${annualTimeline.range.endYear} 内`);
  }

  const exactBoundary = BAZI_MONTH_DAY_TIMELINE_METHODOLOGY.policy.supportedTimezoneIds
    .includes(chart.input.timeZoneId as 'Asia/Shanghai')
    && Boolean(annual.liChunAt && annual.nextLiChunAt);
  if (!exactBoundary) return buildSequenceOnlyResult(chart, annualTimeline, annual);

  const exactMonths = buildExactMonthBoundaries(targetYear);
  const months = exactMonths.map(item => buildExactMonth(item, annual));
  const days = annual.activeFrom && annual.activeUntilExclusive
    ? buildFlowDays(chart.input.lateZiPolicy, annual, months)
    : [];
  const hasLuck = annual.segments.some(segment => segment.kind === 'luck_cycle');
  return {
    ...baseResult(chart, annualTimeline, annual, months, days),
    status: hasLuck ? 'complete' : 'calendar_only_without_luck',
    capabilities: {
      monthGanZhi: true,
      exactJieBoundary: true,
      dayGanZhi: true,
      lateZiBoundary: true,
      luckCycleOverlap: hasLuck,
      interpretation: false,
      eventPrediction: false,
    },
    warnings: hasLuck
      ? ['流日跨越节界或交运时刻时会保留多个分段；时间归属不代表吉凶。']
      : ['大运归属条件不足：仍提供精确流月与流日边界，但不补写大运归属。'],
    boundary: '只计算流月、流日的干支、精确节界、晚子时边界及其时间交集，不解释旺衰、喜忌、吉凶或具体事件。',
  };
}

function baseResult(
  chart: BaziCalculationResult,
  annualTimeline: BaziAnnualTimelineResult,
  annual: BaziAnnualTimelineItem,
  months: BaziFlowMonthItem[],
  days: BaziFlowDayItem[],
): Pick<BaziMonthDayTimelineResult,
  'methodologyVersion' | 'engineVersion' | 'calculatedAt' | 'source' | 'annualInterval' |
  'counts' | 'months' | 'days' | 'rulesApplied'> {
  return {
    methodologyVersion: BAZI_MONTH_DAY_TIMELINE_METHODOLOGY_VERSION,
    engineVersion: BAZI_MONTH_DAY_TIMELINE_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    source: {
      chartMethodologyVersion: chart.methodologyVersion,
      chartEngineVersion: chart.engineVersion,
      annualTimelineMethodologyVersion: annualTimeline.methodologyVersion,
      annualTimelineEngineVersion: annualTimeline.engineVersion,
      annualTimelineStatus: annualTimeline.status,
      targetYear: annual.year,
      targetYearGanZhi: annual.ganZhi,
      timeZoneId: chart.input.timeZoneId,
      lateZiPolicy: chart.input.lateZiPolicy,
    },
    annualInterval: {
      year: annual.year,
      ganZhi: annual.ganZhi,
      liChunAt: annual.liChunAt,
      nextLiChunAt: annual.nextLiChunAt,
      activeFrom: annual.activeFrom,
      activeUntilExclusive: annual.activeUntilExclusive,
    },
    counts: {
      months: months.length,
      days: days.length,
      monthBoundaryDays: days.filter(item => item.crossesMonthBoundary).length,
      luckBoundaryDays: days.filter(item => item.crossesLuckCycleBoundary).length,
    },
    months,
    days,
    rulesApplied: [
      '流月按十二个节的精确交接时刻划分，采用前闭后开区间',
      `流日继承命盘晚子时口径：${chart.input.lateZiPolicy === 'next_day' ? '23 点起按次日' : '23 点仍按当天'}`,
      '流月、流日均裁剪到所选流年的有效区间',
      '流日跨越节界或交运时刻时按实际边界拆段',
      '本结果只保存时间事实，不生成吉凶与事件结论',
    ],
  };
}

function buildSequenceOnlyResult(
  chart: BaziCalculationResult,
  annualTimeline: BaziAnnualTimelineResult,
  annual: BaziAnnualTimelineItem,
): BaziMonthDayTimelineResult {
  const months = buildSequenceOnlyMonths(annual);
  return {
    ...baseResult(chart, annualTimeline, annual, months, []),
    status: 'sequence_only_unsupported_timezone',
    capabilities: {
      monthGanZhi: true,
      exactJieBoundary: false,
      dayGanZhi: false,
      lateZiBoundary: false,
      luckCycleOverlap: false,
      interpretation: false,
      eventPrediction: false,
    },
    warnings: [`M9-14 v1 尚未校准 ${chart.input.timeZoneId} 的精确节界与换日时刻，仅提供十二流月干支顺序。`],
    boundary: '当前时区只提供流月干支顺序，不得补写节界时刻、流日、大运归属、吉凶或具体事件。',
  };
}

function buildExactMonthBoundaries(year: number): ExactMonthBoundary[] {
  const starts = JIE_NAMES.map((jieName, index) => ({
    jieName,
    at: getJieAt(index === 11 ? year + 1 : year, jieName),
  }));
  const nextLiChun = getJieAt(year + 1, '立春');
  return starts.map((item, index) => {
    const endAtExclusive = starts[index + 1]?.at ?? nextLiChun;
    const ganZhi = getExactMonthGanZhi(addWallClockSeconds(item.at, 1));
    return { index: index + 1, jieName: item.jieName, startAt: item.at, endAtExclusive, ganZhi };
  });
}

function buildExactMonth(boundary: ExactMonthBoundary, annual: BaziAnnualTimelineItem): BaziFlowMonthItem {
  const activeFrom = annual.activeFrom ? maxDate(boundary.startAt, annual.activeFrom) : null;
  const activeUntilExclusive = annual.activeUntilExclusive
    ? minDate(boundary.endAtExclusive, annual.activeUntilExclusive)
    : null;
  const hasActiveInterval = Boolean(activeFrom && activeUntilExclusive && activeFrom < activeUntilExclusive);
  const segments = hasActiveInterval
    ? buildMonthSegments(activeFrom!, activeUntilExclusive!, boundary.index, boundary.ganZhi, annual)
    : [];
  return {
    index: boundary.index,
    jieName: boundary.jieName,
    ganZhi: boundary.ganZhi,
    stem: boundary.ganZhi[0],
    branch: boundary.ganZhi[1],
    startAt: boundary.startAt,
    endAtExclusive: boundary.endAtExclusive,
    activeFrom: hasActiveInterval ? activeFrom : null,
    activeUntilExclusive: hasActiveInterval ? activeUntilExclusive : null,
    segments,
    crossesLuckCycleBoundary: uniqueLuckSegments(segments).size > 1,
    scheduleStatus: 'established',
  };
}

function buildMonthSegments(
  startAt: string,
  endAtExclusive: string,
  monthIndex: number,
  monthGanZhi: string,
  annual: BaziAnnualTimelineItem,
): BaziMonthDayTimelineSegment[] {
  if (!annual.segments.length) {
    return [{
      startAt,
      endAtExclusive,
      monthIndex,
      monthGanZhi,
      luckCycleIndex: null,
      luckCycleGanZhi: null,
      label: '大运归属未生成',
    }];
  }
  return annual.segments.flatMap(segment => {
    const segmentStart = maxDate(startAt, segment.startAt);
    const segmentEnd = minDate(endAtExclusive, segment.endAtExclusive);
    if (segmentStart >= segmentEnd) return [];
    return [{
      startAt: segmentStart,
      endAtExclusive: segmentEnd,
      monthIndex,
      monthGanZhi,
      luckCycleIndex: segment.luckCycleIndex,
      luckCycleGanZhi: segment.luckCycleGanZhi,
      label: segment.label,
    }];
  });
}

function buildFlowDays(
  lateZiPolicy: BaziLateZiPolicy,
  annual: BaziAnnualTimelineItem,
  months: BaziFlowMonthItem[],
): BaziFlowDayItem[] {
  const annualStart = annual.activeFrom!;
  const annualEnd = annual.activeUntilExclusive!;
  const firstCandidate = addCalendarDays(annualStart.slice(0, 10), -1);
  const finalCandidate = addCalendarDays(annualEnd.slice(0, 10), 1);
  const days: BaziFlowDayItem[] = [];
  let effectiveDate = firstCandidate;
  while (effectiveDate <= finalCandidate) {
    const interval = getDayInterval(effectiveDate, lateZiPolicy);
    const activeFrom = maxDate(interval.startAt, annualStart);
    const activeUntilExclusive = minDate(interval.endAtExclusive, annualEnd);
    if (activeFrom < activeUntilExclusive) {
      const segments = months.flatMap(month => month.segments.flatMap(segment => {
        const segmentStart = maxDate(activeFrom, segment.startAt);
        const segmentEnd = minDate(activeUntilExclusive, segment.endAtExclusive);
        return segmentStart < segmentEnd ? [{ ...segment, startAt: segmentStart, endAtExclusive: segmentEnd }] : [];
      }));
      const ganZhi = getExactDayGanZhi(`${effectiveDate} 12:00:00`, lateZiPolicy);
      days.push({
        index: days.length + 1,
        effectiveDate,
        ganZhi,
        stem: ganZhi[0],
        branch: ganZhi[1],
        startAt: interval.startAt,
        endAtExclusive: interval.endAtExclusive,
        activeFrom,
        activeUntilExclusive,
        segments,
        crossesMonthBoundary: new Set(segments.map(item => item.monthIndex)).size > 1,
        crossesLuckCycleBoundary: uniqueLuckSegments(segments).size > 1,
      });
    }
    effectiveDate = addCalendarDays(effectiveDate, 1);
  }
  return days;
}

function getDayInterval(effectiveDate: string, policy: BaziLateZiPolicy): { startAt: string; endAtExclusive: string } {
  if (policy === 'next_day') {
    return {
      startAt: `${addCalendarDays(effectiveDate, -1)} 23:00:00`,
      endAtExclusive: `${effectiveDate} 23:00:00`,
    };
  }
  return {
    startAt: `${effectiveDate} 00:00:00`,
    endAtExclusive: `${addCalendarDays(effectiveDate, 1)} 00:00:00`,
  };
}

function buildSequenceOnlyMonths(annual: BaziAnnualTimelineItem): BaziFlowMonthItem[] {
  const yearStemIndex = STEMS.indexOf(annual.stem);
  const firstMonthStemIndex = ((yearStemIndex % 5) * 2 + 2) % 10;
  return JIE_NAMES.map((jieName, index) => {
    const ganZhi = `${STEMS[(firstMonthStemIndex + index) % 10]}${MONTH_BRANCHES[index]}`;
    return {
      index: index + 1,
      jieName,
      ganZhi,
      stem: ganZhi[0],
      branch: ganZhi[1],
      startAt: null,
      endAtExclusive: null,
      activeFrom: null,
      activeUntilExclusive: null,
      segments: [],
      crossesLuckCycleBoundary: false,
      scheduleStatus: 'provisional_sequence_only' as const,
    };
  });
}

function getJieAt(year: number, jieName: string): string {
  const lunar = Solar.fromYmdHms(year, 7, 1, 12, 0, 0).getLunar() as unknown as LunarTimelineLike;
  const jie = lunar.getJieQiTable()[jieName];
  if (!jie) throw new Error(`无法取得 ${year} 年${jieName}时刻`);
  return jie.toYmdHms();
}

function getExactMonthGanZhi(at: string): string {
  const lunar = solarFromWallClock(at).getLunar() as unknown as LunarTimelineLike;
  return lunar.getMonthInGanZhiExact();
}

function getExactDayGanZhi(at: string, policy: BaziLateZiPolicy): string {
  const lunar = solarFromWallClock(at).getLunar() as unknown as LunarTimelineLike;
  return policy === 'next_day' ? lunar.getDayInGanZhiExact() : lunar.getDayInGanZhiExact2();
}

function solarFromWallClock(at: string) {
  const [date, time] = at.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second] = time.split(':').map(Number);
  return Solar.fromYmdHms(year, month, day, hour, minute, second);
}

function addWallClockSeconds(at: string, seconds: number): string {
  const [date, time] = at.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second] = time.split(':').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute, second + seconds));
  return `${formatDate(value)} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return formatDate(new Date(Date.UTC(year, month - 1, day + days)));
}

function formatDate(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

function pad(value: number): string { return String(value).padStart(2, '0'); }
function minDate(a: string, b: string): string { return a < b ? a : b; }
function maxDate(a: string, b: string): string { return a > b ? a : b; }
function uniqueLuckSegments(segments: BaziMonthDayTimelineSegment[]): Set<string> {
  return new Set(segments.map(item => `${item.luckCycleIndex ?? 'none'}:${item.luckCycleGanZhi ?? item.label}`));
}

export function resolveDefaultMonthDayTargetYear(annualTimeline: BaziAnnualTimelineResult): number {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(item => [item.type, item.value]));
  const now = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  const exact = annualTimeline.years.find(item =>
    item.liChunAt && item.nextLiChunAt && item.liChunAt <= now && now < item.nextLiChunAt,
  );
  if (exact) return exact.year;
  const nowYear = Number(parts.year);
  return Math.min(annualTimeline.range.endYear, Math.max(annualTimeline.range.startYear, nowYear));
}

export const getBaziJieAtForTest = getJieAt;
