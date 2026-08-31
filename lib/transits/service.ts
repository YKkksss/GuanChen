import { getConversation } from '@/lib/db/conversations';
import { getTransitSnapshot, upsertTransitSnapshot } from '@/lib/db/transits';
import {
  buildAnnualTransitSnapshot,
  buildDailyTransitSnapshot,
  buildMonthlyTransitSnapshot,
  DAILY_TRANSIT_ENGINE_VERSION,
  MONTHLY_TRANSIT_ENGINE_VERSION,
  resolveLunarYearMonthlyPeriods,
  resolveMonthlyTransitPeriod,
  TRANSIT_ENGINE_VERSION,
} from './engine';
import type {
  AnnualTransitSnapshot,
  DailyTransitSnapshot,
  MonthlyTransitSnapshot,
  MonthlyTransitYearOverview,
  TransitSnapshotRecord,
} from './types';

export function getOrCreateAnnualTransit(
  conversationId: string,
  selectedYear: number,
): TransitSnapshotRecord<AnnualTransitSnapshot> {
  const conversation = getConversation(conversationId);
  if (!conversation?.birthInfo || !conversation.chartSnapshot) {
    throw new Error('会话不存在或缺少命盘快照');
  }
  const latestYear = Math.min(conversation.birthInfo.year + 130, 2200);
  if (!Number.isInteger(selectedYear) || selectedYear < conversation.birthInfo.year || selectedYear > latestYear) {
    throw new Error(`年份必须在 ${conversation.birthInfo.year} 至 ${latestYear} 之间`);
  }

  const lookup = {
    conversationId,
    level: 'year' as const,
    targetDate: String(selectedYear),
    engineVersion: TRANSIT_ENGINE_VERSION,
  };
  const cached = getTransitSnapshot<AnnualTransitSnapshot>(lookup);
  if (cached) return cached;

  return upsertTransitSnapshot({
    ...lookup,
    snapshot: buildAnnualTransitSnapshot(conversation.chartSnapshot, selectedYear),
  });
}

export function getOrCreateMonthlyTransit(
  conversationId: string,
  targetDate: string,
): TransitSnapshotRecord<MonthlyTransitSnapshot> {
  const conversation = getConversation(conversationId);
  if (!conversation?.birthInfo || !conversation.chartSnapshot) {
    throw new Error('会话不存在或缺少命盘快照');
  }

  const minimumDate = [
    conversation.birthInfo.year,
    String(conversation.birthInfo.month).padStart(2, '0'),
    String(conversation.birthInfo.day).padStart(2, '0'),
  ].join('-');
  const maximumDate = `${Math.min(conversation.birthInfo.year + 130, 2200)}-12-31`;
  if (targetDate < minimumDate || targetDate > maximumDate) {
    throw new Error(`日期必须在 ${minimumDate} 至 ${maximumDate} 之间`);
  }
  const snapshot = buildMonthlyTransitSnapshot(conversation.chartSnapshot, targetDate);

  const lookup = {
    conversationId,
    level: 'month' as const,
    targetDate: snapshot.targetDate,
    engineVersion: MONTHLY_TRANSIT_ENGINE_VERSION,
  };
  const cached = getTransitSnapshot<MonthlyTransitSnapshot>(lookup);
  if (cached) return cached;
  return upsertTransitSnapshot({ ...lookup, snapshot });
}

export function getOrCreateDailyTransit(
  conversationId: string,
  targetDate: string,
): TransitSnapshotRecord<DailyTransitSnapshot> {
  const conversation = getConversation(conversationId);
  if (!conversation?.birthInfo || !conversation.chartSnapshot) {
    throw new Error('会话不存在或缺少命盘快照');
  }
  const minimumDate = [
    conversation.birthInfo.year,
    String(conversation.birthInfo.month).padStart(2, '0'),
    String(conversation.birthInfo.day).padStart(2, '0'),
  ].join('-');
  const maximumDate = `${Math.min(conversation.birthInfo.year + 130, 2200)}-12-31`;
  if (targetDate < minimumDate || targetDate > maximumDate) {
    throw new Error(`日期必须在 ${minimumDate} 至 ${maximumDate} 之间`);
  }

  const lookup = {
    conversationId,
    level: 'day' as const,
    targetDate,
    engineVersion: DAILY_TRANSIT_ENGINE_VERSION,
  };
  const cached = getTransitSnapshot<DailyTransitSnapshot>(lookup);
  if (cached) return cached;
  return upsertTransitSnapshot({
    ...lookup,
    snapshot: buildDailyTransitSnapshot(conversation.chartSnapshot, targetDate),
  });
}

