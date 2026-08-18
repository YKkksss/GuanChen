import { randomUUID } from 'node:crypto';
import type {
  AnonymousCaseExport,
  CaseAnonymizationPreview,
  CaseAuditLog,
  CaseConfidence,
  CaseConsent,
  CaseConsentScope,
  CaseConsentStatus,
  CaseEventSnapshot,
  CaseListItem,
  CaseRecord,
  CaseSource,
  CaseSourceType,
  CaseStatus,
} from '@/lib/cases/types';
import { getDatabase } from './client';

const CONSENT_VERSION = 'case-consent-v1';

interface CaseRow {
  id: string;
  case_code: string;
  source_conversation_id: string | null;
  title: string;
  status: CaseStatus;
  confidence: CaseConfidence;
  chart_snapshot_json: string;
  anonymization_version: string;
  created_at: number;
  updated_at: number;
  reviewed_at: number | null;
}

interface CaseSourceRow {
  id: string;
  case_id: string;
  source_type: CaseSourceType;
  citation: string | null;
  note: string | null;
  reliability: CaseConfidence;
  created_at: number;
}

interface CaseConsentRow {
  id: string;
  case_id: string;
  scope: CaseConsentScope;
  status: CaseConsentStatus;
  consent_version: string;
  confirmed_at: number;
  revoked_at: number | null;
  updated_at: number;
}

interface CaseEventRow {
  id: string;
  case_id: string;
  category: CaseEventSnapshot['category'];
  age_band: string | null;
  date_precision: CaseEventSnapshot['datePrecision'];
  impact_level: CaseEventSnapshot['impactLevel'];
  source_kind: CaseEventSnapshot['sourceKind'];
  created_at: number;
}

interface CaseAuditRow {
  id: string;
  case_id: string;
  action: string;
  metadata_json: string | null;
  created_at: number;
}

