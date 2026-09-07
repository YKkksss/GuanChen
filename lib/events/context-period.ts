import type { TransitSnapshot } from '@/lib/transits/types';
import type { LifeEvent } from './types';

export interface EventContextPeriod {
  level: 'year' | 'month' | 'day';
  startDate: string;
  endDate: string;
}

export function getEventContextPeriods(snapshots: TransitSnapshot[]): EventContextPeriod[] {
  return snapshots.map(snapshot => snapshot.level === 'year'
    ? { level: 'year', startDate: `${snapshot.targetDate}-01-01`, endDate: `${snapshot.targetDate}-12-31` }
    : snapshot.level === 'month'
      ? { level: 'month', startDate: snapshot.lunarMonth.startDate, endDate: snapshot.lunarMonth.endDate }
      : { level: 'day', startDate: snapshot.targetDate, endDate: snapshot.targetDate });
}

/** 流月使用引擎提供的农历月边界；粗日期不能伪装成精确发生日。 */
export function matchEventContextPeriod(event: LifeEvent, periods: EventContextPeriod[]): 'exact' | 'possible' | null {
  if (!event.confirmedByUser || event.datePrecision === 'unknown') return null;
  let start = event.startDate;
  let end = event.endDate ?? start;
  if (event.datePrecision === 'year') { start += '-01-01'; end = `${event.startDate}-12-31`; }
  if (event.datePrecision === 'month') {
    const [year, month] = event.startDate.split('-').map(Number);
    start += '-01';
    end = `${event.startDate}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
  }
  let possible = false;
  for (const period of periods) {
    if (period.level !== 'year' && event.datePrecision === 'year') continue;
    if (period.level === 'day' && event.datePrecision === 'month') continue;
    if (start > period.endDate || end < period.startDate) continue;
    if (period.level === 'month' && event.datePrecision === 'month'
      && (start < period.startDate || end > period.endDate)) possible = true;
    else return 'exact';
  }
  return possible ? 'possible' : null;
}
