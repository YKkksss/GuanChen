import { Solar } from 'lunar-javascript';
import { resolveLunarYearMonthlyPeriods } from '@/lib/transits/engine';
import { beijingToday, clampCalendarDate } from '@/lib/fortune-calendar/dates';
import type { FortunePeriod } from './types';
export function lunarYearOf(date: string) { const [y, m, d] = date.split('-').map(Number); return Solar.fromYmd(y, m, d).getLunar().getYear(); }
export function parsePeriodKey(key: string) {
  const match = /^(year|month):(\d{4})(?:-(\d{2})(-leap)?)?$/.exec(key);
  if (!match || (match[1] === 'year' && match[3]) || (match[1] === 'month' && !match[3])) throw new Error('请指定有效的农历年份或月份');
  const year = Number(match[2]), month = Number(match[3]);
  if (year < 1900 || year > 2200 || (match[1] === 'month' && (month < 1 || month > 12))) throw new Error('年份或月份超出范围');
  return { level: match[1] as 'year' | 'month', year, month, leap: Boolean(match[4]) };
}
export function availableYears(minDate: string, maxDate: string) {
  const min = Math.max(1900, lunarYearOf(minDate)), max = Math.min(2200, lunarYearOf(maxDate));
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}
export function periodsForYear(year: number, minDate: string, maxDate: string): FortunePeriod[] {
  if (!availableYears(minDate, maxDate).includes(year)) throw new Error('该年份不在命盘的运限范围内');
  const months = resolveLunarYearMonthlyPeriods(year);
  const clip = (value: FortunePeriod) => ({ ...value, startDate: value.fullStartDate < minDate ? minDate : value.fullStartDate, endDate: value.fullEndDate > maxDate ? maxDate : value.fullEndDate });
  const annual: FortunePeriod = { key: `year:${year}`, level: 'year', year, label: `${year} 农历流年`, startDate: '', endDate: '', fullStartDate: months[0].startDate, fullEndDate: months.at(-1)!.endDate };
  return [clip(annual), ...months.filter(m => m.endDate >= minDate && m.startDate <= maxDate).map(m => clip({ key: `month:${year}-${String(m.month).padStart(2, '0')}${m.isLeap ? '-leap' : ''}`, level: 'month' as const, year, label: `${year} 年农历${m.label}`, startDate: '', endDate: '', fullStartDate: m.startDate, fullEndDate: m.endDate }))];
}
export function resolvePeriod(key: string, minDate: string, maxDate: string) {
  const parsed = parsePeriodKey(key), period = periodsForYear(parsed.year, minDate, maxDate).find(p => p.key === key);
  if (!period) throw new Error('该农历月不存在或不在命盘的运限范围内');
  return period;
}
export function defaultYear(minDate: string, maxDate: string) { return Math.max(1900, lunarYearOf(clampCalendarDate(beijingToday(), minDate, maxDate))); }