export function createCaseRecord(input: {
  preview: CaseAnonymizationPreview;
  title?: string;
  confidence?: CaseConfidence;
  scopes: CaseConsentScope[];
}): CaseRecord {
  const db = getDatabase();
  const id = randomUUID();
  const caseCode = `CASE-${id.replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  const now = Date.now();
  const title = normalizeCaseTitle(input.title, caseCode);
  const scopes = Array.from(new Set<CaseConsentScope>(['local_only', ...input.scopes]))
    .filter(scope => scope !== 'public_release');

  db.transaction(() => {
    db.prepare(`
      INSERT INTO case_records (
        id, case_code, source_conversation_id, title, status, confidence,
        chart_snapshot_json, anonymization_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
    `).run(
      id,
      caseCode,
      input.preview.sourceConversationId,
      title,
      input.confidence ?? 'medium',
      JSON.stringify(input.preview.chartSnapshot),
      input.preview.anonymizationVersion,
      now,
      now,
    );

    db.prepare(`
      INSERT INTO case_sources (
        id, case_id, source_type, citation, note, reliability, created_at
      ) VALUES (?, ?, 'local_chart', NULL, ?, ?, ?)
    `).run(
      randomUUID(),
      id,
      '由本地已保存命盘经脱敏预览并确认后生成；原始会话不包含在匿名案例数据中。',
      input.confidence ?? 'medium',
      now,
    );

    const insertConsent = db.prepare(`
      INSERT INTO case_consents (
        id, case_id, scope, status, consent_version,
        confirmed_at, revoked_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, ?, NULL, ?)
    `);
    scopes.forEach(scope => insertConsent.run(randomUUID(), id, scope, CONSENT_VERSION, now, now));

    const insertEvent = db.prepare(`
      INSERT INTO case_event_snapshots (
        id, case_id, category, age_band, date_precision,
        impact_level, source_kind, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'user_confirmed', ?)
    `);
    input.preview.events.forEach(event => insertEvent.run(
      randomUUID(), id, event.category, event.ageBand,
      event.datePrecision, event.impactLevel, now,
    ));

    insertAudit(id, 'created', {
      anonymizationVersion: input.preview.anonymizationVersion,
      eventCount: input.preview.events.length,
      scopes,
    }, now);
  })();

  return getCaseRecord(id)!;
}

export function listCaseRecords(input: {
  status?: CaseStatus;
  limit?: number;
  offset?: number;
} = {}): CaseListItem[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (input.status) {
    clauses.push('r.status = ?');
    params.push(input.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const rows = getDatabase().prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM case_event_snapshots e WHERE e.case_id = r.id) AS event_count,
      COALESCE((
        SELECT json_group_array(scope)
        FROM case_consents c
        WHERE c.case_id = r.id AND c.status = 'active'
      ), '[]') AS active_scopes_json
    FROM case_records r
    ${where}
    ORDER BY r.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Array<CaseRow & { event_count: number; active_scopes_json: string }>;

  return rows.map(row => {
    const chart = JSON.parse(row.chart_snapshot_json) as CaseRecord['chartSnapshot'];
    return {
      id: row.id,
      caseCode: row.case_code,
      title: row.title,
      status: row.status,
      confidence: row.confidence,
      eventCount: row.event_count,
      activeScopes: JSON.parse(row.active_scopes_json) as CaseConsentScope[],
      wuxingJuName: chart.wuxingJuName,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export function getCaseRecord(id: string): CaseRecord | null {
  const row = getDatabase().prepare('SELECT * FROM case_records WHERE id = ?').get(id) as CaseRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    caseCode: row.case_code,
    sourceConversationId: row.source_conversation_id,
    title: row.title,
    status: row.status,
    confidence: row.confidence,
    chartSnapshot: JSON.parse(row.chart_snapshot_json) as CaseRecord['chartSnapshot'],
    anonymizationVersion: row.anonymization_version,
    sources: listCaseSources(id),
    consents: listCaseConsents(id),
    events: listCaseEvents(id),
    auditLogs: listCaseAuditLogs(id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
  };
}

export function updateCaseRecord(id: string, input: {
  title?: string;
  status?: CaseStatus;
  confidence?: CaseConfidence;
}): CaseRecord | null {
  const existing = getCaseRecord(id);
  if (!existing) return null;
  const status = input.status ?? existing.status;
  const now = Date.now();
  const reviewedAt = status === 'reviewed'
    ? existing.reviewedAt ?? now
    : existing.reviewedAt;
  getDatabase().transaction(() => {
    getDatabase().prepare(`
      UPDATE case_records
      SET title = ?, status = ?, confidence = ?, reviewed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      normalizeCaseTitle(input.title ?? existing.title, existing.caseCode),
      status,
      input.confidence ?? existing.confidence,
      reviewedAt,
      now,
      id,
    );
    insertAudit(id, 'updated', {
      status,
      confidence: input.confidence ?? existing.confidence,
    }, now);
  })();
  return getCaseRecord(id);
}

