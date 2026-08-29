import { createHash, randomUUID } from 'node:crypto';
import { auditBaziDynamicTenGods } from '@/lib/bazi/dynamic-ten-god-engine';
import {
  BAZI_DYNAMIC_TEN_GOD_ENGINE_VERSION,
  BAZI_DYNAMIC_TEN_GOD_METHODOLOGY_VERSION,
} from '@/lib/bazi/dynamic-ten-god-methodology';
import type { BaziDynamicTenGodResult, BaziDynamicTenGodVersion } from '@/lib/bazi/dynamic-ten-god-types';
import { getBaziChartVersion } from './bazi';
import { getBaziAnnualTimelineVersion } from './bazi-annual-timelines';
import { ensureBaziRelationAdjudicationVersion } from './bazi-relation-adjudications';
import { getBaziRelationAuditVersion } from './bazi-relation-audits';
import { getDatabase } from './client';

interface DynamicTenGodRow {
  id: string;
  chart_version_id: string;
  annual_timeline_version_id: string;
  relation_audit_version_id: string;
  relation_adjudication_version_id: string;
  methodology_version: string;
  engine_version: string;
  chart_fingerprint: string;
  annual_timeline_fingerprint: string;
  relation_audit_fingerprint: string;
  relation_adjudication_fingerprint: string;
  dynamic_ten_god_fingerprint: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

export function ensureBaziDynamicTenGodVersion(chartVersionId: string): BaziDynamicTenGodVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const relationAdjudication = ensureBaziRelationAdjudicationVersion(chart.id);
  const relationAudit = getBaziRelationAuditVersion(relationAdjudication.relationAuditVersionId);
  if (!relationAudit) throw new Error('八字关系证据版本不存在');
  const annualTimeline = getBaziAnnualTimelineVersion(relationAudit.annualTimelineVersionId);
  if (!annualTimeline) throw new Error('八字流年时间轴版本不存在');
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_dynamic_ten_god_versions
    WHERE chart_version_id = ? AND annual_timeline_version_id = ?
      AND relation_audit_version_id = ? AND relation_adjudication_version_id = ?
      AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id,
    annualTimeline.id,
    relationAudit.id,
    relationAdjudication.id,
    BAZI_DYNAMIC_TEN_GOD_METHODOLOGY_VERSION,
    BAZI_DYNAMIC_TEN_GOD_ENGINE_VERSION,
  ) as DynamicTenGodRow | undefined;
  if (existing) return mapDynamicTenGod(existing);

  const result = auditBaziDynamicTenGods(chart.result, relationAudit.result, relationAdjudication.result);
  const id = randomUUID();
  const now = Date.now();
  const dynamicTenGodFingerprint = fingerprintDynamicTenGod(
    chart.chartFingerprint,
    annualTimeline.annualTimelineFingerprint,
    relationAudit.relationAuditFingerprint,
    relationAdjudication.relationAdjudicationFingerprint,
    result,
  );
  getDatabase().prepare(`
    INSERT INTO bazi_dynamic_ten_god_versions (
      id, chart_version_id, annual_timeline_version_id, relation_audit_version_id,
      relation_adjudication_version_id, methodology_version, engine_version,
      chart_fingerprint, annual_timeline_fingerprint, relation_audit_fingerprint,
      relation_adjudication_fingerprint, dynamic_ten_god_fingerprint,
      result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    chart.id,
    annualTimeline.id,
    relationAudit.id,
    relationAdjudication.id,
    result.methodologyVersion,
    result.engineVersion,
    chart.chartFingerprint,
    annualTimeline.annualTimelineFingerprint,
    relationAudit.relationAuditFingerprint,
    relationAdjudication.relationAdjudicationFingerprint,
    dynamicTenGodFingerprint,
    JSON.stringify(result),
    now,
    now,
  );
  return getBaziDynamicTenGodVersion(id)!;
}

export function getBaziDynamicTenGodVersion(id: string): BaziDynamicTenGodVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_dynamic_ten_god_versions WHERE id = ?')
    .get(id) as DynamicTenGodRow | undefined;
  return row ? mapDynamicTenGod(row) : null;
}

export function getLatestBaziDynamicTenGodForChart(chartVersionId: string): BaziDynamicTenGodVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM bazi_dynamic_ten_god_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC LIMIT 1
  `).get(chartVersionId) as DynamicTenGodRow | undefined;
  return row ? mapDynamicTenGod(row) : null;
}

export function listBaziDynamicTenGodVersions(chartVersionId: string): BaziDynamicTenGodVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_dynamic_ten_god_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC
  `).all(chartVersionId) as DynamicTenGodRow[];
  return rows.map(mapDynamicTenGod);
}

function fingerprintDynamicTenGod(
  chartFingerprint: string,
  annualTimelineFingerprint: string,
  relationAuditFingerprint: string,
  relationAdjudicationFingerprint: string,
  result: BaziDynamicTenGodResult,
): string {
  return createHash('sha256').update(JSON.stringify({
    chartFingerprint,
    annualTimelineFingerprint,
    relationAuditFingerprint,
    relationAdjudicationFingerprint,
    methodologyVersion: result.methodologyVersion,
    engineVersion: result.engineVersion,
    status: result.status,
    dayMaster: result.dayMaster,
    source: result.source,
    range: result.range,
    years: result.years,
    rulesApplied: result.rulesApplied,
    warnings: result.warnings,
    boundary: result.boundary,
  })).digest('hex');
}

function mapDynamicTenGod(row: DynamicTenGodRow): BaziDynamicTenGodVersion {
  return {
    id: row.id,
    chartVersionId: row.chart_version_id,
    annualTimelineVersionId: row.annual_timeline_version_id,
    relationAuditVersionId: row.relation_audit_version_id,
    relationAdjudicationVersionId: row.relation_adjudication_version_id,
    methodologyVersion: row.methodology_version,
    engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint,
    annualTimelineFingerprint: row.annual_timeline_fingerprint,
    relationAuditFingerprint: row.relation_audit_fingerprint,
    relationAdjudicationFingerprint: row.relation_adjudication_fingerprint,
    dynamicTenGodFingerprint: row.dynamic_ten_god_fingerprint,
    result: JSON.parse(row.result_json) as BaziDynamicTenGodResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
