import { randomUUID } from 'node:crypto';
import type { AnnualTransitReport, TransitReportStatus } from '@/lib/transits/types';
import { getDatabase } from './client';

interface TransitReportRow {
  id: string;
  conversation_id: string;
  snapshot_id: string;
  level: 'year';
  target_date: string;
  engine_version: string;
  prompt_version: string;
  provider: string;
  model: string;
  content: string;
  status: TransitReportStatus;
  error_code: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

function mapRow(row: TransitReportRow): AnnualTransitReport {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    snapshotId: row.snapshot_id,
    level: row.level,
    targetDate: row.target_date,
    engineVersion: row.engine_version,
    promptVersion: row.prompt_version,
    provider: row.provider,
    model: row.model,
    content: row.content,
    status: row.status,
    errorCode: row.error_code,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export function getAnnualTransitReport(input: {
  conversationId: string;
  targetDate: string;
  engineVersion: string;
  promptVersion: string;
}): AnnualTransitReport | null {
  const row = getDatabase().prepare(`
    SELECT * FROM transit_reports
    WHERE conversation_id = ? AND level = 'year' AND target_date = ?
      AND engine_version = ? AND prompt_version = ?
  `).get(
    input.conversationId,
    input.targetDate,
    input.engineVersion,
    input.promptVersion,
  ) as TransitReportRow | undefined;
  return row ? mapRow(row) : null;
}

export function claimAnnualTransitReport(input: {
  conversationId: string;
  snapshotId: string;
  targetDate: string;
  engineVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  regenerate: boolean;
  staleAfterMs: number;
}): { report: AnnualTransitReport; claimed: boolean } {
  const db = getDatabase();
  const claim = db.transaction(() => {
    const existing = getAnnualTransitReport(input);
    const now = Date.now();
    if (existing?.status === 'completed' && !input.regenerate) {
      return { report: existing, claimed: false };
    }
    if (existing?.status === 'generating' && now - existing.updatedAt < input.staleAfterMs) {
      return { report: existing, claimed: false };
    }
    const id = existing?.id ?? randomUUID();
    db.prepare(`
    INSERT INTO transit_reports (
      id, conversation_id, snapshot_id, level, target_date, engine_version,
      prompt_version, provider, model, content, status, error_code,
      input_tokens, output_tokens, created_at, updated_at, completed_at
    ) VALUES (?, ?, ?, 'year', ?, ?, ?, ?, ?, '', 'generating', NULL, NULL, NULL, ?, ?, NULL)
    ON CONFLICT(conversation_id, level, target_date, engine_version, prompt_version)
    DO UPDATE SET
      snapshot_id = excluded.snapshot_id,
      provider = excluded.provider,
      model = excluded.model,
      status = 'generating',
      error_code = NULL,
      input_tokens = NULL,
      output_tokens = NULL,
      updated_at = excluded.updated_at,
      completed_at = NULL
    `).run(
      id,
      input.conversationId,
      input.snapshotId,
      input.targetDate,
      input.engineVersion,
      input.promptVersion,
      input.provider,
      input.model,
      existing?.createdAt ?? now,
      now,
    );
    return { report: getAnnualTransitReport(input)!, claimed: true };
  });
  return claim();
}

export function completeAnnualTransitReport(
  id: string,
  input: { content: string; inputTokens: number | null; outputTokens: number | null },
): AnnualTransitReport | null {
  const now = Date.now();
  getDatabase().prepare(`
    UPDATE transit_reports
    SET content = ?, status = 'completed', error_code = NULL,
        input_tokens = ?, output_tokens = ?, updated_at = ?, completed_at = ?
    WHERE id = ?
  `).run(input.content, input.inputTokens, input.outputTokens, now, now, id);
  return getAnnualTransitReportById(id);
}

export function failAnnualTransitReport(id: string, errorCode: string): AnnualTransitReport | null {
  getDatabase().prepare(`
    UPDATE transit_reports
    SET status = 'failed', error_code = ?, updated_at = ?
    WHERE id = ?
  `).run(errorCode.slice(0, 120), Date.now(), id);
  return getAnnualTransitReportById(id);
}

export function getAnnualTransitReportById(id: string): AnnualTransitReport | null {
  const row = getDatabase().prepare('SELECT * FROM transit_reports WHERE id = ?').get(id) as TransitReportRow | undefined;
  return row ? mapRow(row) : null;
}
