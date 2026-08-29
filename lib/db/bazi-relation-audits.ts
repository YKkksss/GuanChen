import { createHash, randomUUID } from 'node:crypto';
import { auditBaziRelations } from '@/lib/bazi/relation-audit-engine';
import {
  BAZI_RELATION_AUDIT_ENGINE_VERSION,
  BAZI_RELATION_AUDIT_METHODOLOGY_VERSION,
} from '@/lib/bazi/relation-audit-methodology';
import type { BaziRelationAuditResult, BaziRelationAuditVersion } from '@/lib/bazi/relation-audit-types';
import { getBaziChartVersion } from './bazi';
import { ensureBaziAnnualTimelineVersion } from './bazi-annual-timelines';
import { getBaziLuckCycleVersion } from './bazi-luck-cycles';
import { getDatabase } from './client';

interface RelationAuditRow {
  id: string;
  chart_version_id: string;
  luck_cycle_version_id: string;
  annual_timeline_version_id: string;
  methodology_version: string;
  engine_version: string;
  chart_fingerprint: string;
  luck_cycle_fingerprint: string;
  annual_timeline_fingerprint: string;
  relation_audit_fingerprint: string;
  result_json: string;
  created_at: number;
  updated_at: number;
}

export function ensureBaziRelationAuditVersion(chartVersionId: string): BaziRelationAuditVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const annualTimeline = ensureBaziAnnualTimelineVersion(chart.id);
  const luckCycles = getBaziLuckCycleVersion(annualTimeline.luckCycleVersionId);
  if (!luckCycles) throw new Error('八字大运排期版本不存在');
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_relation_audit_versions
    WHERE chart_version_id = ? AND luck_cycle_version_id = ? AND annual_timeline_version_id = ?
      AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id, luckCycles.id, annualTimeline.id,
    BAZI_RELATION_AUDIT_METHODOLOGY_VERSION,
    BAZI_RELATION_AUDIT_ENGINE_VERSION,
  ) as RelationAuditRow | undefined;
  if (existing) return mapRelationAudit(existing);

  const result = auditBaziRelations(chart.result, luckCycles.result, annualTimeline.result);
  const id = randomUUID();
  const now = Date.now();
  const relationAuditFingerprint = fingerprintRelationAudit(
    chart.chartFingerprint,
    luckCycles.luckCycleFingerprint,
    annualTimeline.annualTimelineFingerprint,
    result,
  );
  getDatabase().prepare(`
    INSERT INTO bazi_relation_audit_versions (
      id, chart_version_id, luck_cycle_version_id, annual_timeline_version_id,
      methodology_version, engine_version, chart_fingerprint, luck_cycle_fingerprint,
      annual_timeline_fingerprint, relation_audit_fingerprint,
      result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, chart.id, luckCycles.id, annualTimeline.id,
    result.methodologyVersion, result.engineVersion, chart.chartFingerprint,
    luckCycles.luckCycleFingerprint, annualTimeline.annualTimelineFingerprint,
    relationAuditFingerprint, JSON.stringify(result), now, now,
  );
  return getBaziRelationAuditVersion(id)!;
}

export function getBaziRelationAuditVersion(id: string): BaziRelationAuditVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_relation_audit_versions WHERE id = ?')
    .get(id) as RelationAuditRow | undefined;
  return row ? mapRelationAudit(row) : null;
}

export function getLatestBaziRelationAuditForChart(chartVersionId: string): BaziRelationAuditVersion | null {
  const row = getDatabase().prepare(`
    SELECT * FROM bazi_relation_audit_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC LIMIT 1
  `).get(chartVersionId) as RelationAuditRow | undefined;
  return row ? mapRelationAudit(row) : null;
}

export function listBaziRelationAuditVersions(chartVersionId: string): BaziRelationAuditVersion[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_relation_audit_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC
  `).all(chartVersionId) as RelationAuditRow[];
  return rows.map(mapRelationAudit);
}

function fingerprintRelationAudit(
  chartFingerprint: string,
  luckCycleFingerprint: string,
  annualTimelineFingerprint: string,
  result: BaziRelationAuditResult,
): string {
  return createHash('sha256').update(JSON.stringify({
    chartFingerprint,
    luckCycleFingerprint,
    annualTimelineFingerprint,
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

function mapRelationAudit(row: RelationAuditRow): BaziRelationAuditVersion {
  return {
    id: row.id,
    chartVersionId: row.chart_version_id,
    luckCycleVersionId: row.luck_cycle_version_id,
    annualTimelineVersionId: row.annual_timeline_version_id,
    methodologyVersion: row.methodology_version,
    engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint,
    luckCycleFingerprint: row.luck_cycle_fingerprint,
    annualTimelineFingerprint: row.annual_timeline_fingerprint,
    relationAuditFingerprint: row.relation_audit_fingerprint,
    result: JSON.parse(row.result_json) as BaziRelationAuditResult,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
