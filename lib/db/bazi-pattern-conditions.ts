import { createHash, randomUUID } from 'node:crypto';
import { auditBaziPatternConditions } from '@/lib/bazi/pattern-condition-engine';
import {
  BAZI_PATTERN_CONDITION_ENGINE_VERSION,
  BAZI_PATTERN_CONDITION_METHODOLOGY_VERSION,
} from '@/lib/bazi/pattern-condition-methodology';
import type { BaziPatternConditionResult, BaziPatternConditionVersion } from '@/lib/bazi/pattern-condition-types';
import { getBaziChartVersion } from './bazi';
import { ensureBaziAnalysisVersion } from './bazi-analysis';
import { ensureBaziStrengthCompositeVersion } from './bazi-strength-composites';
import { getDatabase } from './client';

interface PatternConditionRow {
  id: string;
  chart_version_id: string;
  analysis_version_id: string;
  strength_composite_version_id: string;
  methodology_version: string;
  engine_version: string;
  chart_fingerprint: string;
  analysis_fingerprint: string;
  strength_composite_fingerprint: string;
  pattern_condition_fingerprint: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

export function ensureBaziPatternConditionVersion(chartVersionId: string): BaziPatternConditionVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const analysis = ensureBaziAnalysisVersion(chart.id);
  const strengthComposite = ensureBaziStrengthCompositeVersion(chart.id);
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_pattern_condition_versions
    WHERE chart_version_id = ? AND analysis_version_id = ? AND strength_composite_version_id = ?
      AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id, analysis.id, strengthComposite.id,
    BAZI_PATTERN_CONDITION_METHODOLOGY_VERSION, BAZI_PATTERN_CONDITION_ENGINE_VERSION,
  ) as PatternConditionRow | undefined;
  if (existing) return mapPatternCondition(existing);

  const result = auditBaziPatternConditions(chart.result, analysis.result, strengthComposite.result);
  const id = randomUUID();
  const now = Date.now();
  const patternConditionFingerprint = fingerprintPatternCondition({
    chartFingerprint: chart.chartFingerprint,
    analysisFingerprint: analysis.analysisFingerprint,
    strengthCompositeFingerprint: strengthComposite.strengthCompositeFingerprint,
    result,
  });
  getDatabase().prepare(`
    INSERT INTO bazi_pattern_condition_versions (
      id, chart_version_id, analysis_version_id, strength_composite_version_id,
      methodology_version, engine_version, chart_fingerprint, analysis_fingerprint,
      strength_composite_fingerprint, pattern_condition_fingerprint,
      result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, chart.id, analysis.id, strengthComposite.id,
    result.methodologyVersion, result.engineVersion, chart.chartFingerprint, analysis.analysisFingerprint,
    strengthComposite.strengthCompositeFingerprint, patternConditionFingerprint,
    JSON.stringify(result), now, now,
  );
  return getBaziPatternConditionVersion(id)!;
}

export function getBaziPatternConditionVersion(id: string): BaziPatternConditionVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_pattern_condition_versions WHERE id = ?')
    .get(id) as PatternConditionRow | undefined;
  return row ? mapPatternCondition(row) : null;
}

export function getLatestBaziPatternConditionForChart(chartVersionId: string): BaziPatternConditionVersion | null {
  const row = getDatabase().prepare(`SELECT * FROM bazi_pattern_condition_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC LIMIT 1`).get(chartVersionId) as PatternConditionRow | undefined;
  return row ? mapPatternCondition(row) : null;
}

export function listBaziPatternConditionVersions(chartVersionId: string): BaziPatternConditionVersion[] {
  const rows = getDatabase().prepare(`SELECT * FROM bazi_pattern_condition_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC`).all(chartVersionId) as PatternConditionRow[];
  return rows.map(mapPatternCondition);
}

function fingerprintPatternCondition(input: {
  chartFingerprint: string;
  analysisFingerprint: string;
  strengthCompositeFingerprint: string;
  result: BaziPatternConditionResult;
}): string {
  return createHash('sha256').update(JSON.stringify({
    ...input,
    result: {
      methodologyVersion: input.result.methodologyVersion,
      engineVersion: input.result.engineVersion,
      status: input.result.status,
      source: input.result.source,
      monthCommand: input.result.monthCommand,
      strengthContext: input.result.strengthContext,
      candidates: input.result.candidates,
      rulesApplied: input.result.rulesApplied,
      warnings: input.result.warnings,
      boundary: input.result.boundary,
    },
  })).digest('hex');
}

function mapPatternCondition(row: PatternConditionRow): BaziPatternConditionVersion {
  return {
    id: row.id,
    chartVersionId: row.chart_version_id,
    analysisVersionId: row.analysis_version_id,
    strengthCompositeVersionId: row.strength_composite_version_id,
    methodologyVersion: row.methodology_version,
    engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint,
    analysisFingerprint: row.analysis_fingerprint,
    strengthCompositeFingerprint: row.strength_composite_fingerprint,
    patternConditionFingerprint: row.pattern_condition_fingerprint,
    result: JSON.parse(row.result_json) as BaziPatternConditionResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
