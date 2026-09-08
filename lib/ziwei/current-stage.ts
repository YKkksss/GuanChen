import { Lunar, Solar } from 'lunar-javascript';
import type { ZiweiChart } from './types';

/** 与运限引擎默认 normal 口径一致：农历年差加一，春节换岁。 */
export function getCurrentStage(
  chart: Pick<ZiweiChart, 'lunarInfo' | 'daXians'>,
  asOf: Date = new Date(),
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(asOf);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  const asOfDate = `${part('year')}-${part('month')}-${part('day')}`;
  const lunarYear = Solar.fromYmd(Number(part('year')), Number(part('month')), Number(part('day'))).getLunar().getYear();
  const currentAge = lunarYear - chart.lunarInfo.lunarYear + 1;
  const currentDaXianIndex = chart.daXians.findIndex(item => currentAge >= item.startAge && currentAge <= item.endAge);
  const currentDaXian = chart.daXians[currentDaXianIndex] ?? null;
  const startYear = currentDaXian ? chart.lunarInfo.lunarYear + currentDaXian.startAge - 1 : null;
  const endYear = currentDaXian ? chart.lunarInfo.lunarYear + currentDaXian.endAge - 1 : null;
  return {
    asOfDate, timeZone: 'Asia/Shanghai', ageConvention: '农历虚岁，春节换岁',
    currentAge, currentDaXianIndex, currentDaXian,
    period: startYear !== null && endYear !== null ? {
      startDate: Lunar.fromYmd(startYear, 1, 1).getSolar().toYmd(),
      endDate: previousDay(Lunar.fromYmd(endYear + 1, 1, 1).getSolar().toYmd()),
    } : null,
  };
}

/** 只刷新派生的当前阶段，不写回历史快照或重算本命星曜。 */
export function refreshChartStage(chart: ZiweiChart, asOf: Date = new Date()): ZiweiChart {
  const stage = getCurrentStage(chart, asOf);
  return {
    ...chart,
    currentAge: stage.currentAge,
    currentDaXianIndex: stage.currentDaXianIndex,
    palaces: chart.palaces.map(palace => ({
      ...palace, isCurrentDaXian: palace.branch === stage.currentDaXian?.palaceBranch,
    })),
  };
}

function previousDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}
