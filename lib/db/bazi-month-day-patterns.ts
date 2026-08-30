import { createHash, randomUUID } from 'node:crypto';
import { auditBaziMonthDayPatternConditions } from '@/lib/bazi/month-day-pattern-engine';
import {
  BAZI_MONTH_DAY_PATTERN_ENGINE_VERSION,
  BAZI_MONTH_DAY_PATTERN_METHODOLOGY_VERSION,
} from '@/lib/bazi/month-day-pattern-methodology';
import type {
  BaziMonthDayPatternResult,
  BaziMonthDayPatternVersion,
} from '@/lib/bazi/month-day-pattern-types';
import { getBaziChartVersion } from './bazi';
import { ensureBaziPatternConditionVersion } from './bazi-pattern-conditions';
import { ensureBaziMonthDayRelationVersion } from './bazi-month-day-relations';
import { ensureBaziMonthDayVisibilityVersion } from './bazi-month-day-visibility';
import { ensureBaziMonthDayStrengthVersion } from './bazi-month-day-strengths';
import { getDatabase } from './client';

interface MonthDayPatternRow {
  id: string;
  chart_version_id: string;
  pattern_condition_version_id: string;
  month_day_relation_version_id: string;
  month_day_visibility_version_id: string;
  month_day_strength_version_id: string;
  target_date: string;
  methodology_version: string;
  engine_version: string;
  chart_fingerprint: string;
  pattern_condition_fingerprint: string;
  month_day_relation_fingerprint: string;
  month_day_visibility_fingerprint: string;
  month_day_strength_fingerprint: string;
  month_day_pattern_fingerprint: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

export function ensureBaziMonthDayPatternVersion(
  chartVersionId: string,
  requestedTargetDate?: string,
  requestedTargetYear?: number,
): BaziMonthDayPatternVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const patternCondition = ensureBaziPatternConditionVersion(chart.id);
  const relation = ensureBaziMonthDayRelationVersion(chart.id, requestedTargetDate, requestedTargetYear);
  const visibility = ensureBaziMonthDayVisibilityVersion(chart.id, relation.targetDate, relation.result.source.targetYear);
  const strength = ensureBaziMonthDayStrengthVersion(chart.id, relation.targetDate, relation.result.source.targetYear);
  if (visibility.monthDayRelationVersionId !== relation.id
    || strength.monthDayRelationVersionId !== relation.id
    || strength.monthDayVisibilityVersionId !== visibility.id) {
    throw new Error('流月流日格局映射的 M9-15、M9-16 与 M9-17 版本链不一致');
  }
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_pattern_versions
    WHERE chart_version_id = ? AND pattern_condition_version_id = ?
      AND month_day_relation_version_id = ? AND month_day_visibility_version_id = ?
      AND month_day_strength_version_id = ? AND target_date = ?
      AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id,
    patternCondition.id,
    relation.id,
    visibility.id,
    strength.id,
    relation.targetDate,
    BAZI_MONTH_DAY_PATTERN_METHODOLOGY_VERSION,
    BAZI_MONTH_DAY_PATTERN_ENGINE_VERSION,
  ) as MonthDayPatternRow | undefined;
  if (existing) return mapMonthDayPattern(existing);

  const result = auditBaziMonthDayPatternConditions(
    chart.result,
    patternCondition.result,
    relation.result,
    visibility.result,
    strength.result,
  );
  const id = randomUUID();
  const now = Date.now();
  const monthDayPatternFingerprint = fingerprintMonthDayPattern({
    chartFingerprint: chart.chartFingerprint,
    patternConditionFingerprint: patternCondition.patternConditionFingerprint,
    monthDayRelationFingerprint: relation.monthDayRelationFingerprint,
    monthDayVisibilityFingerprint: visibility.monthDayVisibilityFingerprint,
    monthDayStrengthFingerprint: strength.monthDayStrengthFingerprint,
    result,
  });
  getDatabase().prepare(`
    INSERT INTO bazi_month_day_pattern_versions (
      id, chart_version_id, pattern_condition_version_id,
      month_day_relation_version_id, month_day_visibility_version_id,
      month_day_strength_version_id, target_date, methodology_version, engine_version,
      chart_fingerprint, pattern_condition_fingerprint, month_day_relation_fingerprint,
      month_day_visibility_fingerprint, month_day_strength_fingerprint,
      month_day_pattern_fingerprint, result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    chart.id,
    patternCondition.id,
    relation.id,
    visibility.id,
    strength.id,
    relation.targetDate,
    result.methodologyVersion,
    result.engineVersion,
    chart.chartFingerprint,
    patternCondition.patternConditionFingerprint,
    relation.monthDayRelationFingerprint,
    visibility.monthDayVisibilityFingerprint,
    strength.monthDayStrengthFingerprint,
    monthDayPatternFingerprint,
    JSON.stringify(result),
    now,
    now,
  );
  return getBaziMonthDayPatternVersion(id)!;
}

export function getBaziMonthDayPatternVersion(id: string): BaziMonthDayPatternVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_month_day_pattern_versions WHERE id = ?')
    .get(id) as MonthDayPatternRow | undefined;
  return row ? mapMonthDayPattern(row) : null;
}

export function getBaziMonthDayPatternForChartDate(
  chartVersionId: string,
  targetDate: string,
): BaziMonthDayPatternVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_pattern_versions
    WHERE chart_version_id = ? AND target_date = ?
    ORDER BY updated_at DESC LIMIT 1
  `).get(chartVersionId, targetDate) as MonthDayPatternRow | undefined;
  return row ? mapMonthDayPattern(row) : null;
}