export function setCaseConsent(input: {
  caseId: string;
  scope: CaseConsentScope;
  active: boolean;
}): CaseRecord | null {
  const existing = getCaseRecord(input.caseId);
  if (!existing) return null;
  if (input.scope === 'local_only' && !input.active) {
    throw new Error('本地保存授权是案例存在的基础，不能撤销；如不再保留请删除案例');
  }
  if (input.scope === 'public_release') {
    throw new Error('M7-0 暂不开放公开发布授权');
  }
  const now = Date.now();
  const current = existing.consents.find(consent => consent.scope === input.scope);
  getDatabase().transaction(() => {
    if (current) {
      getDatabase().prepare(`
        UPDATE case_consents
        SET status = ?, confirmed_at = ?, revoked_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        input.active ? 'active' : 'revoked',
        input.active ? now : current.confirmedAt,
        input.active ? null : now,
        now,
        current.id,
      );
    } else if (input.active) {
      getDatabase().prepare(`
        INSERT INTO case_consents (
          id, case_id, scope, status, consent_version,
          confirmed_at, revoked_at, updated_at
        ) VALUES (?, ?, ?, 'active', ?, ?, NULL, ?)
      `).run(randomUUID(), input.caseId, input.scope, CONSENT_VERSION, now, now);
    }
    getDatabase().prepare('UPDATE case_records SET updated_at = ? WHERE id = ?').run(now, input.caseId);
    insertAudit(input.caseId, input.active ? 'consent_granted' : 'consent_revoked', {
      scope: input.scope,
      consentVersion: CONSENT_VERSION,
    }, now);
  })();
  return getCaseRecord(input.caseId);
}

export function buildAnonymousCaseExport(id: string): AnonymousCaseExport {
  const record = getCaseRecord(id);
  if (!record) throw new Error('案例不存在');
  if (record.status !== 'reviewed') throw new Error('案例通过复核后才能导出');
  const consent = record.consents.find(item => item.scope === 'anonymous_export' && item.status === 'active');
  if (!consent) throw new Error('尚未授权匿名导出，或该授权已经撤销');
  const now = Date.now();
  insertAudit(id, 'exported', { scope: 'anonymous_export', formatVersion: 1 }, now);
  return {
    format: 'ziweidoushu-anonymous-case',
    formatVersion: 1,
    caseCode: record.caseCode,
    title: record.title,
    confidence: record.confidence,
    anonymizationVersion: record.anonymizationVersion,
    chartSnapshot: record.chartSnapshot,
    source: record.sources[0] ? {
      sourceType: record.sources[0].sourceType,
      citation: record.sources[0].citation,
      note: record.sources[0].note,
      reliability: record.sources[0].reliability,
    } : null,
    events: record.events.map(({ id: _id, caseId: _caseId, createdAt: _createdAt, ...event }) => event),
    authorization: {
      scope: 'anonymous_export',
      consentVersion: consent.consentVersion,
      confirmedAt: consent.confirmedAt,
    },
    exportedAt: now,
  };
}

export function deleteCaseRecord(id: string, caseCode: string): boolean {
  const existing = getCaseRecord(id);
  if (!existing || existing.caseCode !== caseCode) return false;
  return getDatabase().prepare('DELETE FROM case_records WHERE id = ?').run(id).changes > 0;
}

function listCaseSources(caseId: string): CaseSource[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM case_sources WHERE case_id = ? ORDER BY created_at ASC
  `).all(caseId) as CaseSourceRow[];
  return rows.map(row => ({
    id: row.id, caseId: row.case_id, sourceType: row.source_type,
    citation: row.citation, note: row.note, reliability: row.reliability, createdAt: row.created_at,
  }));
}

function listCaseConsents(caseId: string): CaseConsent[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM case_consents WHERE case_id = ? ORDER BY confirmed_at ASC
  `).all(caseId) as CaseConsentRow[];
  return rows.map(row => ({
    id: row.id, caseId: row.case_id, scope: row.scope, status: row.status,
    consentVersion: row.consent_version, confirmedAt: row.confirmed_at,
    revokedAt: row.revoked_at, updatedAt: row.updated_at,
  }));
}

function listCaseEvents(caseId: string): CaseEventSnapshot[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM case_event_snapshots WHERE case_id = ? ORDER BY created_at ASC
  `).all(caseId) as CaseEventRow[];
  return rows.map(row => ({
    id: row.id, caseId: row.case_id, category: row.category, ageBand: row.age_band,
    datePrecision: row.date_precision, impactLevel: row.impact_level,
    sourceKind: row.source_kind, createdAt: row.created_at,
  }));
}

function listCaseAuditLogs(caseId: string): CaseAuditLog[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM case_audit_logs WHERE case_id = ? ORDER BY created_at DESC
  `).all(caseId) as CaseAuditRow[];
  return rows.map(row => ({
    id: row.id, caseId: row.case_id, action: row.action,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : null,
    createdAt: row.created_at,
  }));
}

function insertAudit(caseId: string, action: string, metadata: Record<string, unknown>, now = Date.now()) {
  getDatabase().prepare(`
    INSERT INTO case_audit_logs (id, case_id, action, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), caseId, action, JSON.stringify(metadata), now);
}

function normalizeCaseTitle(value: string | undefined, caseCode: string): string {
  const title = value?.trim().slice(0, 60);
  return title || `匿名案例 ${caseCode.slice(-6)}`;
}
