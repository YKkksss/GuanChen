import { createHash, randomUUID } from 'node:crypto';
import { auditBaziHiddenStemActivationConditions } from '@/lib/bazi/hidden-stem-activation-engine';
import {
  BAZI_HIDDEN_STEM_ACTIVATION_ENGINE_VERSION,
  BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY_VERSION,
} from '@/lib/bazi/hidden-stem-activation-methodology';
import type { BaziHiddenStemActivationResult, BaziHiddenStemActivationVersion } from '@/lib/bazi/hidden-stem-activation-types';
import { getBaziChartVersion } from './bazi';
import { ensureBaziDynamicTenGodVersion } from './bazi-dynamic-ten-gods';
import { ensureBaziRelationAdjudicationVersion } from './bazi-relation-adjudications';
import { ensureBaziRelationAuditVersion } from './bazi-relation-audits';
import { ensureBaziTenGodRepeatVersion } from './bazi-ten-god-repeats';
import { ensureBaziTransparencyRootVersion } from './bazi-transparency-roots';
import { getDatabase } from './client';

interface HiddenStemActivationRow {
  id: string; chart_version_id: string; relation_audit_version_id: string;
  relation_adjudication_version_id: string; dynamic_ten_god_version_id: string;
  ten_god_repeat_version_id: string; transparency_root_version_id: string;
  methodology_version: string; engine_version: string; chart_fingerprint: string;
  relation_audit_fingerprint: string; relation_adjudication_fingerprint: string;
  dynamic_ten_god_fingerprint: string; ten_god_repeat_fingerprint: string;
  transparency_root_fingerprint: string; hidden_stem_activation_fingerprint: string;
  result_json: string; created_at: number; updated_at: number;
}

