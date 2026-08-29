import { createHash, randomUUID } from 'node:crypto';
import { auditBaziStrengthComposite } from '@/lib/bazi/strength-composite-engine';
import {
  BAZI_STRENGTH_COMPOSITE_ENGINE_VERSION,
  BAZI_STRENGTH_COMPOSITE_METHODOLOGY_VERSION,
} from '@/lib/bazi/strength-composite-methodology';
import type { BaziStrengthCompositeResult, BaziStrengthCompositeVersion } from '@/lib/bazi/strength-composite-types';
import { getBaziChartVersion } from './bazi';
import { ensureBaziAnalysisVersion } from './bazi-analysis';
import { ensureBaziDynamicTenGodVersion } from './bazi-dynamic-ten-gods';
import { ensureBaziHiddenStemActivationVersion } from './bazi-hidden-stem-activations';
import { ensureBaziTransparencyRootVersion } from './bazi-transparency-roots';
import { getDatabase } from './client';

interface StrengthCompositeRow {
  id: string; chart_version_id: string; analysis_version_id: string; dynamic_ten_god_version_id: string;
  transparency_root_version_id: string; hidden_stem_activation_version_id: string;
  methodology_version: string; engine_version: string; chart_fingerprint: string;
  analysis_fingerprint: string; dynamic_ten_god_fingerprint: string; transparency_root_fingerprint: string;
  hidden_stem_activation_fingerprint: string; strength_composite_fingerprint: string;
  result_json: string; created_at: number; updated_at: number;
}

export function ensureBaziStrengthCompositeVersion(chartVersionId: string): BaziStrengthCompositeVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const analysis = ensureBaziAnalysisVersion(chart.id);
  const dynamicTenGod = ensureBaziDynamicTenGodVersion(chart.id);
  const transparencyRoot = ensureBaziTransparencyRootVersion(chart.id);
  const hiddenStemActivation = ensureBaziHiddenStemActivationVersion(chart.id);
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_strength_composite_versions
    WHERE chart_version_id = ? AND analysis_version_id = ? AND dynamic_ten_god_version_id = ?
      AND transparency_root_version_id = ? AND hidden_stem_activation_version_id = ?
      AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id, analysis.id, dynamicTenGod.id, transparencyRoot.id, hiddenStemActivation.id,
    BAZI_STRENGTH_COMPOSITE_METHODOLOGY_VERSION, BAZI_STRENGTH_COMPOSITE_ENGINE_VERSION,
  ) as StrengthCompositeRow | undefined;
  if (existing) return mapStrengthComposite(existing);

  const result = auditBaziStrengthComposite(
    chart.result, analysis.result, dynamicTenGod.result, transparencyRoot.result, hiddenStemActivation.result,
  );
  const id = randomUUID();
  const now = Date.now();
  const strengthCompositeFingerprint = fingerprintStrengthComposite({
    chartFingerprint: chart.chartFingerprint,
    analysisFingerprint: analysis.analysisFingerprint,
    dynamicTenGodFingerprint: dynamicTenGod.dynamicTenGodFingerprint,
    transparencyRootFingerprint: transparencyRoot.transparencyRootFingerprint,
    hiddenStemActivationFingerprint: hiddenStemActivation.hiddenStemActivationFingerprint,
    result,
  });
  getDatabase().prepare(`
    INSERT INTO bazi_strength_composite_versions (
      id, chart_version_id, analysis_version_id, dynamic_ten_god_version_id,
      transparency_root_version_id, hidden_stem_activation_version_id,
      methodology_version, engine_version, chart_fingerprint, analysis_fingerprint,
      dynamic_ten_god_fingerprint, transparency_root_fingerprint,
      hidden_stem_activation_fingerprint, strength_composite_fingerprint,
      result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, chart.id, analysis.id, dynamicTenGod.id, transparencyRoot.id, hiddenStemActivation.id,
    result.methodologyVersion, result.engineVersion, chart.chartFingerprint, analysis.analysisFingerprint,
    dynamicTenGod.dynamicTenGodFingerprint, transparencyRoot.transparencyRootFingerprint,
    hiddenStemActivation.hiddenStemActivationFingerprint, strengthCompositeFingerprint,
    JSON.stringify(result), now, now,
  );
  return getBaziStrengthCompositeVersion(id)!;
}

export function getBaziStrengthCompositeVersion(id: string): BaziStrengthCompositeVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_strength_composite_versions WHERE id = ?')
    .get(id) as StrengthCompositeRow | undefined;
  return row ? mapStrengthComposite(row) : null;
}

export function getLatestBaziStrengthCompositeForChart(chartVersionId: string): BaziStrengthCompositeVersion | null {
  const row = getDatabase().prepare(`SELECT * FROM bazi_strength_composite_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC LIMIT 1`).get(chartVersionId) as StrengthCompositeRow | undefined;
  return row ? mapStrengthComposite(row) : null;
}

export function listBaziStrengthCompositeVersions(chartVersionId: string): BaziStrengthCompositeVersion[] {
  const rows = getDatabase().prepare(`SELECT * FROM bazi_strength_composite_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC`).all(chartVersionId) as StrengthCompositeRow[];
  return rows.map(mapStrengthComposite);
}

function fingerprintStrengthComposite(input: {
  chartFingerprint: string; analysisFingerprint: string; dynamicTenGodFingerprint: string;
  transparencyRootFingerprint: string; hiddenStemActivationFingerprint: string;
  result: BaziStrengthCompositeResult;
}): string {
  return createHash('sha256').update(JSON.stringify({
    ...input,
    result: {
      methodologyVersion: input.result.methodologyVersion, engineVersion: input.result.engineVersion,
      status: input.result.status, source: input.result.source, staticBaseline: input.result.staticBaseline,
      range: input.result.range, years: input.result.years, rulesApplied: input.result.rulesApplied,
      warnings: input.result.warnings, boundary: input.result.boundary,
    },
  })).digest('hex');
}

function mapStrengthComposite(row: StrengthCompositeRow): BaziStrengthCompositeVersion {
  return {
    id: row.id, chartVersionId: row.chart_version_id, analysisVersionId: row.analysis_version_id,
    dynamicTenGodVersionId: row.dynamic_ten_god_version_id,
    transparencyRootVersionId: row.transparency_root_version_id,
    hiddenStemActivationVersionId: row.hidden_stem_activation_version_id,
    methodologyVersion: row.methodology_version, engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint, analysisFingerprint: row.analysis_fingerprint,
    dynamicTenGodFingerprint: row.dynamic_ten_god_fingerprint,
    transparencyRootFingerprint: row.transparency_root_fingerprint,
    hiddenStemActivationFingerprint: row.hidden_stem_activation_fingerprint,
    strengthCompositeFingerprint: row.strength_composite_fingerprint,
    result: JSON.parse(row.result_json) as BaziStrengthCompositeResult,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
