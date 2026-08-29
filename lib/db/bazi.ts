import { createHash, randomUUID } from 'node:crypto';
import { calculateBazi } from '@/lib/bazi/engine';
import { BAZI_LATE_ZI_POLICIES, BAZI_TIME_STANDARDS } from '@/lib/bazi/types';
import type {
  BaziBirthProfile,
  BaziBirthProfileDetail,
  BaziBirthProfileListItem,
  BaziChartVersion,
  BaziCalculationResult,
  BaziLateZiPolicy,
  BaziPillar,
  BaziTimeStandard,
  CreateBaziBirthProfileInput,
  CreateBaziChartVersionInput,
} from '@/lib/bazi/types';
import { getConversation } from './conversations';
import { getDatabase } from './client';

interface BirthProfileRow {
  id: string;
  display_name: string;
  birth_date: string;
  birth_time: string | null;
  gender: 'male' | 'female';
  unknown_time: number;
  timezone_id: string;
  longitude: number | null;
  location_label: string | null;
  notes: string | null;
  source_conversation_id: string | null;
  created_at: number;
  updated_at: number;
}

interface ChartVersionRow {
  id: string;
  birth_profile_id: string;
  input_fingerprint: string;
  chart_fingerprint: string;
  time_standard: BaziTimeStandard;
  late_zi_policy: BaziLateZiPolicy;
  methodology_version: string;
  engine_version: string;
  input_snapshot_json: string;
  effective_time_snapshot_json: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

export function createBaziBirthProfile(input: CreateBaziBirthProfileInput): BaziBirthProfileDetail {
  const profile = normalizeProfileInput(input);
  const result = calculateBazi({
    birthDate: profile.birthDate,
    birthTime: profile.birthTime ?? undefined,
    gender: profile.gender,
    unknownTime: profile.unknownTime,
    timeZoneId: profile.timeZoneId,
    longitude: profile.longitude ?? undefined,
    timeStandard: normalizeTimeStandard(input.initialChart.timeStandard),
    lateZiPolicy: normalizeLateZiPolicy(input.initialChart.lateZiPolicy),
  });
  const id = randomUUID();
  const now = Date.now();
  getDatabase().transaction(() => {
    getDatabase().prepare(`
      INSERT INTO bazi_birth_profiles (
        id, display_name, birth_date, birth_time, gender, unknown_time,
        timezone_id, longitude, location_label, notes, source_conversation_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, profile.displayName, profile.birthDate, profile.birthTime, profile.gender,
      profile.unknownTime ? 1 : 0, profile.timeZoneId, profile.longitude,
      profile.locationLabel, profile.notes, profile.sourceConversationId, now, now,
    );
    insertChartVersion(id, result, now);
  })();
  return getBaziBirthProfile(id)!;
}

export function listBaziBirthProfiles(input: { limit?: number; offset?: number } = {}): BaziBirthProfileListItem[] {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const rows = getDatabase().prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM bazi_chart_versions c WHERE c.birth_profile_id = p.id) AS chart_count,
      (SELECT c.id FROM bazi_chart_versions c WHERE c.birth_profile_id = p.id ORDER BY c.updated_at DESC LIMIT 1) AS latest_chart_id,
      (SELECT c.result_json FROM bazi_chart_versions c WHERE c.birth_profile_id = p.id ORDER BY c.updated_at DESC LIMIT 1) AS latest_result_json,
      (SELECT c.time_standard FROM bazi_chart_versions c WHERE c.birth_profile_id = p.id ORDER BY c.updated_at DESC LIMIT 1) AS latest_time_standard,
      (SELECT c.late_zi_policy FROM bazi_chart_versions c WHERE c.birth_profile_id = p.id ORDER BY c.updated_at DESC LIMIT 1) AS latest_late_zi_policy
    FROM bazi_birth_profiles p
    ORDER BY p.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as Array<BirthProfileRow & {
    chart_count: number;
    latest_chart_id: string | null;
    latest_result_json: string | null;
    latest_time_standard: BaziTimeStandard | null;
    latest_late_zi_policy: BaziLateZiPolicy | null;
  }>;
  return rows.map(row => ({
    ...mapProfile(row),
    chartCount: row.chart_count,
    latestChartId: row.latest_chart_id,
    latestPillars: row.latest_result_json ? formatPillars(JSON.parse(row.latest_result_json) as BaziCalculationResult) : null,
    latestTimeStandard: row.latest_time_standard,
    latestLateZiPolicy: row.latest_late_zi_policy,
  }));
}

export function getBaziBirthProfile(id: string): BaziBirthProfileDetail | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_birth_profiles WHERE id = ?')
    .get(id) as BirthProfileRow | undefined;
  if (!row) return null;
  return { ...mapProfile(row), charts: listBaziChartVersions(id) };
}

export function updateBaziBirthProfile(id: string, input: { displayName?: unknown; locationLabel?: unknown; notes?: unknown }): BaziBirthProfileDetail | null {
  const existing = getBaziBirthProfile(id);
  if (!existing) return null;
  const displayName = input.displayName === undefined
    ? existing.displayName
    : normalizeRequiredText(input.displayName, 80, '档案名称');
  const locationLabel = input.locationLabel === undefined
    ? existing.locationLabel
    : normalizeOptionalText(input.locationLabel, 120);
  const notes = input.notes === undefined ? existing.notes : normalizeOptionalText(input.notes, 1_000);
  getDatabase().prepare(`
    UPDATE bazi_birth_profiles
    SET display_name = ?, location_label = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(displayName, locationLabel, notes, Date.now(), id);
  return getBaziBirthProfile(id);
}

export function deleteBaziBirthProfile(id: string): boolean {
  return getDatabase().prepare('DELETE FROM bazi_birth_profiles WHERE id = ?').run(id).changes > 0;
}

export function createBaziChartVersion(profileId: string, input: CreateBaziChartVersionInput): BaziChartVersion {
  const profile = getBaziBirthProfile(profileId);
  if (!profile) throw new Error('出生档案不存在');
  const result = calculateBazi({
    birthDate: profile.birthDate,
    birthTime: profile.birthTime ?? undefined,
    gender: profile.gender,
    unknownTime: profile.unknownTime,
    timeZoneId: profile.timeZoneId,
    longitude: profile.longitude ?? undefined,
    timeStandard: normalizeTimeStandard(input.timeStandard),
    lateZiPolicy: normalizeLateZiPolicy(input.lateZiPolicy),
  });
  const inputFingerprint = fingerprintInput(result);
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_chart_versions WHERE birth_profile_id = ? AND input_fingerprint = ?
  `).get(profileId, inputFingerprint) as ChartVersionRow | undefined;
  if (existing) return mapChartVersion(existing);

  const now = Date.now();
  getDatabase().transaction(() => {
    insertChartVersion(profileId, result, now);
    getDatabase().prepare('UPDATE bazi_birth_profiles SET updated_at = ? WHERE id = ?').run(now, profileId);
  })();
  const inserted = getDatabase().prepare(`
    SELECT * FROM bazi_chart_versions WHERE birth_profile_id = ? AND input_fingerprint = ?
  `).get(profileId, inputFingerprint) as ChartVersionRow;
  return mapChartVersion(inserted);
}

export function listBaziChartVersions(profileId: string): BaziChartVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_chart_versions WHERE birth_profile_id = ? ORDER BY updated_at DESC
  `).all(profileId) as ChartVersionRow[];
  return rows.map(mapChartVersion);
}

export function getBaziChartVersion(id: string): BaziChartVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_chart_versions WHERE id = ?')
    .get(id) as ChartVersionRow | undefined;
  return row ? mapChartVersion(row) : null;
}

export function deleteBaziChartVersion(id: string): boolean {
  const existing = getBaziChartVersion(id);
  if (!existing) return false;
  const deleted = getDatabase().prepare('DELETE FROM bazi_chart_versions WHERE id = ?').run(id).changes > 0;
  if (deleted) getDatabase().prepare('UPDATE bazi_birth_profiles SET updated_at = ? WHERE id = ?').run(Date.now(), existing.birthProfileId);
  return deleted;
}

function insertChartVersion(profileId: string, result: BaziCalculationResult, now: number): string {
  const id = randomUUID();
  getDatabase().prepare(`
    INSERT INTO bazi_chart_versions (
      id, birth_profile_id, input_fingerprint, chart_fingerprint,
      time_standard, late_zi_policy, methodology_version, engine_version,
      input_snapshot_json, effective_time_snapshot_json, result_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, profileId, fingerprintInput(result), fingerprintChart(result),
    result.input.timeStandard, result.input.lateZiPolicy,
    result.methodologyVersion, result.engineVersion,
    JSON.stringify(result.input), JSON.stringify(result.effectiveTime), JSON.stringify(result),
    now, now,
  );
  return id;
}

function normalizeProfileInput(input: CreateBaziBirthProfileInput) {
  const unknownTime = input.unknownTime === true;
  const birthDate = normalizeDate(input.birthDate);
  const birthTime = unknownTime ? null : normalizeTime(input.birthTime);
  const longitude = input.longitude === undefined || input.longitude === null ? null : Number(input.longitude);
  if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw new Error('出生地经度必须在 -180 到 180 之间');
  const sourceConversationId = normalizeOptionalText(input.sourceConversationId, 100);
  if (sourceConversationId && !getConversation(sourceConversationId)) throw new Error('关联的紫微命盘不存在');
  if (input.gender !== 'male' && input.gender !== 'female') throw new Error('性别无效');
  const timeZoneId = normalizeRequiredText(input.timeZoneId || 'Asia/Shanghai', 100, '历史时区');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timeZoneId }).format(0);
  } catch {
    throw new Error(`无效的 IANA 时区标识：${timeZoneId}`);
  }
  return {
    displayName: normalizeRequiredText(input.displayName, 80, '档案名称'),
    birthDate,
    birthTime,
    gender: input.gender,
    unknownTime,
    timeZoneId,
    longitude,
    locationLabel: normalizeOptionalText(input.locationLabel, 120),
    notes: normalizeOptionalText(input.notes, 1_000),
    sourceConversationId,
  };
}

function normalizeDate(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error('出生日期必须使用 YYYY-MM-DD 格式');
  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2100 || check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) throw new Error('出生日期无效，支持范围为 1900-2100 年');
  return text;
}

function normalizeTime(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!match) throw new Error('出生时间必须使用 HH:mm 或 HH:mm:ss 格式');
  const hour = Number(match[1]); const minute = Number(match[2]); const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw new Error('出生时间无效');
  return `${match[1]}:${match[2]}:${String(second).padStart(2, '0')}`;
}

function normalizeTimeStandard(value?: BaziTimeStandard): BaziTimeStandard {
  const normalized = value ?? 'civil_time';
  if (!BAZI_TIME_STANDARDS.includes(normalized)) throw new Error('时间标准无效');
  return normalized;
}

function normalizeLateZiPolicy(value?: BaziLateZiPolicy): BaziLateZiPolicy {
  const normalized = value ?? 'same_day';
  if (!BAZI_LATE_ZI_POLICIES.includes(normalized)) throw new Error('晚子时规则无效');
  return normalized;
}

function fingerprintInput(result: BaziCalculationResult): string {
  return sha256({ methodologyVersion: result.methodologyVersion, engineVersion: result.engineVersion, input: result.input });
}

function fingerprintChart(result: BaziCalculationResult): string {
  return sha256({
    engineVersion: result.engineVersion,
    effectiveTime: { date: result.effectiveTime.date, time: result.effectiveTime.time, standard: result.effectiveTime.standard },
    pillars: result.pillars,
    dayMaster: result.dayMaster,
  });
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function formatPillars(result: BaziCalculationResult): string {
  return [result.pillars.year, result.pillars.month, result.pillars.day, result.pillars.time]
    .filter((pillar): pillar is BaziPillar => pillar !== null)
    .map(pillar => pillar.ganZhi)
    .join(' ');
}

function mapProfile(row: BirthProfileRow): BaziBirthProfile {
  return {
    id: row.id, displayName: row.display_name, birthDate: row.birth_date,
    birthTime: row.birth_time, gender: row.gender, unknownTime: row.unknown_time === 1,
    timeZoneId: row.timezone_id, longitude: row.longitude,
    locationLabel: row.location_label, notes: row.notes,
    sourceConversationId: row.source_conversation_id,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapChartVersion(row: ChartVersionRow): BaziChartVersion {
  return {
    id: row.id, birthProfileId: row.birth_profile_id,
    inputFingerprint: row.input_fingerprint, chartFingerprint: row.chart_fingerprint,
    timeStandard: row.time_standard, lateZiPolicy: row.late_zi_policy,
    methodologyVersion: row.methodology_version, engineVersion: row.engine_version,
    inputSnapshot: JSON.parse(row.input_snapshot_json) as BaziCalculationResult['input'],
    effectiveTimeSnapshot: JSON.parse(row.effective_time_snapshot_json) as BaziCalculationResult['effectiveTime'],
    result: JSON.parse(row.result_json) as BaziCalculationResult,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function normalizeRequiredText(value: unknown, maxLength: number, label: string): string {
  const text = typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  if (!text) throw new Error(`${label}不能为空`);
  return text;
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  const text = typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  return text || null;
}
