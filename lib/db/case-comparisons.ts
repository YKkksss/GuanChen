import { randomUUID } from 'node:crypto';
import {
  buildCaseComparisonResult,
  CASE_COMPARISON_ENGINE_VERSION,
} from '@/lib/cases/comparison-engine';
import type {
  CaseComparison,
  CaseComparisonListItem,
  CaseComparisonMode,
  CaseComparisonResult,
  CaseComparisonStatus,
  CaseRecord,
} from '@/lib/cases/types';
import { getCaseRecord } from './cases';
import { isTeachingCaseEligible } from './case-search';
import { getDatabase } from './client';

interface ComparisonRow {
  id: string;
  comparison_code: string;
  comparison_key: string;
  mode: CaseComparisonMode;
  title: string;
  status: CaseComparisonStatus;
  left_case_id: string;
  right_case_id: string;
  left_stage_key: string | null;
  right_stage_key: string | null;
  engine_version: string;
  result_json: string;
  left_case_updated_at: number;
  right_case_updated_at: number;
  created_at: number;
  updated_at: number;
}

export function createOrRefreshCaseComparison(input: {
  mode: CaseComparisonMode;
  leftCaseId: string;
  rightCaseId?: string;
  leftStageKey?: string | null;
  rightStageKey?: string | null;
}): CaseComparison {
  const rightCaseId = input.mode === 'daxian_to_daxian'
    ? input.leftCaseId
    : input.rightCaseId;
  if (!rightCaseId) throw new Error('请选择右侧匿名案例');
  if (input.mode === 'chart_to_chart' && input.leftCaseId === rightCaseId) {
    throw new Error('两个命盘对比需要选择不同案例；同一案例请使用大限对比');
  }
  const left = requireTeachingCase(input.leftCaseId);
  const right = requireTeachingCase(rightCaseId);
  const leftStageKey = input.mode === 'daxian_to_daxian' ? input.leftStageKey ?? null : null;
  const rightStageKey = input.mode === 'daxian_to_daxian' ? input.rightStageKey ?? null : null;
  const result = buildCaseComparisonResult({
    mode: input.mode,
    left,
    right,
    leftStageKey,
    rightStageKey,
  });
  const comparisonKey = buildComparisonKey(
    input.mode,
    left.id,
    right.id,
    leftStageKey,
    rightStageKey,
  );
  const existing = getDatabase().prepare(`
    SELECT * FROM case_comparisons WHERE comparison_key = ?
  `).get(comparisonKey) as ComparisonRow | undefined;
  const now = Date.now();
  const title = comparisonTitle(result);

  if (existing) {
    getDatabase().prepare(`
      UPDATE case_comparisons
      SET title = ?, status = 'active', engine_version = ?, result_json = ?,
          left_case_updated_at = ?, right_case_updated_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      title,
      CASE_COMPARISON_ENGINE_VERSION,
      JSON.stringify(result),
      left.updatedAt,
      right.updatedAt,
      now,
      existing.id,
    );
    return getCaseComparison(existing.id)!;
  }

  const id = randomUUID();
  const code = `CMP-${id.replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  getDatabase().prepare(`
    INSERT INTO case_comparisons (
      id, comparison_code, comparison_key, mode, title, status,
      left_case_id, right_case_id, left_stage_key, right_stage_key,
      engine_version, result_json, left_case_updated_at, right_case_updated_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    code,
    comparisonKey,
    input.mode,
    title,
    left.id,
    right.id,
    leftStageKey,
    rightStageKey,
    CASE_COMPARISON_ENGINE_VERSION,
    JSON.stringify(result),
    left.updatedAt,
    right.updatedAt,
    now,
    now,
  );
  return getCaseComparison(id)!;
}

export function getCaseComparison(id: string): CaseComparison | null {
  const row = getDatabase().prepare(`
    SELECT * FROM case_comparisons WHERE id = ?
  `).get(id) as ComparisonRow | undefined;
  if (!row) return null;
  const left = requireTeachingCase(row.left_case_id);
  const right = requireTeachingCase(row.right_case_id);
  if (
    row.engine_version !== CASE_COMPARISON_ENGINE_VERSION
    || row.left_case_updated_at !== left.updatedAt
    || row.right_case_updated_at !== right.updatedAt
  ) {
    return refreshRow(row, left, right);
  }
  return mapComparison(row);
}

export function listCaseComparisons(input: {
  status?: CaseComparisonStatus;
  limit?: number;
  offset?: number;
} = {}): CaseComparisonListItem[] {
  const status = input.status ?? 'active';
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const rows = getDatabase().prepare(`
    SELECT comparison.*
    FROM case_comparisons comparison
    JOIN case_records left_case ON left_case.id = comparison.left_case_id
    JOIN case_records right_case ON right_case.id = comparison.right_case_id
    WHERE comparison.status = ?
      AND left_case.status = 'reviewed'
      AND right_case.status = 'reviewed'
      AND EXISTS (
        SELECT 1 FROM case_consents consent
        WHERE consent.case_id = left_case.id
          AND consent.scope = 'teaching' AND consent.status = 'active'
      )
      AND EXISTS (
        SELECT 1 FROM case_consents consent
        WHERE consent.case_id = right_case.id
          AND consent.scope = 'teaching' AND consent.status = 'active'
      )
    ORDER BY comparison.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(status, limit, offset) as ComparisonRow[];
  return rows.map(row => {
    const result = JSON.parse(row.result_json) as CaseComparisonResult;
    return {
      id: row.id,
      comparisonCode: row.comparison_code,
      mode: row.mode,
      title: row.title,
      status: row.status,
      leftLabel: sideLabel(result.left),
      rightLabel: sideLabel(result.right),
      counts: result.counts,
      updatedAt: row.updated_at,
    };
  });
}

export function setCaseComparisonStatus(id: string, status: CaseComparisonStatus): CaseComparison | null {
  const existing = getCaseComparison(id);
  if (!existing) return null;
  getDatabase().prepare(`
    UPDATE case_comparisons SET status = ?, updated_at = ? WHERE id = ?
  `).run(status, Date.now(), id);
  return getCaseComparison(id);
}

function refreshRow(row: ComparisonRow, left: CaseRecord, right: CaseRecord): CaseComparison {
  const result = buildCaseComparisonResult({
    mode: row.mode,
    left,
    right,
    leftStageKey: row.left_stage_key,
    rightStageKey: row.right_stage_key,
  });
  const now = Date.now();
  getDatabase().prepare(`
    UPDATE case_comparisons
    SET title = ?, engine_version = ?, result_json = ?,
        left_case_updated_at = ?, right_case_updated_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    comparisonTitle(result),
    CASE_COMPARISON_ENGINE_VERSION,
    JSON.stringify(result),
    left.updatedAt,
    right.updatedAt,
    now,
    row.id,
  );
  return mapComparison({
    ...row,
    title: comparisonTitle(result),
    engine_version: CASE_COMPARISON_ENGINE_VERSION,
    result_json: JSON.stringify(result),
    left_case_updated_at: left.updatedAt,
    right_case_updated_at: right.updatedAt,
    updated_at: now,
  });
}

function requireTeachingCase(id: string): CaseRecord {
  const record = getCaseRecord(id);
  if (!record) throw new Error('案例不存在');
  if (!isTeachingCaseEligible(id)) {
    throw new Error('案例尚未通过复核，或教学授权已经撤销');
  }
  return record;
}

function buildComparisonKey(
  mode: CaseComparisonMode,
  leftCaseId: string,
  rightCaseId: string,
  leftStageKey: string | null,
  rightStageKey: string | null,
) {
  return [mode, leftCaseId, rightCaseId, leftStageKey ?? '', rightStageKey ?? '', CASE_COMPARISON_ENGINE_VERSION].join('|');
}

function comparisonTitle(result: CaseComparisonResult) {
  return result.mode === 'chart_to_chart'
    ? `${result.left.title} × ${result.right.title}`
    : `${result.left.title}：${result.left.stageLabel} × ${result.right.stageLabel}`;
}

function sideLabel(side: CaseComparisonResult['left']) {
  return side.stageLabel ? `${side.caseCode} · ${side.stageLabel}` : `${side.caseCode} · ${side.title}`;
}

function mapComparison(row: ComparisonRow): CaseComparison {
  return {
    id: row.id,
    comparisonCode: row.comparison_code,
    mode: row.mode,
    title: row.title,
    status: row.status,
    leftCaseId: row.left_case_id,
    rightCaseId: row.right_case_id,
    leftStageKey: row.left_stage_key,
    rightStageKey: row.right_stage_key,
    engineVersion: row.engine_version,
    result: JSON.parse(row.result_json) as CaseComparisonResult,
    leftCaseUpdatedAt: row.left_case_updated_at,
    rightCaseUpdatedAt: row.right_case_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
