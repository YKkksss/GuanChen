import { createHash, randomUUID } from 'node:crypto';
import { auditBaziMonthDayStrengthComposite } from '@/lib/bazi/month-day-strength-engine';
import {
  BAZI_MONTH_DAY_STRENGTH_ENGINE_VERSION,
  BAZI_MONTH_DAY_STRENGTH_METHODOLOGY_VERSION,
} from '@/lib/bazi/month-day-strength-methodology';
import type {
  BaziMonthDayStrengthResult,
  BaziMonthDayStrengthVersion,
} from '@/lib/bazi/month-day-strength-types';
import { getBaziChartVersion } from './bazi';
import { ensureBaziAnalysisVersion } from './bazi-analysis';
import { ensureBaziMonthDayRelationVersion } from './bazi-month-day-relations';
import { ensureBaziMonthDayVisibilityVersion } from './bazi-month-day-visibility';
import { getDatabase } from './client';

interface MonthDayStrengthRow {
  id: string;
  chart_version_id: string;
  analysis_version_id: string;
  month_day_relation_version_id: string;
  month_day_visibility_version_id: string;
  target_date: string;
  methodology_version: string;
  engine_version: string;
  chart_fingerprint: string;
  analysis_fingerprint: string;
  month_day_relation_fingerprint: string;
  month_day_visibility_fingerprint: string;
  month_day_strength_fingerprint: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}
export function ensureBaziMonthDayStrengthVersion(
  chartVersionId: string,
  requestedTargetDate?: string,
  requestedTargetYear?: number,
): BaziMonthDayStrengthVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const analysis = ensureBaziAnalysisVersion(chart.id);
  const relation = ensureBaziMonthDayRelationVersion(chart.id, requestedTargetDate, requestedTargetYear);
  const visibility = ensureBaziMonthDayVisibilityVersion(chart.id, relation.targetDate, relation.result.source.targetYear);
  if (visibility.monthDayRelationVersionId !== relation.id) {
    throw new Error('流月流日关系版本与显隐条件版本不一致');
  }
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_strength_versions
    WHERE chart_version_id = ? AND analysis_version_id = ?
      AND month_day_relation_version_id = ? AND month_day_visibility_version_id = ?
      AND target_date = ? AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id,
    analysis.id,
    relation.id,
    visibility.id,
    relation.targetDate,
    BAZI_MONTH_DAY_STRENGTH_METHODOLOGY_VERSION,
    BAZI_MONTH_DAY_STRENGTH_ENGINE_VERSION,
  ) as MonthDayStrengthRow | undefined;
  if (existing) return mapMonthDayStrength(existing);

  const result = auditBaziMonthDayStrengthComposite(
    chart.result,
    analysis.result,
    relation.result,
    visibility.result,
  );
  const id = randomUUID();
  const now = Date.now();
  const monthDayStrengthFingerprint = fingerprintMonthDayStrength({
    chartFingerprint: chart.chartFingerprint,
    analysisFingerprint: analysis.analysisFingerprint,
    monthDayRelationFingerprint: relation.monthDayRelationFingerprint,
    monthDayVisibilityFingerprint: visibility.monthDayVisibilityFingerprint,
    result,
  });
  getDatabase().prepare(`
    INSERT INTO bazi_month_day_strength_versions (
      id, chart_version_id, analysis_version_id,
      month_day_relation_version_id, month_day_visibility_version_id, target_date,
      methodology_version, engine_version, chart_fingerprint, analysis_fingerprint,
      month_day_relation_fingerprint, month_day_visibility_fingerprint,
      month_day_strength_fingerprint, result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    chart.id,
    analysis.id,
    relation.id,
    visibility.id,
    relation.targetDate,
    result.methodologyVersion,
    result.engineVersion,
    chart.chartFingerprint,
    analysis.analysisFingerprint,
    relation.monthDayRelationFingerprint,
    visibility.monthDayVisibilityFingerprint,
    monthDayStrengthFingerprint,
    JSON.stringify(result),
    now,
    now,
  );
  return getBaziMonthDayStrengthVersion(id)!;
}

export function getBaziMonthDayStrengthVersion(id: string): BaziMonthDayStrengthVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_month_day_strength_versions WHERE id = ?')
    .get(id) as MonthDayStrengthRow | undefined;
  return row ? mapMonthDayStrength(row) : null;
}

export function getBaziMonthDayStrengthForChartDate(
  chartVersionId: string,
  targetDate: string,
): BaziMonthDayStrengthVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_strength_versions
    WHERE chart_version_id = ? AND target_date = ?
    ORDER BY updated_at DESC LIMIT 1
  `).get(chartVersionId, targetDate) as MonthDayStrengthRow | undefined;
  return row ? mapMonthDayStrength(row) : null;
}

export function listBaziMonthDayStrengthVersions(chartVersionId: string): BaziMonthDayStrengthVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_strength_versions
    WHERE chart_version_id = ? ORDER BY target_date DESC, updated_at DESC
  `).all(chartVersionId) as MonthDayStrengthRow[];
  return rows.map(mapMonthDayStrength);
}

function fingerprintMonthDayStrength(input: {
  chartFingerprint: string;
  analysisFingerprint: string;
  monthDayRelationFingerprint: string;
  monthDayVisibilityFingerprint: string;
  result: BaziMonthDayStrengthResult;
}): string {
  return createHash('sha256').update(JSON.stringify({
    chartFingerprint: input.chartFingerprint,
    analysisFingerprint: input.analysisFingerprint,
    monthDayRelationFingerprint: input.monthDayRelationFingerprint,
    monthDayVisibilityFingerprint: input.monthDayVisibilityFingerprint,
    methodologyVersion: input.result.methodologyVersion,
    engineVersion: input.result.engineVersion,
    status: input.result.status,
    source: input.result.source,
    staticBaseline: input.result.staticBaseline,
    target: input.result.target,
    segments: input.result.segments,
    rulesApplied: input.result.rulesApplied,
    warnings: input.result.warnings,
    boundary: input.result.boundary,
  })).digest('hex');
}

function mapMonthDayStrength(row: MonthDayStrengthRow): BaziMonthDayStrengthVersion {
  return {
    id: row.id,
    chartVersionId: row.chart_version_id,
    analysisVersionId: row.analysis_version_id,
    monthDayRelationVersionId: row.month_day_relation_version_id,
    monthDayVisibilityVersionId: row.month_day_visibility_version_id,
    targetDate: row.target_date,
    methodologyVersion: row.methodology_version,
    engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint,
    analysisFingerprint: row.analysis_fingerprint,
    monthDayRelationFingerprint: row.month_day_relation_fingerprint,
    monthDayVisibilityFingerprint: row.month_day_visibility_fingerprint,
    monthDayStrengthFingerprint: row.month_day_strength_fingerprint,
    result: JSON.parse(row.result_json) as BaziMonthDayStrengthResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
