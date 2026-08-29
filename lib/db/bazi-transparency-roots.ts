import { createHash, randomUUID } from 'node:crypto';
import { auditBaziTransparencyRoots } from '@/lib/bazi/transparency-root-engine';
import {
  BAZI_TRANSPARENCY_ROOT_ENGINE_VERSION,
  BAZI_TRANSPARENCY_ROOT_METHODOLOGY_VERSION,
} from '@/lib/bazi/transparency-root-methodology';
import type { BaziTransparencyRootResult, BaziTransparencyRootVersion } from '@/lib/bazi/transparency-root-types';
import { getBaziChartVersion } from './bazi';
import { ensureBaziDynamicTenGodVersion } from './bazi-dynamic-ten-gods';
import { ensureBaziTenGodRepeatVersion } from './bazi-ten-god-repeats';
import { getDatabase } from './client';

interface TransparencyRootRow {
  id: string;
  chart_version_id: string;
  dynamic_ten_god_version_id: string;
  ten_god_repeat_version_id: string;
  methodology_version: string;
  engine_version: string;
  chart_fingerprint: string;
  dynamic_ten_god_fingerprint: string;
  ten_god_repeat_fingerprint: string;
  transparency_root_fingerprint: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

export function ensureBaziTransparencyRootVersion(chartVersionId: string): BaziTransparencyRootVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const dynamicTenGod = ensureBaziDynamicTenGodVersion(chart.id);
  const tenGodRepeat = ensureBaziTenGodRepeatVersion(chart.id);
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_transparency_root_versions
    WHERE chart_version_id = ? AND dynamic_ten_god_version_id = ?
      AND ten_god_repeat_version_id = ? AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id,
    dynamicTenGod.id,
    tenGodRepeat.id,
    BAZI_TRANSPARENCY_ROOT_METHODOLOGY_VERSION,
    BAZI_TRANSPARENCY_ROOT_ENGINE_VERSION,
  ) as TransparencyRootRow | undefined;
  if (existing) return mapTransparencyRoot(existing);

  const result = auditBaziTransparencyRoots(chart.result, dynamicTenGod.result, tenGodRepeat.result);
  const id = randomUUID();
  const now = Date.now();
  const transparencyRootFingerprint = fingerprintTransparencyRoot(
    chart.chartFingerprint,
    dynamicTenGod.dynamicTenGodFingerprint,
    tenGodRepeat.tenGodRepeatFingerprint,
    result,
  );
  getDatabase().prepare(`
    INSERT INTO bazi_transparency_root_versions (
      id, chart_version_id, dynamic_ten_god_version_id, ten_god_repeat_version_id,
      methodology_version, engine_version, chart_fingerprint, dynamic_ten_god_fingerprint,
      ten_god_repeat_fingerprint, transparency_root_fingerprint,
      result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    chart.id,
    dynamicTenGod.id,
    tenGodRepeat.id,
    result.methodologyVersion,
    result.engineVersion,
    chart.chartFingerprint,
    dynamicTenGod.dynamicTenGodFingerprint,
    tenGodRepeat.tenGodRepeatFingerprint,
    transparencyRootFingerprint,
    JSON.stringify(result),
    now,
    now,
  );
  return getBaziTransparencyRootVersion(id)!;
}

export function getBaziTransparencyRootVersion(id: string): BaziTransparencyRootVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_transparency_root_versions WHERE id = ?')
    .get(id) as TransparencyRootRow | undefined;
  return row ? mapTransparencyRoot(row) : null;
}

export function getLatestBaziTransparencyRootForChart(chartVersionId: string): BaziTransparencyRootVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM bazi_transparency_root_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC LIMIT 1
  `).get(chartVersionId) as TransparencyRootRow | undefined;
  return row ? mapTransparencyRoot(row) : null;
}

export function listBaziTransparencyRootVersions(chartVersionId: string): BaziTransparencyRootVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_transparency_root_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC
  `).all(chartVersionId) as TransparencyRootRow[];
  return rows.map(mapTransparencyRoot);
}

function fingerprintTransparencyRoot(
  chartFingerprint: string,
  dynamicTenGodFingerprint: string,
  tenGodRepeatFingerprint: string,
  result: BaziTransparencyRootResult,
): string {
  return createHash('sha256').update(JSON.stringify({
    chartFingerprint,
    dynamicTenGodFingerprint,
    tenGodRepeatFingerprint,
    methodologyVersion: result.methodologyVersion,
    engineVersion: result.engineVersion,
    status: result.status,
    source: result.source,
    dayMaster: result.dayMaster,
    range: result.range,
    years: result.years,
    rulesApplied: result.rulesApplied,
    warnings: result.warnings,
    boundary: result.boundary,
  })).digest('hex');
}

function mapTransparencyRoot(row: TransparencyRootRow): BaziTransparencyRootVersion {
  return {
    id: row.id,
    chartVersionId: row.chart_version_id,
    dynamicTenGodVersionId: row.dynamic_ten_god_version_id,
    tenGodRepeatVersionId: row.ten_god_repeat_version_id,
    methodologyVersion: row.methodology_version,
    engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint,
    dynamicTenGodFingerprint: row.dynamic_ten_god_fingerprint,
    tenGodRepeatFingerprint: row.ten_god_repeat_fingerprint,
    transparencyRootFingerprint: row.transparency_root_fingerprint,
    result: JSON.parse(row.result_json) as BaziTransparencyRootResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
