import { createHash, randomUUID } from 'node:crypto';
import { auditBaziMonthDayRelations } from '@/lib/bazi/month-day-relation-engine';
import {
  BAZI_MONTH_DAY_RELATION_ENGINE_VERSION,
  BAZI_MONTH_DAY_RELATION_METHODOLOGY_VERSION,
} from '@/lib/bazi/month-day-relation-methodology';
import type {
  BaziMonthDayRelationResult,
  BaziMonthDayRelationVersion,
} from '@/lib/bazi/month-day-relation-types';
import { getBaziChartVersion } from './bazi';
import { ensureBaziAnnualTimelineVersion } from './bazi-annual-timelines';
import { ensureBaziMonthDayTimelineVersion } from './bazi-month-day-timelines';
import { getDatabase } from './client';

interface MonthDayRelationRow {
  id: string;
  chart_version_id: string;
  month_day_timeline_version_id: string;
  target_date: string;
  methodology_version: string;
  engine_version: string;
  chart_fingerprint: string;
  month_day_timeline_fingerprint: string;
  month_day_relation_fingerprint: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

export function ensureBaziMonthDayRelationVersion(
  chartVersionId: string,
  requestedTargetDate?: string,
  requestedTargetYear?: number,
): BaziMonthDayRelationVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  if (requestedTargetDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedTargetDate)) {
    throw new Error('目标流日必须使用 YYYY-MM-DD 格式');
  }
  const annualTimeline = ensureBaziAnnualTimelineVersion(chart.id);
  const targetYear = requestedTargetYear
    ?? (requestedTargetDate ? resolveAnnualYearForDate(annualTimeline.result, requestedTargetDate) : undefined);
  const timeline = ensureBaziMonthDayTimelineVersion(chart.id, targetYear);
  const targetDate = requestedTargetDate ?? resolveDefaultRelationDate(timeline.result);

  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_relation_versions
    WHERE chart_version_id = ? AND month_day_timeline_version_id = ? AND target_date = ?
      AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id,
    timeline.id,
    targetDate,
    BAZI_MONTH_DAY_RELATION_METHODOLOGY_VERSION,
    BAZI_MONTH_DAY_RELATION_ENGINE_VERSION,
  ) as MonthDayRelationRow | undefined;
  if (existing) return mapMonthDayRelation(existing);

  const result = auditBaziMonthDayRelations(chart.result, timeline.result, targetDate);
  const id = randomUUID();
  const now = Date.now();
  const monthDayRelationFingerprint = fingerprintMonthDayRelation(
    chart.chartFingerprint,
    timeline.monthDayTimelineFingerprint,
    result,
  );
  getDatabase().prepare(`
    INSERT INTO bazi_month_day_relation_versions (
      id, chart_version_id, month_day_timeline_version_id, target_date,
      methodology_version, engine_version, chart_fingerprint,
      month_day_timeline_fingerprint, month_day_relation_fingerprint,
      result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    chart.id,
    timeline.id,
    targetDate,
    result.methodologyVersion,
    result.engineVersion,
    chart.chartFingerprint,
    timeline.monthDayTimelineFingerprint,
    monthDayRelationFingerprint,
    JSON.stringify(result),
    now,
    now,
  );
  return getBaziMonthDayRelationVersion(id)!;
}

export function getBaziMonthDayRelationVersion(id: string): BaziMonthDayRelationVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_month_day_relation_versions WHERE id = ?')
    .get(id) as MonthDayRelationRow | undefined;
  return row ? mapMonthDayRelation(row) : null;
}

export function getBaziMonthDayRelationForChartDate(
  chartVersionId: string,
  targetDate: string,
): BaziMonthDayRelationVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_relation_versions
    WHERE chart_version_id = ? AND target_date = ?
    ORDER BY updated_at DESC LIMIT 1
  `).get(chartVersionId, targetDate) as MonthDayRelationRow | undefined;
  return row ? mapMonthDayRelation(row) : null;
}

export function listBaziMonthDayRelationVersions(chartVersionId: string): BaziMonthDayRelationVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_relation_versions
    WHERE chart_version_id = ? ORDER BY target_date DESC, updated_at DESC
  `).all(chartVersionId) as MonthDayRelationRow[];
  return rows.map(mapMonthDayRelation);
}

function resolveAnnualYearForDate(
  annualTimeline: ReturnType<typeof ensureBaziAnnualTimelineVersion>['result'],
  targetDate: string,
): number {
  const noon = `${targetDate} 12:00:00`;
  const exact = annualTimeline.years.find(item =>
    item.liChunAt && item.nextLiChunAt && item.liChunAt <= noon && noon < item.nextLiChunAt,
  );
  if (exact) return exact.year;
  const calendarYear = Number(targetDate.slice(0, 4));
  return Math.min(annualTimeline.range.endYear, Math.max(annualTimeline.range.startYear, calendarYear));
}

function resolveDefaultRelationDate(
  timeline: ReturnType<typeof ensureBaziMonthDayTimelineVersion>['result'],
): string {
  if (!timeline.days.length) return `${timeline.source.targetYear}-07-01`;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(item => [item.type, item.value]));
  const offset = timeline.source.lateZiPolicy === 'next_day' && Number(parts.hour) >= 23 ? 1 : 0;
  const value = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offset));
  const today = `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  return timeline.days.some(item => item.effectiveDate === today) ? today : timeline.days[0].effectiveDate;
}

function fingerprintMonthDayRelation(
  chartFingerprint: string,
  monthDayTimelineFingerprint: string,
  result: BaziMonthDayRelationResult,
): string {
  return createHash('sha256').update(JSON.stringify({
    chartFingerprint,
    monthDayTimelineFingerprint,
    methodologyVersion: result.methodologyVersion,
    engineVersion: result.engineVersion,
    status: result.status,
    source: result.source,
    target: result.target,
    segments: result.segments,
    rulesApplied: result.rulesApplied,
    warnings: result.warnings,
    boundary: result.boundary,
  })).digest('hex');
}

function mapMonthDayRelation(row: MonthDayRelationRow): BaziMonthDayRelationVersion {
  return {
    id: row.id,
    chartVersionId: row.chart_version_id,
    monthDayTimelineVersionId: row.month_day_timeline_version_id,
    targetDate: row.target_date,
    methodologyVersion: row.methodology_version,
    engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint,
    monthDayTimelineFingerprint: row.month_day_timeline_fingerprint,
    monthDayRelationFingerprint: row.month_day_relation_fingerprint,
    result: JSON.parse(row.result_json) as BaziMonthDayRelationResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
