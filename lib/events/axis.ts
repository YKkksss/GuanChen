import type { LifeEventWithTransits } from './types';

export type LifeEventAxisMode = 'calendar_year' | 'nominal_age';

export interface LifeEventAxisGroup<T> {
  key: string;
  calendarYear: number | null;
  nominalAge: number | null;
  events: T[];
}

export interface LifeEventAxisSpan {
  startYear: number;
  endYear: number;
  startNominalAge: number;
  endNominalAge: number;
}

type AxisEvent = Pick<LifeEventWithTransits, 'startDate' | 'endDate' | 'datePrecision'>;

/**
 * 人生事件年龄轴沿用流年模块的一年一岁口径：出生自然年为虚岁一岁。
 * 这里是展示索引，不替代周岁，也不细分公历年内的生日或农历新年边界。
 */
export function calculateNominalAge(calendarYear: number, birthYear: number): number | null {
  if (!Number.isInteger(calendarYear) || !Number.isInteger(birthYear) || calendarYear < birthYear) {
    return null;
  }
  return calendarYear - birthYear + 1;
}

export function getLifeEventStartYear(event: Pick<AxisEvent, 'startDate'>): number | null {
  if (!/^\d{4}(?:-|$)/.test(event.startDate)) return null;
  const year = Number.parseInt(event.startDate.slice(0, 4), 10);
  return Number.isInteger(year) ? year : null;
}

export function buildLifeEventAxisGroups<T extends Pick<AxisEvent, 'startDate'>>(
  events: T[],
  birthYear: number,
): LifeEventAxisGroup<T>[] {
  const groups = new Map<string, LifeEventAxisGroup<T>>();
  events.forEach(event => {
    const calendarYear = getLifeEventStartYear(event);
    const key = calendarYear === null ? 'unknown' : String(calendarYear);
    const group = groups.get(key) ?? {
      key,
      calendarYear,
      nominalAge: calendarYear === null ? null : calculateNominalAge(calendarYear, birthYear),
      events: [],
    };
    group.events.push(event);
    groups.set(key, group);
  });

  return Array.from(groups.values()).sort((left, right) => {
    if (left.calendarYear === null) return 1;
    if (right.calendarYear === null) return -1;
    return left.calendarYear - right.calendarYear;
  });
}

export function getLifeEventAxisSpan(
  events: Array<Pick<AxisEvent, 'startDate' | 'endDate' | 'datePrecision'>>,
  birthYear: number,
): LifeEventAxisSpan | null {
  const years = events
    .flatMap(event => {
      const startYear = getLifeEventStartYear(event);
      const endYear = event.datePrecision === 'range' && event.endDate
        ? Number.parseInt(event.endDate.slice(0, 4), 10)
        : null;
      return [startYear, Number.isInteger(endYear) ? endYear : null];
    })
    .filter((year): year is number => year !== null)
    .sort((left, right) => left - right);
  if (years.length === 0) return null;
  const startYear = years[0];
  const endYear = years[years.length - 1];
  const startNominalAge = calculateNominalAge(startYear, birthYear);
  const endNominalAge = calculateNominalAge(endYear, birthYear);
  if (startNominalAge === null || endNominalAge === null) return null;
  return { startYear, endYear, startNominalAge, endNominalAge };
}

export function formatLifeEventNominalAge(event: AxisEvent, birthYear: number): string {
  const startYear = getLifeEventStartYear(event);
  if (startYear === null) return '年龄不详';
  const startAge = calculateNominalAge(startYear, birthYear);
  if (startAge === null) return '年龄不详';
  if (event.datePrecision !== 'range' || !event.endDate) return `虚岁 ${startAge}`;

  const endYear = Number.parseInt(event.endDate.slice(0, 4), 10);
  const endAge = calculateNominalAge(endYear, birthYear);
  if (endAge === null || endAge === startAge) return `虚岁 ${startAge}`;
  return `虚岁 ${startAge}–${endAge}`;
}

export function formatLifeEventAxisGroup(
  group: Pick<LifeEventAxisGroup<unknown>, 'calendarYear' | 'nominalAge'>,
  mode: LifeEventAxisMode,
) {
  if (group.calendarYear === null || group.nominalAge === null) {
    return { primary: '日期不详', secondary: '未纳入年龄索引' };
  }
  return mode === 'nominal_age'
    ? { primary: `虚岁 ${group.nominalAge}`, secondary: `${group.calendarYear} 年` }
    : { primary: String(group.calendarYear), secondary: `虚岁 ${group.nominalAge}` };
}

export function formatLifeEventAxisSpan(span: LifeEventAxisSpan, mode: LifeEventAxisMode): string {
  if (mode === 'nominal_age') {
    return span.startNominalAge === span.endNominalAge
      ? `虚岁 ${span.startNominalAge}`
      : `虚岁 ${span.startNominalAge}–${span.endNominalAge}`;
  }
  return span.startYear === span.endYear
    ? `${span.startYear} 年`
    : `${span.startYear}–${span.endYear} 年`;
}
