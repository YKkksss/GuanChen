import { createHash, randomUUID } from 'node:crypto';
import {
  calculateBaziMonthDayTimeline,
  resolveDefaultMonthDayTargetYear,
} from '@/lib/bazi/month-day-timeline-engine';
import {
  BAZI_MONTH_DAY_TIMELINE_ENGINE_VERSION,
  BAZI_MONTH_DAY_TIMELINE_METHODOLOGY_VERSION,
} from '@/lib/bazi/month-day-timeline-methodology';
import type {
  BaziMonthDayTimelineResult,
  BaziMonthDayTimelineVersion,
} from '@/lib/bazi/month-day-timeline-types';
import { getBaziChartVersion } from './bazi';
import { ensureBaziAnnualTimelineVersion } from './bazi-annual-timelines';
import { getDatabase } from './client';

interface MonthDayTimelineRow {
  id: string;
  chart_version_id: string;
  annual_timeline_version_id: string;
  target_year: number;
  methodology_version: string;
  engine_version: string;
  chart_fingerprint: string;
  annual_timeline_fingerprint: string;
  month_day_timeline_fingerprint: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

export function ensureBaziMonthDayTimelineVersion(
  chartVersionId: string,
  requestedTargetYear?: number,
): BaziMonthDayTimelineVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const annualTimeline = ensureBaziAnnualTimelineVersion(chart.id);
  const targetYear = requestedTargetYear ?? resolveDefaultMonthDayTargetYear(annualTimeline.result);
  if (!Number.isInteger(targetYear)) throw new Error('目标流年必须是整数年份');
  if (targetYear < annualTimeline.result.range.startYear || targetYear > annualTimeline.result.range.endYear) {
    throw new Error(`目标流年 ${targetYear} 不在可用范围 ${annualTimeline.result.range.startYear}-${annualTimeline.result.range.endYear} 内`);
  }

  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_timeline_versions
    WHERE chart_version_id = ? AND annual_timeline_version_id = ? AND target_year = ?
      AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id,
    annualTimeline.id,
    targetYear,
    BAZI_MONTH_DAY_TIMELINE_METHODOLOGY_VERSION,
    BAZI_MONTH_DAY_TIMELINE_ENGINE_VERSION,
  ) as MonthDayTimelineRow | undefined;
  if (existing) return mapMonthDayTimeline(existing);

  const result = calculateBaziMonthDayTimeline(chart.result, annualTimeline.result, targetYear);
  const id = randomUUID();
  const now = Date.now();
  const monthDayTimelineFingerprint = fingerprintMonthDayTimeline(
    chart.chartFingerprint,
    annualTimeline.annualTimelineFingerprint,
    result,
  );
  getDatabase().prepare(`
    INSERT INTO bazi_month_day_timeline_versions (
      id, chart_version_id, annual_timeline_version_id, target_year,
      methodology_version, engine_version, chart_fingerprint,
      annual_timeline_fingerprint, month_day_timeline_fingerprint,
      result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    chart.id,
    annualTimeline.id,
    targetYear,
    result.methodologyVersion,
    result.engineVersion,
    chart.chartFingerprint,
    annualTimeline.annualTimelineFingerprint,
    monthDayTimelineFingerprint,
    JSON.stringify(result),
    now,
    now,
  );
  return getBaziMonthDayTimelineVersion(id)!;
}

export function getBaziMonthDayTimelineVersion(id: string): BaziMonthDayTimelineVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_month_day_timeline_versions WHERE id = ?')
    .get(id) as MonthDayTimelineRow | undefined;
  return row ? mapMonthDayTimeline(row) : null;
}

export function getBaziMonthDayTimelineForChartYear(
  chartVersionId: string,
  targetYear: number,
): BaziMonthDayTimelineVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_timeline_versions
    WHERE chart_version_id = ? AND target_year = ?
    ORDER BY updated_at DESC LIMIT 1
  `).get(chartVersionId, targetYear) as MonthDayTimelineRow | undefined;
  return row ? mapMonthDayTimeline(row) : null;
}

export function listBaziMonthDayTimelineVersions(chartVersionId: string): BaziMonthDayTimelineVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_timeline_versions
    WHERE chart_version_id = ? ORDER BY target_year DESC, updated_at DESC
  `).all(chartVersionId) as MonthDayTimelineRow[];
  return rows.map(mapMonthDayTimeline);
}

function fingerprintMonthDayTimeline(
  chartFingerprint: string,
  annualTimelineFingerprint: string,
  result: BaziMonthDayTimelineResult,
): string {
  return createHash('sha256').update(JSON.stringify({
    chartFingerprint,
    annualTimelineFingerprint,
    methodologyVersion: result.methodologyVersion,
    engineVersion: result.engineVersion,
    status: result.status,
    source: result.source,
    annualInterval: result.annualInterval,
    months: result.months,
    days: result.days,
    rulesApplied: result.rulesApplied,
    warnings: result.warnings,
    boundary: result.boundary,
  })).digest('hex');
}

function mapMonthDayTimeline(row: MonthDayTimelineRow): BaziMonthDayTimelineVersion {
  return {
    id: row.id,
    chartVersionId: row.chart_version_id,
    annualTimelineVersionId: row.annual_timeline_version_id,
    targetYear: row.target_year,
    methodologyVersion: row.methodology_version,
    engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint,
    annualTimelineFingerprint: row.annual_timeline_fingerprint,
    monthDayTimelineFingerprint: row.month_day_timeline_fingerprint,
    result: JSON.parse(row.result_json) as BaziMonthDayTimelineResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
