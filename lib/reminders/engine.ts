import type {
  ReminderCandidate,
  ReminderConfig,
  ReminderGenerationContext,
  ReminderInstancePayload,
  ReminderKind,
} from './types';

export const REMINDER_ENGINE_VERSION = 'reminder-v1';
export const DEFAULT_REMINDER_TIMEZONE = 'Asia/Shanghai';

export function buildReminderCandidates(input: {
  title: string;
  kind: ReminderKind;
  timezone: string;
  config: ReminderConfig;
  context?: ReminderGenerationContext;
  windowStart: string;
  windowEnd: string;
}): ReminderCandidate[] {
  validateDateKey(input.windowStart, '窗口开始日期');
  validateDateKey(input.windowEnd, '窗口结束日期');
  if (input.windowStart > input.windowEnd) throw new Error('提醒生成窗口的开始日期不能晚于结束日期');
  validateTimezone(input.timezone);
  const anchors = input.kind === 'monthly_review'
    ? monthlyAnchors(input.config, input.windowStart, input.windowEnd)
    : input.kind === 'birthday_review'
      ? birthdayAnchors(input.config, input.context, input.windowStart, input.windowEnd)
      : input.kind === 'transit_change'
        ? transitAnchors(input.config, input.context, input.windowStart, input.windowEnd)
        : input.kind === 'event_anniversary'
          ? eventAnchors(input.config, input.context, input.windowStart, input.windowEnd)
          : customAnchors(input.config, input.windowStart, input.windowEnd);

  return anchors.map(anchor => {
    const config = input.config;
    const dueDate = shiftDateKey(anchor.scheduledFor, -anchor.leadDays);
    return {
      occurrenceKey: anchor.occurrenceKey,
      scheduledFor: anchor.scheduledFor,
      dueAt: zonedDateTimeToEpoch(dueDate, config.hour, config.minute, input.timezone),
      title: anchor.title ?? input.title,
      payload: {
        kind: input.kind,
        sourceLabel: anchor.sourceLabel,
        boundaryNote: anchor.boundaryNote,
        conversationId: input.context?.conversationId ?? null,
        eventId: input.context?.eventId ?? null,
        stageIndex: anchor.stageIndex,
        stageLabel: anchor.stageLabel,
      },
    };
  }).sort((left, right) => left.dueAt - right.dueAt);
}

interface Anchor {
  occurrenceKey: string;
  scheduledFor: string;
  leadDays: number;
  title?: string;
  sourceLabel: string;
  boundaryNote: string;
  stageIndex?: number;
  stageLabel?: string;
}

function monthlyAnchors(config: ReminderConfig, start: string, end: string): Anchor[] {
  if (config.kind !== 'monthly_review') throw new Error('月度复盘提醒配置类型不匹配');
  const startParts = parseDateKey(start);
  const endParts = parseDateKey(end);
  const result: Anchor[] = [];
  let year = startParts.year;
  let month = startParts.month;
  while (year < endParts.year || (year === endParts.year && month <= endParts.month)) {
    const day = Math.min(config.dayOfMonth, daysInMonth(year, month));
    const date = dateKey(year, month, day);
    if (date >= start && date <= end) {
      result.push({ occurrenceKey: date, scheduledFor: date, leadDays: 0, sourceLabel: `${year}年${month}月月度复盘`, boundaryNote: '按本地日历月生成，不代表命理时间边界。' });
    }
    month += 1;
    if (month === 13) { month = 1; year += 1; }
  }
  return result;
}

function birthdayAnchors(config: ReminderConfig, context: ReminderGenerationContext | undefined, start: string, end: string): Anchor[] {
  if (config.kind !== 'birthday_review') throw new Error('生日回顾提醒配置类型不匹配');
  const birthDate = context?.birthDate;
  if (!birthDate) throw new Error('生日回顾提醒需要关联包含出生日期的单人命盘');
  return yearlyAnchors(birthDate.month, birthDate.day, config.leadDays, start, end, year => ({
    occurrenceKey: String(year),
    sourceLabel: `${year}年生日年度回顾`,
    boundaryNote: '按档案中的公历生日生成；只用于年度回顾提醒。',
  }));
}

function transitAnchors(config: ReminderConfig, context: ReminderGenerationContext | undefined, start: string, end: string): Anchor[] {
  if (config.kind !== 'transit_change') throw new Error('运限切换提醒配置类型不匹配');
  const birthDate = context?.birthDate;
  if (!birthDate) throw new Error('运限切换提醒需要关联包含出生日期的单人命盘');
  if (config.level === 'annual') {
    return yearlyAnchors(1, 1, config.leadDays, start, end, year => ({
      occurrenceKey: `annual:${year}`,
      sourceLabel: `${year}年度分析观察期`,
      boundaryNote: '按公历年度切换生成提醒；年度命盘仍使用项目既有代表日与边界策略计算。',
    }));
  }
  const result: Anchor[] = [];
  for (const [index, stage] of (context?.daXians ?? []).entries()) {
    const year = birthDate.year + stage.startAge;
    const scheduledFor = safeAnnualDate(year, birthDate.month, birthDate.day);
    if (scheduledFor < start || scheduledFor > end) continue;
    result.push({
      occurrenceKey: `daxian:${index}:${scheduledFor}`,
      scheduledFor,
      leadDays: config.leadDays,
      title: `${stage.startAge}-${stage.endAge}岁大限阶段提醒`,
      sourceLabel: `${stage.startAge}-${stage.endAge}岁 · ${stage.palaceName}`,
      boundaryNote: '按项目公历年龄口径，将大限起始年龄映射到出生周年；用于观察提醒，不替代精确历法校核。',
      stageIndex: index,
      stageLabel: `${stage.startAge}-${stage.endAge}岁 · ${stage.palaceName}`,
    });
  }
  return result;
}

