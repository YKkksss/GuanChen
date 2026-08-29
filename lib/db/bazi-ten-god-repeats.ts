import { createHash, randomUUID } from 'node:crypto';
import { auditBaziTenGodRepeats } from '@/lib/bazi/ten-god-repeat-engine';
import {
  BAZI_TEN_GOD_REPEAT_ENGINE_VERSION,
  BAZI_TEN_GOD_REPEAT_METHODOLOGY_VERSION,
} from '@/lib/bazi/ten-god-repeat-methodology';
import type { BaziTenGodRepeatResult, BaziTenGodRepeatVersion } from '@/lib/bazi/ten-god-repeat-types';
import { getBaziChartVersion } from './bazi';
import { ensureBaziDynamicTenGodVersion } from './bazi-dynamic-ten-gods';
import { getBaziRelationAuditVersion } from './bazi-relation-audits';
import { getDatabase } from './client';

interface TenGodRepeatRow {
  id: string;
  chart_version_id: string;
  relation_audit_version_id: string;
  dynamic_ten_god_version_id: string;
  methodology_version: string;
  engine_version: string;
  chart_fingerprint: string;
  relation_audit_fingerprint: string;
  dynamic_ten_god_fingerprint: string;
  ten_god_repeat_fingerprint: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

export function ensureBaziTenGodRepeatVersion(chartVersionId: string): BaziTenGodRepeatVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const dynamicTenGod = ensureBaziDynamicTenGodVersion(chart.id);
  const relationAudit = getBaziRelationAuditVersion(dynamicTenGod.relationAuditVersionId);
  if (!relationAudit) throw new Error('八字关系证据版本不存在');
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_ten_god_repeat_versions
    WHERE chart_version_id = ? AND relation_audit_version_id = ?
      AND dynamic_ten_god_version_id = ? AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id,
    relationAudit.id,
    dynamicTenGod.id,
    BAZI_TEN_GOD_REPEAT_METHODOLOGY_VERSION,
    BAZI_TEN_GOD_REPEAT_ENGINE_VERSION,
  ) as TenGodRepeatRow | undefined;
  if (existing) return mapTenGodRepeat(existing);

  const result = auditBaziTenGodRepeats(chart.result, dynamicTenGod.result, relationAudit.result);
  const id = randomUUID();
  const now = Date.now();
  const tenGodRepeatFingerprint = fingerprintTenGodRepeat(
    chart.chartFingerprint,
    relationAudit.relationAuditFingerprint,
    dynamicTenGod.dynamicTenGodFingerprint,
    result,
  );
  getDatabase().prepare(`
    INSERT INTO bazi_ten_god_repeat_versions (
      id, chart_version_id, relation_audit_version_id, dynamic_ten_god_version_id,
      methodology_version, engine_version, chart_fingerprint, relation_audit_fingerprint,
      dynamic_ten_god_fingerprint, ten_god_repeat_fingerprint,
      result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    chart.id,
    relationAudit.id,
    dynamicTenGod.id,
    result.methodologyVersion,
    result.engineVersion,
    chart.chartFingerprint,
    relationAudit.relationAuditFingerprint,
    dynamicTenGod.dynamicTenGodFingerprint,
    tenGodRepeatFingerprint,
    JSON.stringify(result),
    now,
    now,
  );
  return getBaziTenGodRepeatVersion(id)!;
}

export function getBaziTenGodRepeatVersion(id: string): BaziTenGodRepeatVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_ten_god_repeat_versions WHERE id = ?')
    .get(id) as TenGodRepeatRow | undefined;
  return row ? mapTenGodRepeat(row) : null;
}

export function getLatestBaziTenGodRepeatForChart(chartVersionId: string): BaziTenGodRepeatVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM bazi_ten_god_repeat_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC LIMIT 1
  `).get(chartVersionId) as TenGodRepeatRow | undefined;
  return row ? mapTenGodRepeat(row) : null;
}

export function listBaziTenGodRepeatVersions(chartVersionId: string): BaziTenGodRepeatVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_ten_god_repeat_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC
  `).all(chartVersionId) as TenGodRepeatRow[];
  return rows.map(mapTenGodRepeat);
}

function fingerprintTenGodRepeat(
  chartFingerprint: string,
  relationAuditFingerprint: string,
  dynamicTenGodFingerprint: string,
  result: BaziTenGodRepeatResult,
): string {
  return createHash('sha256').update(JSON.stringify({
    chartFingerprint,
    relationAuditFingerprint,
    dynamicTenGodFingerprint,
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

function mapTenGodRepeat(row: TenGodRepeatRow): BaziTenGodRepeatVersion {
  return {
    id: row.id,
    chartVersionId: row.chart_version_id,
    relationAuditVersionId: row.relation_audit_version_id,
    dynamicTenGodVersionId: row.dynamic_ten_god_version_id,
    methodologyVersion: row.methodology_version,
    engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint,
    relationAuditFingerprint: row.relation_audit_fingerprint,
    dynamicTenGodFingerprint: row.dynamic_ten_god_fingerprint,
    tenGodRepeatFingerprint: row.ten_god_repeat_fingerprint,
    result: JSON.parse(row.result_json) as BaziTenGodRepeatResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