export function getMonthlyTransitYearOverview(
  conversationId: string,
  lunarYear: number,
): MonthlyTransitYearOverview {
  const conversation = getConversation(conversationId);
  if (!conversation?.birthInfo || !conversation.chartSnapshot) {
    throw new Error('会话不存在或缺少命盘快照');
  }
  const minimumDate = [
    conversation.birthInfo.year,
    String(conversation.birthInfo.month).padStart(2, '0'),
    String(conversation.birthInfo.day).padStart(2, '0'),
  ].join('-');
  const maximumDate = `${Math.min(conversation.birthInfo.year + 130, 2200)}-12-31`;
  const minimumLunarYear = resolveMonthlyTransitPeriod(minimumDate).year;
  const maximumLunarYear = resolveMonthlyTransitPeriod(maximumDate).year;
  if (!Number.isInteger(lunarYear) || lunarYear < minimumLunarYear || lunarYear > maximumLunarYear) {
    throw new Error(`农历流年必须在 ${minimumLunarYear} 至 ${maximumLunarYear} 之间`);
  }

  const periods = resolveLunarYearMonthlyPeriods(lunarYear)
    .filter(period => period.endDate >= minimumDate && period.startDate <= maximumDate);
  const records = periods.map(period => getOrCreateMonthlyTransit(
    conversationId,
    period.startDate < minimumDate ? minimumDate : period.startDate,
  ));
  const firstPeriod = periods[0];
  const lastPeriod = periods[periods.length - 1];
  if (!firstPeriod || !lastPeriod) throw new Error('该农历流年没有可用的流月');

  const previousPeriods = lunarYear > minimumLunarYear
    ? resolveLunarYearMonthlyPeriods(lunarYear - 1)
    : [];
  const nextPeriods = lunarYear < maximumLunarYear
    ? resolveLunarYearMonthlyPeriods(lunarYear + 1)
    : [];
  const previousStartDate = previousPeriods.find(period => period.endDate >= minimumDate)?.startDate ?? null;
  const nextStartDate = nextPeriods.find(period => period.startDate <= maximumDate)?.startDate ?? null;

  return {
    level: 'month-year',
    lunarYear,
    startDate: firstPeriod.startDate < minimumDate ? minimumDate : firstPeriod.startDate,
    endDate: lastPeriod.endDate > maximumDate ? maximumDate : lastPeriod.endDate,
    monthCount: records.length,
    boundaryPolicy: 'lunar-year-first-day-to-next-lunar-year-eve',
    comparisonPolicy: 'user-selected-factual-difference',
    engineVersion: MONTHLY_TRANSIT_ENGINE_VERSION,
    previousYearStartDate: previousStartDate,
    nextYearStartDate: nextStartDate,
    months: records.map(record => ({
      snapshotId: record.id,
      targetDate: record.snapshot.targetDate,
      lunarMonth: record.snapshot.lunarMonth,
      nominalAge: record.snapshot.nominalAge,
      yearGanZhi: record.snapshot.year.ganZhi,
      flowMonth: record.snapshot.flowMonth,
      transformations: record.snapshot.transformations,
      keyPalaces: record.snapshot.keyPalaces,
      topicPalaces: record.snapshot.topicPalaces,
    })),
    evidence: [
      {
        id: 'monthly-year-boundary',
        label: '全年流月边界',
        source: 'project-rule',
        details: `按农历 ${lunarYear} 年正月初一至下一年正月初一前一日展开，共 ${records.length} 个流月。`,
      },
      {
        id: 'monthly-year-leap-rule',
        label: '闰月处理',
        source: 'project-rule',
        details: records.length === 13
          ? '本年包含闰月，时间轴保留全部 13 个真实流月。'
          : '本年无闰月，时间轴包含 12 个流月。',
      },
      {
        id: 'monthly-comparison-policy',
        label: '月份对比口径',
        source: 'project-rule',
        details: '由用户选择两个重点流月，只比较宫位、四化和结构差异，不自动评定吉凶或最佳月份。',
      },
    ],
  };
}