function eventAnchors(config: ReminderConfig, context: ReminderGenerationContext | undefined, start: string, end: string): Anchor[] {
  if (config.kind !== 'event_anniversary') throw new Error('事件周年提醒配置类型不匹配');
  const eventDate = context?.eventDate;
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    throw new Error('事件周年提醒只能关联日期精度为“日”的已确认事件');
  }
  const parts = parseDateKey(eventDate);
  return yearlyAnchors(parts.month, parts.day, config.leadDays, start, end, year => ({
    occurrenceKey: String(year),
    sourceLabel: `${year}年事件周年回顾`,
    boundaryNote: '按已确认事件的公历日期生成；提醒只用于回顾，不推断事件会重复发生。',
  }));
}

function customAnchors(config: ReminderConfig, start: string, end: string): Anchor[] {
  if (config.kind !== 'custom') throw new Error('自定义提醒配置类型不匹配');
  validateDateKey(config.date, '自定义提醒日期');
  if (config.recurrence === 'none') {
    return config.date >= start && config.date <= end ? [{
      occurrenceKey: config.date, scheduledFor: config.date, leadDays: 0,
      sourceLabel: '自定义一次性提醒', boundaryNote: '由用户设置的本地提醒日期。',
    }] : [];
  }
  const parts = parseDateKey(config.date);
  if (config.recurrence === 'yearly') {
    return yearlyAnchors(parts.month, parts.day, 0, start, end, year => ({
      occurrenceKey: String(year), sourceLabel: '自定义每年提醒', boundaryNote: '由用户设置的本地年度重复规则。',
    }));
  }
  return monthlyAnchors({ ...config, kind: 'monthly_review', dayOfMonth: parts.day }, start, end)
    .map(anchor => ({ ...anchor, sourceLabel: '自定义每月提醒', boundaryNote: '由用户设置的本地月度重复规则。' }));
}

function yearlyAnchors(
  month: number,
  day: number,
  leadDays: number,
  start: string,
  end: string,
  describe: (year: number) => Pick<Anchor, 'occurrenceKey' | 'sourceLabel' | 'boundaryNote'>,
): Anchor[] {
  const startYear = parseDateKey(start).year - 1;
  const endYear = parseDateKey(end).year + 1;
  const result: Anchor[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const scheduledFor = safeAnnualDate(year, month, day);
    const dueDate = shiftDateKey(scheduledFor, -leadDays);
    if (dueDate < start || dueDate > end) continue;
    result.push({ ...describe(year), scheduledFor, leadDays });
  }
  return result;
}

export function getDateKeyInTimezone(timestamp: number, timezone: string): string {
  validateTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function shiftDateKey(value: string, days: number): string {
  const parts = parseDateKey(value);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return dateKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export function zonedDateTimeToEpoch(date: string, hour: number, minute: number, timezone: string): number {
  const parts = parseDateKey(date);
  validateClock(hour, minute);
  validateTimezone(timezone);
  const targetAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, 0, 0);
  let guess = targetAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shown = zonedParts(guess, timezone);
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, 0, 0);
    const correction = targetAsUtc - shownAsUtc;
    if (correction === 0) return guess;
    guess += correction;
  }
  return guess;
}

function zonedParts(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(timestamp));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

export function validateReminderConfig(kind: ReminderKind, config: ReminderConfig): void {
  if (!config || typeof config !== 'object') throw new Error('提醒配置不能为空');
  if (config.kind !== kind) throw new Error('提醒类型与配置不匹配');
  validateClock(config.hour, config.minute);
  if (config.kind === 'monthly_review' && (!Number.isInteger(config.dayOfMonth) || config.dayOfMonth < 1 || config.dayOfMonth > 31)) {
    throw new Error('每月提醒日期必须在 1 到 31 日之间');
  }
  if ('leadDays' in config && (!Number.isInteger(config.leadDays) || config.leadDays < 0 || config.leadDays > 60)) {
    throw new Error('提前天数必须在 0 到 60 天之间');
  }
  if (config.kind === 'transit_change' && config.level !== 'annual' && config.level !== 'daxian') {
    throw new Error('运限提醒层级无效');
  }
  if (config.kind === 'custom') {
    validateDateKey(config.date, '自定义提醒日期');
    if (config.recurrence !== 'none' && config.recurrence !== 'monthly' && config.recurrence !== 'yearly') {
      throw new Error('自定义提醒重复方式无效');
    }
  }
}

function validateClock(hour: number, minute: number) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error('提醒时间格式不正确');
  }
}

export function validateTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('zh-CN', { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error('提醒时区无效');
  }
}

function validateDateKey(value: string, label: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`${label}格式不正确`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) || dateKey(year, month, day) !== value) {
    throw new Error(`${label}不是有效日期`);
  }
}

function parseDateKey(value: string) {
  validateDateKey(value, '日期');
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)), day: Number(value.slice(8, 10)) };
}

function safeAnnualDate(year: number, month: number, day: number) {
  return dateKey(year, month, Math.min(day, daysInMonth(year, month)));
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateKey(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
