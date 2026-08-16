import { createHash, randomUUID } from 'node:crypto';
import { getConversation } from '@/lib/db/conversations';
import {
  deleteRectificationSession,
  getRectificationSession,
  insertRectificationSession,
  listRectificationSessions,
} from '@/lib/db/rectifications';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import {
  RECTIFICATION_METHODOLOGY,
  RECTIFICATION_METHODOLOGY_VERSION,
  RECTIFICATION_TIME_POLICY_VERSION,
  getRectificationTimeSlot,
} from './methodology';
import { convertCivilTimeToApparentSolar } from './time-service';
import {
  RECTIFICATION_TIME_SLOT_KEYS,
  type CreateRectificationSessionInput,
  type RectificationCandidate,
  type RectificationReportedTimeEvidence,
  type RectificationSession,
  type RectificationSessionDetail,
  type RectificationSessionListItem,
  type RectificationStatus,
  type RectificationTimeConversionSnapshot,
  type RectificationTimeSlotKey,
} from './types';

const VALID_TIME_SOURCES = new Set([
  'birth_certificate', 'hospital_record', 'household_record', 'family_written_record',
  'family_memory', 'self_memory', 'unknown',
]);
const VALID_TIME_PRECISIONS = new Set(['exact', 'approximate', 'range', 'period', 'unknown']);

export function createRectificationSession(
  input: CreateRectificationSessionInput,
): RectificationSessionDetail {
  const normalized = validateCreateInput(input);
  const sessionId = randomUUID();
  const now = Date.now();
  const timeConversion = buildTimeConversion(normalized.baseBirthInfo, normalized.evidence, input.preferredUtcOffsetMinutes);
  const firstByFingerprint = new Map<string, string>();

  const candidates = normalized.slotKeys.map((slotKey): RectificationCandidate => {
    const slot = getRectificationTimeSlot(slotKey);
    const candidateId = randomUUID();
    const usesConvertedDate = timeConversion?.slotKey === slotKey;
    const chartDate = usesConvertedDate
      ? timeConversion.apparentSolarDate
      : toDateString(normalized.baseBirthInfo.year, normalized.baseBirthInfo.month, normalized.baseBirthInfo.day);
    const dayOffset = usesConvertedDate ? timeConversion.dayOffset : 0;
    const [year, month, day] = chartDate.split('-').map(Number);
    const birthInfo: BirthInfo = {
      ...normalized.baseBirthInfo,
      year,
      month,
      day,
      hour: slot.engineTimeIndex,
      unknownTime: false,
    };
    const chartSnapshot = generateChart(birthInfo);
    const chartFingerprint = fingerprintChart(chartSnapshot, chartDate, dayOffset);
    const duplicateOfCandidateId = firstByFingerprint.get(chartFingerprint) ?? null;
    if (!duplicateOfCandidateId) firstByFingerprint.set(chartFingerprint, candidateId);
    return {
      id: candidateId,
      sessionId,
      slotKey,
      branchIndex: slot.branchIndex,
      engineTimeIndex: slot.engineTimeIndex,
      chartDate,
      dayOffset,
      chartFingerprint,
      chartSnapshot,
      duplicateOfCandidateId,
      relativeEvidenceIndex: null,
      rank: null,
      confidence: 'low',
      createdAt: now,
      updatedAt: now,
    };
  });

  const session: RectificationSession = {
    id: sessionId,
    sourceConversationId: normalized.sourceConversationId,
    title: normalized.title,
    status: 'ready',
    baseBirthInfo: normalized.baseBirthInfo,
    reportedTimeEvidence: normalized.evidence,
    timeConversion,
    methodologyVersion: RECTIFICATION_METHODOLOGY_VERSION,
    timePolicyVersion: RECTIFICATION_TIME_POLICY_VERSION,
    chartEngineVersion: RECTIFICATION_METHODOLOGY.chartEngineVersion,
    transitEngineVersion: RECTIFICATION_METHODOLOGY.transitEngineVersion,
    selectedCandidateId: null,
    createdAt: now,
    updatedAt: now,
  };
  return insertRectificationSession({ session, candidates });
}

export function findRectificationSession(id: string): RectificationSessionDetail | null {
  return getRectificationSession(id);
}

export function findRectificationSessions(input: {
  status?: RectificationStatus;
  sourceConversationId?: string;
  limit?: number;
} = {}): RectificationSessionListItem[] {
  return listRectificationSessions(input);
}

export function removeRectificationSession(id: string): boolean {
  return deleteRectificationSession(id);
}

function validateCreateInput(input: CreateRectificationSessionInput) {
  if (!input || typeof input !== 'object' || !input.baseBirthInfo) throw new Error('缺少基础出生信息');
  const base = input.baseBirthInfo;
  assertValidDate(base.year, base.month, base.day);
  if (base.gender !== 'male' && base.gender !== 'female') throw new Error('性别必须为 male 或 female');
  if (base.longitude !== undefined && (!Number.isFinite(base.longitude) || base.longitude < -180 || base.longitude > 180)) {
    throw new Error('基础出生信息中的经度必须在 -180 到 180 之间');
  }
  if (input.preferredUtcOffsetMinutes !== undefined
    && (!Number.isInteger(input.preferredUtcOffsetMinutes)
      || input.preferredUtcOffsetMinutes < -900 || input.preferredUtcOffsetMinutes > 900)) {
    throw new Error('preferredUtcOffsetMinutes 必须是 -900 到 900 之间的整数');
  }
  const sourceConversationId = cleanOptionalString(input.sourceConversationId, 80);
  if (sourceConversationId && !getConversation(sourceConversationId)) throw new Error('关联的对话不存在');
  const fallbackTitle = `${cleanOptionalString(base.name, 30) ?? toDateString(base.year, base.month, base.day)}的出生时辰校正`;
  const title = cleanOptionalString(input.title, 80) ?? fallbackTitle;
  const slotKeys = normalizeSlotKeys(input.candidateSlotKeys);
  const evidence = normalizeEvidence(input.reportedTimeEvidence);
  return {
    sourceConversationId,
    title,
    baseBirthInfo: {
      year: base.year,
      month: base.month,
      day: base.day,
      gender: base.gender,
      ...(cleanOptionalString(base.name, 30) ? { name: cleanOptionalString(base.name, 30)! } : {}),
      ...(cleanOptionalString(base.province, 40) ? { province: cleanOptionalString(base.province, 40)! } : {}),
      ...(cleanOptionalString(base.city, 40) ? { city: cleanOptionalString(base.city, 40)! } : {}),
      ...(Number.isFinite(base.longitude) ? { longitude: base.longitude } : {}),
    } as Omit<BirthInfo, 'hour' | 'unknownTime'>,
    slotKeys,
    evidence,
  };
}

