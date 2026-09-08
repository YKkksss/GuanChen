import type { BaziAnnualTimelineResult } from './annual-timeline-types';
import type { BaziMonthDayTimelineResult } from './month-day-timeline-types';

/** 按快照时区生成墙钟字符串，与排期中的前闭后开区间直接比较。 */
function wallClock(asOf: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(asOf);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
}

/** 优先定位实际生效流年；无精确排期或超出范围时仅选择可浏览年份。 */
export function resolveInitialAnnualYear(result: BaziAnnualTimelineResult, asOf = new Date()): number {
  const at = wallClock(asOf, result.source.timeZoneId);
  const current = result.years.find(item => item.activeFrom && item.activeUntilExclusive
    && item.activeFrom <= at && at < item.activeUntilExclusive);
  return current?.year ?? Math.min(Math.max(Number(at.slice(0, 4)), result.range.startYear), result.range.endYear);
}

/** 消费引擎的实际流日区间，避免在页面重复推算晚子时与节界。 */
export function resolveInitialFlowDate(result: BaziMonthDayTimelineResult, asOf = new Date()): string {
  const at = wallClock(asOf, result.source.timeZoneId);
  return result.days.find(item => item.activeFrom <= at && at < item.activeUntilExclusive)?.effectiveDate
    ?? result.days[0]?.effectiveDate ?? '';
}
