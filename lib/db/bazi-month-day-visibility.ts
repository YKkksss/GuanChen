import { createHash, randomUUID } from 'node:crypto';
import { auditBaziMonthDayVisibilityConditions } from '@/lib/bazi/month-day-visibility-engine';
import {
  BAZI_MONTH_DAY_VISIBILITY_ENGINE_VERSION,
  BAZI_MONTH_DAY_VISIBILITY_METHODOLOGY_VERSION,
} from '@/lib/bazi/month-day-visibility-methodology';
import type {
  BaziMonthDayVisibilityResult,
  BaziMonthDayVisibilityVersion,
} from '@/lib/bazi/month-day-visibility-types';
import { getBaziChartVersion } from './bazi';
import { ensureBaziMonthDayRelationVersion } from './bazi-month-day-relations';
import { getDatabase } from './client';

interface MonthDayVisibilityRow {
  id: string;
  chart_version_id: string;
  month_day_relation_version_id: string;
  target_date: string;
  methodology_version: string;
  engine_version: string;
  chart_fingerprint: string;
  month_day_relation_fingerprint: string;
  month_day_visibility_fingerprint: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

export function ensureBaziMonthDayVisibilityVersion(
  chartVersionId: string,
  requestedTargetDate?: string,
  requestedTargetYear?: number,
): BaziMonthDayVisibilityVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const relation = ensureBaziMonthDayRelationVersion(chart.id, requestedTargetDate, requestedTargetYear);
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_visibility_versions
    WHERE chart_version_id = ? AND month_day_relation_version_id = ? AND target_date = ?
      AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id,
    relation.id,
    relation.targetDate,
    BAZI_MONTH_DAY_VISIBILITY_METHODOLOGY_VERSION,
    BAZI_MONTH_DAY_VISIBILITY_ENGINE_VERSION,
  ) as MonthDayVisibilityRow | undefined;
  if (existing) return mapMonthDayVisibility(existing);

  const result = auditBaziMonthDayVisibilityConditions(chart.result, relation.result);
  const id = randomUUID();
  const now = Date.now();
  const monthDayVisibilityFingerprint = fingerprintMonthDayVisibility(
    chart.chartFingerprint,
    relation.monthDayRelationFingerprint,
    result,
  );
  getDatabase().prepare(`
    INSERT INTO bazi_month_day_visibility_versions (
      id, chart_version_id, month_day_relation_version_id, target_date,
      methodology_version, engine_version, chart_fingerprint,
      month_day_relation_fingerprint, month_day_visibility_fingerprint,
      result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    chart.id,
    relation.id,
    relation.targetDate,
    result.methodologyVersion,
    result.engineVersion,
    chart.chartFingerprint,
    relation.monthDayRelationFingerprint,
    monthDayVisibilityFingerprint,
    JSON.stringify(result),
    now,
    now,
  );
  return getBaziMonthDayVisibilityVersion(id)!;
}

export function getBaziMonthDayVisibilityVersion(id: string): BaziMonthDayVisibilityVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_month_day_visibility_versions WHERE id = ?')
    .get(id) as MonthDayVisibilityRow | undefined;
  return row ? mapMonthDayVisibility(row) : null;
}

export function getBaziMonthDayVisibilityForChartDate(
  chartVersionId: string,
  targetDate: string,
): BaziMonthDayVisibilityVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_visibility_versions
    WHERE chart_version_id = ? AND target_date = ?
    ORDER BY updated_at DESC LIMIT 1
  `).get(chartVersionId, targetDate) as MonthDayVisibilityRow | undefined;
  return row ? mapMonthDayVisibility(row) : null;
}

export function listBaziMonthDayVisibilityVersions(chartVersionId: string): BaziMonthDayVisibilityVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_visibility_versions
    WHERE chart_version_id = ? ORDER BY target_date DESC, updated_at DESC
  `).all(chartVersionId) as MonthDayVisibilityRow[];
  return rows.map(mapMonthDayVisibility);
}

function fingerprintMonthDayVisibility(
  chartFingerprint: string,
  monthDayRelationFingerprint: string,
  result: BaziMonthDayVisibilityResult,
): string {
  return createHash('sha256').update(JSON.stringify({
    chartFingerprint,
    monthDayRelationFingerprint,
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

function mapMonthDayVisibility(row: MonthDayVisibilityRow): BaziMonthDayVisibilityVersion {
  return {
    id: row.id,
    chartVersionId: row.chart_version_id,
    monthDayRelationVersionId: row.month_day_relation_version_id,
    targetDate: row.target_date,
    methodologyVersion: row.methodology_version,
    engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint,
    monthDayRelationFingerprint: row.month_day_relation_fingerprint,
    monthDayVisibilityFingerprint: row.month_day_visibility_fingerprint,
    result: JSON.parse(row.result_json) as BaziMonthDayVisibilityResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