export function ensureBaziHiddenStemActivationVersion(chartVersionId: string): BaziHiddenStemActivationVersion {
  const chart = getBaziChartVersion(chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const relationAudit = ensureBaziRelationAuditVersion(chart.id);
  const relationAdjudication = ensureBaziRelationAdjudicationVersion(chart.id);
  const dynamicTenGod = ensureBaziDynamicTenGodVersion(chart.id);
  const tenGodRepeat = ensureBaziTenGodRepeatVersion(chart.id);
  const transparencyRoot = ensureBaziTransparencyRootVersion(chart.id);
  const existing = getDatabase().prepare(`
    SELECT * FROM bazi_hidden_stem_activation_versions
    WHERE chart_version_id = ? AND relation_audit_version_id = ? AND relation_adjudication_version_id = ?
      AND dynamic_ten_god_version_id = ? AND ten_god_repeat_version_id = ? AND transparency_root_version_id = ?
      AND methodology_version = ? AND engine_version = ?
  `).get(
    chart.id, relationAudit.id, relationAdjudication.id, dynamicTenGod.id, tenGodRepeat.id, transparencyRoot.id,
    BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY_VERSION, BAZI_HIDDEN_STEM_ACTIVATION_ENGINE_VERSION,
  ) as HiddenStemActivationRow | undefined;
  if (existing) return mapHiddenStemActivation(existing);

  const result = auditBaziHiddenStemActivationConditions(
    chart.result, relationAudit.result, relationAdjudication.result,
    dynamicTenGod.result, tenGodRepeat.result, transparencyRoot.result,
  );
  const id = randomUUID();
  const now = Date.now();
  const hiddenStemActivationFingerprint = fingerprintHiddenStemActivation({
    chartFingerprint: chart.chartFingerprint,
    relationAuditFingerprint: relationAudit.relationAuditFingerprint,
    relationAdjudicationFingerprint: relationAdjudication.relationAdjudicationFingerprint,
    dynamicTenGodFingerprint: dynamicTenGod.dynamicTenGodFingerprint,
    tenGodRepeatFingerprint: tenGodRepeat.tenGodRepeatFingerprint,
    transparencyRootFingerprint: transparencyRoot.transparencyRootFingerprint,
    result,
  });
  getDatabase().prepare(`
    INSERT INTO bazi_hidden_stem_activation_versions (
      id, chart_version_id, relation_audit_version_id, relation_adjudication_version_id,
      dynamic_ten_god_version_id, ten_god_repeat_version_id, transparency_root_version_id,
      methodology_version, engine_version, chart_fingerprint, relation_audit_fingerprint,
      relation_adjudication_fingerprint, dynamic_ten_god_fingerprint, ten_god_repeat_fingerprint,
      transparency_root_fingerprint, hidden_stem_activation_fingerprint,
      result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, chart.id, relationAudit.id, relationAdjudication.id, dynamicTenGod.id, tenGodRepeat.id, transparencyRoot.id,
    result.methodologyVersion, result.engineVersion, chart.chartFingerprint, relationAudit.relationAuditFingerprint,
    relationAdjudication.relationAdjudicationFingerprint, dynamicTenGod.dynamicTenGodFingerprint,
    tenGodRepeat.tenGodRepeatFingerprint, transparencyRoot.transparencyRootFingerprint,
    hiddenStemActivationFingerprint, JSON.stringify(result), now, now,
  );
  return getBaziHiddenStemActivationVersion(id)!;
}

export function getBaziHiddenStemActivationVersion(id: string): BaziHiddenStemActivationVersion | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_hidden_stem_activation_versions WHERE id = ?')
    .get(id) as HiddenStemActivationRow | undefined;
  return row ? mapHiddenStemActivation(row) : null;
}

export function getLatestBaziHiddenStemActivationForChart(chartVersionId: string): BaziHiddenStemActivationVersion | null {
  const row = getDatabase().prepare(`SELECT * FROM bazi_hidden_stem_activation_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC LIMIT 1`).get(chartVersionId) as HiddenStemActivationRow | undefined;
  return row ? mapHiddenStemActivation(row) : null;
}

export function listBaziHiddenStemActivationVersions(chartVersionId: string): BaziHiddenStemActivationVersion[] {
  const rows = getDatabase().prepare(`SELECT * FROM bazi_hidden_stem_activation_versions
    WHERE chart_version_id = ? ORDER BY updated_at DESC`).all(chartVersionId) as HiddenStemActivationRow[];
  return rows.map(mapHiddenStemActivation);
}

function fingerprintHiddenStemActivation(input: {
  chartFingerprint: string; relationAuditFingerprint: string; relationAdjudicationFingerprint: string;
  dynamicTenGodFingerprint: string; tenGodRepeatFingerprint: string; transparencyRootFingerprint: string;
  result: BaziHiddenStemActivationResult;
}): string {
  return createHash('sha256').update(JSON.stringify({
    ...input,
    result: {
      methodologyVersion: input.result.methodologyVersion, engineVersion: input.result.engineVersion,
      status: input.result.status, source: input.result.source, range: input.result.range,
      years: input.result.years, rulesApplied: input.result.rulesApplied,
      warnings: input.result.warnings, boundary: input.result.boundary,
    },
  })).digest('hex');
}

function mapHiddenStemActivation(row: HiddenStemActivationRow): BaziHiddenStemActivationVersion {
  return {
    id: row.id, chartVersionId: row.chart_version_id,
    relationAuditVersionId: row.relation_audit_version_id,
    relationAdjudicationVersionId: row.relation_adjudication_version_id,
    dynamicTenGodVersionId: row.dynamic_ten_god_version_id,
    tenGodRepeatVersionId: row.ten_god_repeat_version_id,
    transparencyRootVersionId: row.transparency_root_version_id,
    methodologyVersion: row.methodology_version, engineVersion: row.engine_version,
    chartFingerprint: row.chart_fingerprint, relationAuditFingerprint: row.relation_audit_fingerprint,
    relationAdjudicationFingerprint: row.relation_adjudication_fingerprint,
    dynamicTenGodFingerprint: row.dynamic_ten_god_fingerprint,
    tenGodRepeatFingerprint: row.ten_god_repeat_fingerprint,
    transparencyRootFingerprint: row.transparency_root_fingerprint,
    hiddenStemActivationFingerprint: row.hidden_stem_activation_fingerprint,
    result: JSON.parse(row.result_json) as BaziHiddenStemActivationResult,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
