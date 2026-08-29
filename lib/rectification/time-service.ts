import { RECTIFICATION_TIME_POLICY_VERSION, getRectificationTimeSlot } from './methodology';
import type {
  RectificationTimeConversionSnapshot,
  RectificationTimeSlotKey,
  RectificationUtcCandidate,
} from './types';

export interface CivilTimeConversionInput {
  date: string;
  time: string;
  timeZoneId: string;
  longitude: number;
  preferredUtcOffsetMinutes?: number;
}

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const SLOT_BY_HOUR: RectificationTimeSlotKey[] = [
  'early_zi', 'chou', 'chou', 'yin', 'yin', 'mao', 'mao',
  'chen', 'chen', 'si', 'si', 'wu', 'wu', 'wei', 'wei',
  'shen', 'shen', 'you', 'you', 'xu', 'xu', 'hai', 'hai', 'late_zi',
];

/** 将历史民用时间按 IANA 时区和 NOAA 均时差公式换算为地方视太阳时。 */
export function convertCivilTimeToApparentSolar(
  input: CivilTimeConversionInput,
): RectificationTimeConversionSnapshot {
  const local = parseLocalDateTime(input.date, input.time);
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new Error('出生地经度必须在 -180 到 180 之间（东经为正）');
  }
  assertTimeZone(input.timeZoneId);

  const utcCandidates = resolveUtcCandidates(local, input.timeZoneId);
  if (!utcCandidates.length) {
    throw new Error('该民用时间位于夏令时跳过区间，在所选时区中不存在，请核对记录');
  }
  const selected = selectUtcCandidate(utcCandidates, input.preferredUtcOffsetMinutes);
  const localMinutes = local.hour * 60 + local.minute + local.second / 60;
  const equationOfTimeMinutes = calculateEquationOfTime(local);
  const longitudeCorrectionMinutes = input.longitude * 4 - selected.utcOffsetMinutes;
  const totalCorrectionMinutes = equationOfTimeMinutes + longitudeCorrectionMinutes;
  const localEpoch = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  const apparentEpoch = localEpoch + totalCorrectionMinutes * 60_000;
  const apparent = new Date(apparentEpoch);
  const apparentMinutes = apparent.getUTCHours() * 60 + apparent.getUTCMinutes() + apparent.getUTCSeconds() / 60;
  const apparentHour = apparent.getUTCHours();
  const slot = getRectificationTimeSlot(SLOT_BY_HOUR[apparentHour]);
  const sourceDateEpoch = Date.UTC(local.year, local.month - 1, local.day);
  const apparentDateEpoch = Date.UTC(apparent.getUTCFullYear(), apparent.getUTCMonth(), apparent.getUTCDate());

  return {
    sourceDate: formatDate(local.year, local.month, local.day),
    sourceTime: formatTime(local.hour, local.minute, local.second),
    timeZoneId: input.timeZoneId,
    longitude: input.longitude,
    localTimeStatus: utcCandidates.length > 1 ? 'ambiguous' : 'unique',
    utcCandidates,
    selectedUtcIso: selected.utcIso,
    selectedUtcOffsetMinutes: selected.utcOffsetMinutes,
    equationOfTimeMinutes: round6(equationOfTimeMinutes),
    longitudeCorrectionMinutes: round6(longitudeCorrectionMinutes),
    totalCorrectionMinutes: round6(totalCorrectionMinutes),
    apparentSolarDate: formatDate(apparent.getUTCFullYear(), apparent.getUTCMonth() + 1, apparent.getUTCDate()),
    apparentSolarTime: formatTime(apparent.getUTCHours(), apparent.getUTCMinutes(), apparent.getUTCSeconds()),
    apparentSolarMinutes: round6(apparentMinutes),
    dayOffset: Math.round((apparentDateEpoch - sourceDateEpoch) / 86_400_000),
    slotKey: slot.key,
    branchIndex: slot.branchIndex,
    engineTimeIndex: slot.engineTimeIndex,
    timePolicyVersion: RECTIFICATION_TIME_POLICY_VERSION,
    timezoneDatabaseVersion: process.versions.tz ?? null,
    warnings: [
      ...(local.year < 1970 ? ['IANA 时区数据库对 1970 年前的历史记录覆盖不完全，需要人工核验当地法定时间。'] : []),
      ...(utcCandidates.length > 1 ? ['该民用时间处于夏令时回拨重复区间，快照已保存人工选择的 UTC 偏移。'] : []),
    ],
  };
}