function normalizeSlotKeys(keys?: RectificationTimeSlotKey[]): RectificationTimeSlotKey[] {
  const result = keys ?? [...RECTIFICATION_TIME_SLOT_KEYS];
  const valid = new Set<string>(RECTIFICATION_TIME_SLOT_KEYS);
  if (!Array.isArray(result) || result.length < 2 || result.length > 13) throw new Error('候选时段数量必须在 2 至 13 个之间');
  if (result.some(key => !valid.has(key))) throw new Error('候选时段包含未知值');
  if (new Set(result).size !== result.length) throw new Error('候选时段不能重复');
  return [...result].sort((a, b) => getRectificationTimeSlot(a).engineTimeIndex - getRectificationTimeSlot(b).engineTimeIndex);
}

function normalizeEvidence(input: Partial<RectificationReportedTimeEvidence> = {}): RectificationReportedTimeEvidence {
  const source = input.source ?? 'unknown';
  if (!VALID_TIME_SOURCES.has(source)) throw new Error('出生时间来源无效');
  const reportedStartLocal = normalizeClock(input.reportedStartLocal);
  const reportedEndLocal = normalizeClock(input.reportedEndLocal);
  if (reportedEndLocal && !reportedStartLocal) throw new Error('提供时间范围结束值时必须同时提供开始值');
  const inferredPrecision = !reportedStartLocal ? 'unknown' : reportedEndLocal && reportedEndLocal !== reportedStartLocal ? 'range' : 'exact';
  const precision = input.precision ?? inferredPrecision;
  if (!VALID_TIME_PRECISIONS.has(precision)) throw new Error('出生时间精度类型无效');
  if (precision === 'unknown' && reportedStartLocal) throw new Error('时间精度为 unknown 时不能提供具体时间');
  if ((precision === 'range' || precision === 'period') && !reportedEndLocal) throw new Error('范围或时段证据必须同时提供开始和结束时间');
  const longitude = input.longitude ?? null;
  const latitude = input.latitude ?? null;
  if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw new Error('经度必须在 -180 到 180 之间');
  if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw new Error('纬度必须在 -90 到 90 之间');
  return {
    source,
    precision,
    reportedStartLocal,
    reportedEndLocal,
    timezoneId: cleanOptionalString(input.timezoneId, 100),
    longitude,
    latitude,
    notes: cleanOptionalString(input.notes, 500),
  };
}

function buildTimeConversion(
  base: Omit<BirthInfo, 'hour' | 'unknownTime'>,
  evidence: RectificationReportedTimeEvidence,
  preferredUtcOffsetMinutes?: number,
): RectificationTimeConversionSnapshot | null {
  if (!evidence.reportedStartLocal || !evidence.timezoneId || evidence.longitude === null) return null;
  if (evidence.precision !== 'exact' && evidence.precision !== 'approximate') return null;
  return convertCivilTimeToApparentSolar({
    date: toDateString(base.year, base.month, base.day),
    time: evidence.reportedStartLocal,
    timeZoneId: evidence.timezoneId,
    longitude: evidence.longitude,
    preferredUtcOffsetMinutes,
  });
}

function fingerprintChart(chart: ZiweiChart, chartDate: string, dayOffset: number): string {
  const stable = {
    chartDate,
    dayOffset,
    lunarInfo: chart.lunarInfo,
    mingGongBranch: chart.mingGongBranch,
    shenGongBranch: chart.shenGongBranch,
    wuxingJu: chart.wuxingJu,
    ziweiPos: chart.ziweiPos,
    palaces: chart.palaces.map(palace => ({
      branch: palace.branch,
      stem: palace.stem,
      name: palace.name,
      stars: palace.stars.map(star => ({ name: star.name, type: star.type, siHua: star.siHua ?? null, brightness: star.brightness ?? null })),
      daXianAge: palace.daXianAge ?? null,
      isMingGong: palace.isMingGong ?? false,
      isShenGong: palace.isShenGong ?? false,
      borrowedFromBranch: palace.borrowedFromBranch ?? null,
    })),
    daXians: chart.daXians,
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function assertValidDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isInteger(year) || year < 1900 || year > 2100
    || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error('出生日期无效，支持范围为 1900-2100 年');
  }
}

function normalizeClock(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] ?? 0) > 59) {
    throw new Error('出生时间必须使用 HH:mm 或 HH:mm:ss 格式');
  }
  return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
}

function cleanOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) throw new Error(`文本长度不能超过 ${maxLength} 个字符`);
  return cleaned;
}

function toDateString(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
