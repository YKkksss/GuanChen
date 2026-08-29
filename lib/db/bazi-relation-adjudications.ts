import { createHash, randomUUID } from 'node:crypto';
import { adjudicateBaziRelations } from '@/lib/bazi/relation-adjudication-engine';
import {
  BAZI_RELATION_ADJUDICATION_ENGINE_VERSION,
  BAZI_RELATION_ADJUDICATION_METHODOLOGY_VERSION,
} from '@/lib/bazi/relation-adjudication-methodology';
import type {
  BaziRelationAdjudicationResult,
  BaziRelationAdjudicationVersion,
} from '@/lib/bazi/relation-adjudication-types';
import { getBaziChartVersion } from './bazi';
import { ensureBaziRelationAuditVersion, getBaziRelationAuditVersion } from './bazi-relation-audits';
import { getDatabase } from './client';

interface RelationAdjudicationRow {
  id: string;
  chart_version_id: string;
  relation_audit_version_id: string;
  methodology_version: string;
  engine_version: string;
  chart_fingerprint: string;
  relation_audit_fingerprint: string;
  relation_adjudication_fingerprint: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

export function ensureBaziRelationAdjudicationVersion(chartVersionId: string): BaziRelationAdjudicationVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const relationAudit = ensureBaziRelationAuditVersion(chart.id);
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_relation_adjudication_versions
    WHERE chart_version_id = ? AND relation_audit_version_id = ?
      AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id,
    relationAudit.id,
    BAZI_RELATION_ADJUDICATION_METHODOLOGY_VERSION,
    BAZI_RELATION_ADJUDICATION_ENGINE_VERSION,
  ) as RelationAdjudicationRow | undefined;
  if (existing) return mapRelationAdjudication(existing);

  const result = adjudicateBaziRelations(chart.result, relationAudit.result);
  const id = randomUUID();
  const now = Date.now();
  const relationAdjudicationFingerprint = fingerprintRelationAdjudication(
    chart.chartFingerprint,
    relationAudit.relationAuditFingerprint,
    result,
  );
  getDatabase().prepare(`
    INSERT INTO bazi_relation_adjudication_versions (
      id, chart_version_id, relation_audit_version_id,
      methodology_version, engine_version, chart_fingerprint,
      relation_audit_fingerprint, relation_adjudication_fingerprint,
      result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    chart.id,
    relationAudit.id,
    result.methodologyVersion,
    result.engineVersion,
    chart.chartFingerprint,
    relationAudit.relationAuditFingerprint,
    relationAdjudicationFingerprint,
    JSON.stringify(result),
    now,
    now,
  );
  return getBaziRelationAdjudicationVersion(id)!;
}

export function getBaziRelationAdjudicationVersion(id: string): BaziRelationAdjudicationVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_relation_adjudication_versions WHERE id = ?')
    .get(id) as RelationAdjudicationRow | undefined;
  return row ? mapRelationAdjudication(row) : null;
}

export function getLatestBaziRelationAdjudicationForChart(chartVersionId: string): BaziRelationAdjudicationVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM bazi_relation_adjudication_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC LIMIT 1
  `).get(chartVersionId) as RelationAdjudicationRow | undefined;
  return row ? mapRelationAdjudication(row) : null;
}

export function listBaziRelationAdjudicationVersions(chartVersionId: string): BaziRelationAdjudicationVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_relation_adjudication_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC
  `).all(chartVersionId) as RelationAdjudicationRow[];
  return rows.map(mapRelationAdjudication);
}

function fingerprintRelationAdjudication(
  chartFingerprint: string,
  relationAuditFingerprint: string,
  result: BaziRelationAdjudicationResult,
): string {
  return createHash('sha256').update(JSON.stringify({
    chartFingerprint,
    relationAuditFingerprint,
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

function mapRelationAdjudication(row: RelationAdjudicationRow): BaziRelationAdjudicationVersion {
  return {
    id: row.id,
    chartVersionId: row.chart_version_id,
    relationAuditVersionId: row.relation_audit_version_id,
    methodologyVersion: row.methodology_version,
    engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint,
    relationAuditFingerprint: row.relation_audit_fingerprint,
    relationAdjudicationFingerprint: row.relation_adjudication_fingerprint,
    result: JSON.parse(row.result_json) as BaziRelationAdjudicationResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