export function listBaziMonthDayPatternVersions(chartVersionId: string): BaziMonthDayPatternVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_month_day_pattern_versions
    WHERE chart_version_id = ? ORDER BY target_date DESC, updated_at DESC
  `).all(chartVersionId) as MonthDayPatternRow[];
  return rows.map(mapMonthDayPattern);
}

function fingerprintMonthDayPattern(input: {
  chartFingerprint: string;
  patternConditionFingerprint: string;
  monthDayRelationFingerprint: string;
  monthDayVisibilityFingerprint: string;
  monthDayStrengthFingerprint: string;
  result: BaziMonthDayPatternResult;
}): string {
  return createHash('sha256').update(JSON.stringify({
    chartFingerprint: input.chartFingerprint,
    patternConditionFingerprint: input.patternConditionFingerprint,
    monthDayRelationFingerprint: input.monthDayRelationFingerprint,
    monthDayVisibilityFingerprint: input.monthDayVisibilityFingerprint,
    monthDayStrengthFingerprint: input.monthDayStrengthFingerprint,
    methodologyVersion: input.result.methodologyVersion,
    engineVersion: input.result.engineVersion,
    status: input.result.status,
    source: input.result.source,
    target: input.result.target,
    segments: input.result.segments,
    rulesApplied: input.result.rulesApplied,
    warnings: input.result.warnings,
    boundary: input.result.boundary,
  })).digest('hex');
}

function mapMonthDayPattern(row: MonthDayPatternRow): BaziMonthDayPatternVersion {
  return {
    id: row.id,
    chartVersionId: row.chart_version_id,
    patternConditionVersionId: row.pattern_condition_version_id,
    monthDayRelationVersionId: row.month_day_relation_version_id,
    monthDayVisibilityVersionId: row.month_day_visibility_version_id,
    monthDayStrengthVersionId: row.month_day_strength_version_id,
    targetDate: row.target_date,
    methodologyVersion: row.methodology_version,
    engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint,
    patternConditionFingerprint: row.pattern_condition_fingerprint,
    monthDayRelationFingerprint: row.month_day_relation_fingerprint,
    monthDayVisibilityFingerprint: row.month_day_visibility_fingerprint,
    monthDayStrengthFingerprint: row.month_day_strength_fingerprint,
    monthDayPatternFingerprint: row.month_day_pattern_fingerprint,
    result: JSON.parse(row.result_json) as BaziMonthDayPatternResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