function parseLocalDateTime(date: string, time: string): LocalDateTimeParts {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dateMatch || !timeMatch) throw new Error('民用时间必须使用 YYYY-MM-DD 和 HH:mm[:ss] 格式');
  const parts = {
    year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]), minute: Number(timeMatch[2]), second: Number(timeMatch[3] ?? 0),
  };
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  if (parts.year < 1900 || parts.year > 2100
    || check.getUTCFullYear() !== parts.year || check.getUTCMonth() + 1 !== parts.month
    || check.getUTCDate() !== parts.day || check.getUTCHours() !== parts.hour
    || check.getUTCMinutes() !== parts.minute || check.getUTCSeconds() !== parts.second) {
    throw new Error('民用日期或时间不是有效值，支持范围为 1900-2100 年');
  }
  return parts;
}

function assertTimeZone(timeZoneId: string) {
  if (!timeZoneId?.trim()) throw new Error('必须提供 IANA 时区标识');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timeZoneId }).format(0);
  } catch {
    throw new Error(`无效的 IANA 时区标识：${timeZoneId}`);
  }
}

function resolveUtcCandidates(local: LocalDateTimeParts, timeZoneId: string): RectificationUtcCandidate[] {
  const nominalUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  const offsets = new Set<number>();
  for (let deltaHours = -48; deltaHours <= 48; deltaHours += 6) {
    offsets.add(getUtcOffsetMinutes(nominalUtc + deltaHours * 3_600_000, timeZoneId));
  }
  return [...offsets]
    .map(offset => ({ utcEpoch: nominalUtc - offset * 60_000, utcOffsetMinutes: offset }))
    .filter(candidate => sameLocalParts(formatInTimeZone(candidate.utcEpoch, timeZoneId), local))
    .sort((a, b) => a.utcEpoch - b.utcEpoch)
    .map(candidate => ({
      utcIso: new Date(candidate.utcEpoch).toISOString(),
      utcOffsetMinutes: candidate.utcOffsetMinutes,
    }));
}

function selectUtcCandidate(candidates: RectificationUtcCandidate[], preferred?: number): RectificationUtcCandidate {
  if (candidates.length === 1) return candidates[0];
  if (preferred === undefined) {
    throw new Error(`该民用时间在夏令时回拨中出现两次，请通过 preferredUtcOffsetMinutes 指定：${candidates.map(item => item.utcOffsetMinutes).join(' 或 ')}`);
  }
  const selected = candidates.find(item => item.utcOffsetMinutes === preferred);
  if (!selected) throw new Error('指定的 UTC 偏移不属于该民用时间的有效候选');
  return selected;
}

function getUtcOffsetMinutes(epoch: number, timeZoneId: string): number {
  const local = formatInTimeZone(epoch, timeZoneId);
  const representedAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return Math.round((representedAsUtc - Math.floor(epoch / 1000) * 1000) / 60_000);
}

function formatInTimeZone(epoch: number, timeZoneId: string): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZoneId,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const values = Object.fromEntries(
    formatter.formatToParts(new Date(epoch))
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)]),
  );
  return {
    year: values.year, month: values.month, day: values.day,
    hour: values.hour, minute: values.minute, second: values.second,
  };
}

function sameLocalParts(a: LocalDateTimeParts, b: LocalDateTimeParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
    && a.hour === b.hour && a.minute === b.minute && a.second === b.second;
}

function calculateEquationOfTime(local: LocalDateTimeParts): number {
  const current = Date.UTC(local.year, local.month - 1, local.day);
  const yearStart = Date.UTC(local.year, 0, 1);
  const dayOfYear = Math.floor((current - yearStart) / 86_400_000) + 1;
  const hour = local.hour + local.minute / 60 + local.second / 3600;
  const daysInYear = isLeapYear(local.year) ? 366 : 365;
  const gamma = 2 * Math.PI / daysInYear * (dayOfYear - 1 + (hour - 12) / 24);
  return 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatTime(hour: number, minute: number, second: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
