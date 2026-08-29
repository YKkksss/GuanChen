import { createHash, randomUUID } from 'node:crypto';
import { calculateBaziLuckCycles } from '@/lib/bazi/luck-cycle-engine';
import {
  BAZI_LUCK_CYCLE_ENGINE_VERSION,
  BAZI_LUCK_CYCLE_METHODOLOGY_VERSION,
} from '@/lib/bazi/luck-cycle-methodology';
import type { BaziLuckCycleResult, BaziLuckCycleVersion } from '@/lib/bazi/luck-cycle-types';
import { getBaziChartVersion } from './bazi';
import { getDatabase } from './client';

interface LuckCycleRow {
  id: string;
  chart_version_id: string;
  methodology_version: string;
  engine_version: string;
  chart_fingerprint: string;
  luck_cycle_fingerprint: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

export function ensureBaziLuckCycleVersion(chartVersionId: string): BaziLuckCycleVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_luck_cycle_versions
    WHERE chart_version_id = ? AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id,
    BAZI_LUCK_CYCLE_METHODOLOGY_VERSION,
    BAZI_LUCK_CYCLE_ENGINE_VERSION,
  ) as LuckCycleRow | undefined;
  if (existing) return mapLuckCycle(existing);

  const result = calculateBaziLuckCycles(chart.result);
  const id = randomUUID();
  const now = Date.now();
  const luckCycleFingerprint = fingerprintLuckCycles(chart.chartFingerprint, result);
  getDatabase().prepare(`
    INSERT INTO bazi_luck_cycle_versions (
      id, chart_version_id, methodology_version, engine_version,
      chart_fingerprint, luck_cycle_fingerprint, result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, chart.id, result.methodologyVersion, result.engineVersion,
    chart.chartFingerprint, luckCycleFingerprint, JSON.stringify(result), now, now,
  );
  return getBaziLuckCycleVersion(id)!;
}

export function getBaziLuckCycleVersion(id: string): BaziLuckCycleVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_luck_cycle_versions WHERE id = ?')
    .get(id) as LuckCycleRow | undefined;
  return row ? mapLuckCycle(row) : null;
}

export function getLatestBaziLuckCyclesForChart(chartVersionId: string): BaziLuckCycleVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM bazi_luck_cycle_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC LIMIT 1
  `).get(chartVersionId) as LuckCycleRow | undefined;
  return row ? mapLuckCycle(row) : null;
}

export function listBaziLuckCycleVersions(chartVersionId: string): BaziLuckCycleVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_luck_cycle_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC
  `).all(chartVersionId) as LuckCycleRow[];
  return rows.map(mapLuckCycle);
}

function fingerprintLuckCycles(chartFingerprint: string, result: BaziLuckCycleResult): string {
  return createHash('sha256').update(JSON.stringify({
    chartFingerprint,
    methodologyVersion: result.methodologyVersion,
    engineVersion: result.engineVersion,
    status: result.status,
    sourceChart: result.sourceChart,
    direction: result.direction,
    referenceJie: result.referenceJie,
    startOffset: result.startOffset,
    startAt: result.startAt,
    cycles: result.cycles,
    rulesApplied: result.rulesApplied,
    warnings: result.warnings,
    boundary: result.boundary,
  })).digest('hex');
}

function mapLuckCycle(row: LuckCycleRow): BaziLuckCycleVersion {
  return {
    id: row.id,
    chartVersionId: row.chart_version_id,
    methodologyVersion: row.methodology_version,
    engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint,
    luckCycleFingerprint: row.luck_cycle_fingerprint,
    result: JSON.parse(row.result_json) as BaziLuckCycleResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
