import { createHash, randomUUID } from 'node:crypto';
import { analyzeBaziInterpretation } from '@/lib/bazi/interpretation-engine';
import {
  BAZI_INTERPRETATION_ENGINE_VERSION,
  BAZI_INTERPRETATION_METHODOLOGY_VERSION,
} from '@/lib/bazi/interpretation-methodology';
import type { BaziAnalysisVersion, BaziInterpretationResult } from '@/lib/bazi/interpretation-types';
import { getBaziChartVersion } from './bazi';
import { getDatabase } from './client';

interface AnalysisRow {
  id: string;
  chart_version_id: string;
  methodology_version: string;
  engine_version: string;
  chart_fingerprint: string;
  analysis_fingerprint: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

export function ensureBaziAnalysisVersion(chartVersionId: string): BaziAnalysisVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_analysis_versions
    WHERE chart_version_id = ? AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id,
    BAZI_INTERPRETATION_METHODOLOGY_VERSION,
    BAZI_INTERPRETATION_ENGINE_VERSION,
  ) as AnalysisRow | undefined;
  if (existing) return mapAnalysis(existing);

  const result = analyzeBaziInterpretation(chart.result);
  const id = randomUUID();
  const now = Date.now();
  const analysisFingerprint = fingerprintAnalysis(chart.chartFingerprint, result);
  getDatabase().prepare(`
    INSERT INTO bazi_analysis_versions (
      id, chart_version_id, methodology_version, engine_version,
      chart_fingerprint, analysis_fingerprint, result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, chart.id, result.methodologyVersion, result.engineVersion,
    chart.chartFingerprint, analysisFingerprint, JSON.stringify(result), now, now,
  );
  return getBaziAnalysisVersion(id)!;
}

export function getBaziAnalysisVersion(id: string): BaziAnalysisVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_analysis_versions WHERE id = ?')
    .get(id) as AnalysisRow | undefined;
  return row ? mapAnalysis(row) : null;
}

export function getLatestBaziAnalysisForChart(chartVersionId: string): BaziAnalysisVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM bazi_analysis_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC LIMIT 1
  `).get(chartVersionId) as AnalysisRow | undefined;
  return row ? mapAnalysis(row) : null;
}

export function listBaziAnalysisVersions(chartVersionId: string): BaziAnalysisVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_analysis_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC
  `).all(chartVersionId) as AnalysisRow[];
  return rows.map(mapAnalysis);
}

function fingerprintAnalysis(chartFingerprint: string, result: BaziInterpretationResult): string {
  return createHash('sha256').update(JSON.stringify({
    chartFingerprint,
    methodologyVersion: result.methodologyVersion,
    engineVersion: result.engineVersion,
    capabilities: result.capabilities,
    strength: result.strength,
    pattern: result.pattern,
    usefulGod: result.usefulGod,
    warnings: result.warnings,
  })).digest('hex');
}

function mapAnalysis(row: AnalysisRow): BaziAnalysisVersion {
  return {
    id: row.id,
    chartVersionId: row.chart_version_id,
    methodologyVersion: row.methodology_version,
    engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint,
    analysisFingerprint: row.analysis_fingerprint,
    result: JSON.parse(row.result_json) as BaziInterpretationResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
