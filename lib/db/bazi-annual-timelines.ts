import { createHash, randomUUID } from 'node:crypto';
import { calculateBaziAnnualTimeline } from '@/lib/bazi/annual-timeline-engine';
import {
  BAZI_ANNUAL_TIMELINE_ENGINE_VERSION,
  BAZI_ANNUAL_TIMELINE_METHODOLOGY_VERSION,
} from '@/lib/bazi/annual-timeline-methodology';
import type { BaziAnnualTimelineResult, BaziAnnualTimelineVersion } from '@/lib/bazi/annual-timeline-types';
import { getBaziChartVersion } from './bazi';
import { ensureBaziLuckCycleVersion } from './bazi-luck-cycles';
import { getDatabase } from './client';

interface AnnualTimelineRow {
  id: string;
  chart_version_id: string;
  luck_cycle_version_id: string;
  methodology_version: string;
  engine_version: string;
  chart_fingerprint: string;
  luck_cycle_fingerprint: string;
  annual_timeline_fingerprint: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

export function ensureBaziAnnualTimelineVersion(chartVersionId: string): BaziAnnualTimelineVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const luckCycles = ensureBaziLuckCycleVersion(chart.id);
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_annual_timeline_versions
    WHERE chart_version_id = ? AND luck_cycle_version_id = ?
      AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id, luckCycles.id,
    BAZI_ANNUAL_TIMELINE_METHODOLOGY_VERSION,
    BAZI_ANNUAL_TIMELINE_ENGINE_VERSION,
  ) as AnnualTimelineRow | undefined;
  if (existing) return mapAnnualTimeline(existing);

  const result = calculateBaziAnnualTimeline(chart.result, luckCycles.result);
  const id = randomUUID();
  const now = Date.now();
  const annualTimelineFingerprint = fingerprintAnnualTimeline(
    chart.chartFingerprint, luckCycles.luckCycleFingerprint, result,
  );
  getDatabase().prepare(`
    INSERT INTO bazi_annual_timeline_versions (
      id, chart_version_id, luck_cycle_version_id, methodology_version, engine_version,
      chart_fingerprint, luck_cycle_fingerprint, annual_timeline_fingerprint,
      result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, chart.id, luckCycles.id, result.methodologyVersion, result.engineVersion,
    chart.chartFingerprint, luckCycles.luckCycleFingerprint, annualTimelineFingerprint,
    JSON.stringify(result), now, now,
  );
  return getBaziAnnualTimelineVersion(id)!;
}

export function getBaziAnnualTimelineVersion(id: string): BaziAnnualTimelineVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_annual_timeline_versions WHERE id = ?')
    .get(id) as AnnualTimelineRow | undefined;
  return row ? mapAnnualTimeline(row) : null;
}

export function getLatestBaziAnnualTimelineForChart(chartVersionId: string): BaziAnnualTimelineVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM bazi_annual_timeline_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC LIMIT 1
  `).get(chartVersionId) as AnnualTimelineRow | undefined;
  return row ? mapAnnualTimeline(row) : null;
}

export function listBaziAnnualTimelineVersions(chartVersionId: string): BaziAnnualTimelineVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_annual_timeline_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC
  `).all(chartVersionId) as AnnualTimelineRow[];
  return rows.map(mapAnnualTimeline);
}

function fingerprintAnnualTimeline(
  chartFingerprint: string,
  luckCycleFingerprint: string,
  result: BaziAnnualTimelineResult,
): string {
  return createHash('sha256').update(JSON.stringify({
    chartFingerprint,
    luckCycleFingerprint,
    methodologyVersion: result.methodologyVersion,
    engineVersion: result.engineVersion,
    status: result.status,
    source: result.source,
    range: result.range,
    years: result.years,
    rulesApplied: result.rulesApplied,
    warnings: result.warnings,
    boundary: result.boundary,
  })).digest('hex');
}

function mapAnnualTimeline(row: AnnualTimelineRow): BaziAnnualTimelineVersion {
  return {
    id: row.id,
    chartVersionId: row.chart_version_id,
    luckCycleVersionId: row.luck_cycle_version_id,
    methodologyVersion: row.methodology_version,
    engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint,
    luckCycleFingerprint: row.luck_cycle_fingerprint,
    annualTimelineFingerprint: row.annual_timeline_fingerprint,
    result: JSON.parse(row.result_json) as BaziAnnualTimelineResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
