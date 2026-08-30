import { randomUUID } from 'node:crypto';
import type {
  BaziContextRun,
  BaziContextRunStatus,
  BaziConversation,
  BaziConversationDetail,
  BaziConversationListItem,
  BaziConversationMessage,
  BaziConversationStatus,
  BaziConversationSummary,
  BaziMessageRole,
  BaziMessageStatus,
} from '@/lib/bazi/conversation-types';
import { getBaziBirthProfile, getBaziChartVersion } from './bazi';
import { ensureBaziAnalysisVersion, getBaziAnalysisVersion } from './bazi-analysis';
import { ensureBaziLuckCycleVersion, getBaziLuckCycleVersion } from './bazi-luck-cycles';
import { ensureBaziAnnualTimelineVersion, getBaziAnnualTimelineVersion } from './bazi-annual-timelines';
import { ensureBaziRelationAuditVersion, getBaziRelationAuditVersion } from './bazi-relation-audits';
import {
  ensureBaziRelationAdjudicationVersion,
  getBaziRelationAdjudicationVersion,
} from './bazi-relation-adjudications';
import { ensureBaziDynamicTenGodVersion, getBaziDynamicTenGodVersion } from './bazi-dynamic-ten-gods';
import { ensureBaziTenGodRepeatVersion, getBaziTenGodRepeatVersion } from './bazi-ten-god-repeats';
import { ensureBaziTransparencyRootVersion, getBaziTransparencyRootVersion } from './bazi-transparency-roots';
import { ensureBaziHiddenStemActivationVersion, getBaziHiddenStemActivationVersion } from './bazi-hidden-stem-activations';
import { ensureBaziStrengthCompositeVersion, getBaziStrengthCompositeVersion } from './bazi-strength-composites';
import { ensureBaziPatternConditionVersion, getBaziPatternConditionVersion } from './bazi-pattern-conditions';
import {
  ensureBaziMonthDayTimelineVersion,
  getBaziMonthDayTimelineVersion,
} from './bazi-month-day-timelines';
import {
  ensureBaziMonthDayRelationVersion,
  getBaziMonthDayRelationVersion,
} from './bazi-month-day-relations';
import {
  ensureBaziMonthDayVisibilityVersion,
  getBaziMonthDayVisibilityVersion,
} from './bazi-month-day-visibility';
import {
  ensureBaziMonthDayStrengthVersion,
  getBaziMonthDayStrengthVersion,
} from './bazi-month-day-strengths';
import {
  ensureBaziMonthDayPatternVersion,
  getBaziMonthDayPatternVersion,
} from './bazi-month-day-patterns';
import { getDatabase } from './client';

export const BAZI_CHAT_PROMPT_VERSION = 'bazi-chat-month-day-pattern-v17';

interface ConversationRow {
  id: string; chart_version_id: string; analysis_version_id: string | null; luck_cycle_version_id: string | null;
  annual_timeline_version_id: string | null;
  relation_audit_version_id: string | null;
  relation_adjudication_version_id: string | null;
  dynamic_ten_god_version_id: string | null;
  ten_god_repeat_version_id: string | null;
  transparency_root_version_id: string | null;
  hidden_stem_activation_version_id: string | null;
  strength_composite_version_id: string | null;
  pattern_condition_version_id: string | null;
  month_day_timeline_version_id: string | null;
  month_day_relation_version_id: string | null;
  month_day_visibility_version_id: string | null;
  month_day_strength_version_id: string | null;
  month_day_pattern_version_id: string | null;
  title: string; status: BaziConversationStatus;
  methodology_version: string; engine_version: string; prompt_version: string;
  summary_json: string | null; summary_through_seq: number; summary_version: number;
  summary_updated_at: number | null; last_message_seq: number; created_at: number; updated_at: number;
}

interface MessageRow {
  id: string; conversation_id: string; seq: number; role: BaziMessageRole; content: string;
  source: string; status: BaziMessageStatus; token_count: number; error_code: string | null;
  created_at: number; updated_at: number;
}

interface ContextRunRow {
  id: string; conversation_id: string; trigger_message_id: string; assistant_message_id: string;
  provider: string; model: string; context_limit: number; output_reserve: number; input_budget: number;
  estimated_input_tokens: number; actual_input_tokens: number | null; actual_output_tokens: number | null;
  cached_input_tokens: number | null; summary_version: number | null; recent_message_start_seq: number | null;
  recent_message_count: number; context_manifest_json: string; status: BaziContextRunStatus;
  error_code: string | null; created_at: number; completed_at: number | null;
}

export function createBaziConversation(input: {
  chartVersionId: string;
  title?: string;
  forceNew?: boolean;
}): BaziConversationDetail {
  const chart = getBaziChartVersion(input.chartVersionId);
  if (!chart) throw new Error('八字命盘版本不存在');
  const profile = getBaziBirthProfile(chart.birthProfileId);
  if (!profile) throw new Error('八字出生档案不存在');
  const analysis = ensureBaziAnalysisVersion(chart.id);
  const luckCycles = ensureBaziLuckCycleVersion(chart.id);
  const annualTimeline = ensureBaziAnnualTimelineVersion(chart.id);
  const relationAudit = ensureBaziRelationAuditVersion(chart.id);
  const relationAdjudication = ensureBaziRelationAdjudicationVersion(chart.id);
  const dynamicTenGod = ensureBaziDynamicTenGodVersion(chart.id);
  const tenGodRepeat = ensureBaziTenGodRepeatVersion(chart.id);
  const transparencyRoot = ensureBaziTransparencyRootVersion(chart.id);
  const hiddenStemActivation = ensureBaziHiddenStemActivationVersion(chart.id);
  const strengthComposite = ensureBaziStrengthCompositeVersion(chart.id);
  const patternCondition = ensureBaziPatternConditionVersion(chart.id);
  const monthDayTimeline = ensureBaziMonthDayTimelineVersion(chart.id);
  const monthDayRelation = ensureBaziMonthDayRelationVersion(chart.id);
  const monthDayVisibility = ensureBaziMonthDayVisibilityVersion(chart.id);
  const monthDayStrength = ensureBaziMonthDayStrengthVersion(chart.id);
  const monthDayPattern = ensureBaziMonthDayPatternVersion(chart.id);

  if (!input.forceNew) {
    const existing = getDatabase().prepare(`
      SELECT * FROM bazi_conversations
      WHERE chart_version_id = ? AND status = 'active'
      ORDER BY updated_at DESC LIMIT 1
    `).get(chart.id) as ConversationRow | undefined;
    if (existing) return getBaziConversation(existing.id)!;
  }

  const id = randomUUID();
  const now = Date.now();
  const title = input.title?.trim().slice(0, 120) || `${profile.displayName} · 八字基础解读`;
  getDatabase().prepare(`
    INSERT INTO bazi_conversations (
      id, chart_version_id, analysis_version_id, luck_cycle_version_id, annual_timeline_version_id, relation_audit_version_id,
      relation_adjudication_version_id, dynamic_ten_god_version_id, ten_god_repeat_version_id, transparency_root_version_id,
      hidden_stem_activation_version_id,
      strength_composite_version_id,
      pattern_condition_version_id,
      month_day_timeline_version_id,
      month_day_relation_version_id,
      month_day_visibility_version_id,
      month_day_strength_version_id,
      month_day_pattern_version_id,
      title, status, methodology_version, engine_version,
      prompt_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
  `).run(
    id, chart.id, analysis.id, luckCycles.id, annualTimeline.id, relationAudit.id, relationAdjudication.id, dynamicTenGod.id, tenGodRepeat.id, transparencyRoot.id, hiddenStemActivation.id, strengthComposite.id, patternCondition.id, monthDayTimeline.id, monthDayRelation.id, monthDayVisibility.id, monthDayStrength.id, monthDayPattern.id, title,
    chart.methodologyVersion, chart.engineVersion, BAZI_CHAT_PROMPT_VERSION, now, now,
  );
  return getBaziConversation(id)!;
}

export function getBaziConversation(id: string): BaziConversationDetail | null {
  let row = getDatabase().prepare('SELECT * FROM bazi_conversations WHERE id = ?')
    .get(id) as ConversationRow | undefined;
  if (!row) return null;
  if (!row.analysis_version_id || !row.luck_cycle_version_id || !row.annual_timeline_version_id || !row.relation_audit_version_id || !row.relation_adjudication_version_id || !row.dynamic_ten_god_version_id || !row.ten_god_repeat_version_id || !row.transparency_root_version_id || !row.hidden_stem_activation_version_id || !row.strength_composite_version_id || !row.pattern_condition_version_id || !row.month_day_timeline_version_id || !row.month_day_relation_version_id || !row.month_day_visibility_version_id || !row.month_day_strength_version_id || !row.month_day_pattern_version_id || row.prompt_version !== BAZI_CHAT_PROMPT_VERSION) {
    const analysis = ensureBaziAnalysisVersion(row.chart_version_id);
    const luckCycles = ensureBaziLuckCycleVersion(row.chart_version_id);
    const annualTimeline = ensureBaziAnnualTimelineVersion(row.chart_version_id);
    const relationAudit = ensureBaziRelationAuditVersion(row.chart_version_id);
    const relationAdjudication = ensureBaziRelationAdjudicationVersion(row.chart_version_id);
    const dynamicTenGod = ensureBaziDynamicTenGodVersion(row.chart_version_id);
    const tenGodRepeat = ensureBaziTenGodRepeatVersion(row.chart_version_id);
    const transparencyRoot = ensureBaziTransparencyRootVersion(row.chart_version_id);
    const hiddenStemActivation = ensureBaziHiddenStemActivationVersion(row.chart_version_id);
    const strengthComposite = ensureBaziStrengthCompositeVersion(row.chart_version_id);
    const patternCondition = ensureBaziPatternConditionVersion(row.chart_version_id);
    const monthDayTimeline = ensureBaziMonthDayTimelineVersion(row.chart_version_id);
    const monthDayRelation = ensureBaziMonthDayRelationVersion(row.chart_version_id);
    const monthDayVisibility = ensureBaziMonthDayVisibilityVersion(row.chart_version_id);
    const monthDayStrength = ensureBaziMonthDayStrengthVersion(row.chart_version_id);
    const monthDayPattern = ensureBaziMonthDayPatternVersion(row.chart_version_id);
    getDatabase().prepare(`
      UPDATE bazi_conversations
      SET analysis_version_id = ?, luck_cycle_version_id = ?, annual_timeline_version_id = ?, relation_audit_version_id = ?,
          relation_adjudication_version_id = ?, dynamic_ten_god_version_id = ?, ten_god_repeat_version_id = ?, transparency_root_version_id = ?, hidden_stem_activation_version_id = ?, strength_composite_version_id = ?, pattern_condition_version_id = ?, month_day_timeline_version_id = ?, month_day_relation_version_id = ?, month_day_visibility_version_id = ?, month_day_strength_version_id = ?, month_day_pattern_version_id = ?, prompt_version = ?, updated_at = ?
      WHERE id = ?
    `).run(analysis.id, luckCycles.id, annualTimeline.id, relationAudit.id, relationAdjudication.id, dynamicTenGod.id, tenGodRepeat.id, transparencyRoot.id, hiddenStemActivation.id, strengthComposite.id, patternCondition.id, monthDayTimeline.id, monthDayRelation.id, monthDayVisibility.id, monthDayStrength.id, monthDayPattern.id, BAZI_CHAT_PROMPT_VERSION, Date.now(), id);
    row = getDatabase().prepare('SELECT * FROM bazi_conversations WHERE id = ?')
      .get(id) as ConversationRow;
  }
  const conversation = mapConversation(row);
  const chart = getBaziChartVersion(conversation.chartVersionId);
  if (!chart) return null;
  const profile = getBaziBirthProfile(chart.birthProfileId);
  if (!profile) return null;
  const analysis = conversation.analysisVersionId
    ? getBaziAnalysisVersion(conversation.analysisVersionId)
    : null;
  const luckCycles = conversation.luckCycleVersionId
    ? getBaziLuckCycleVersion(conversation.luckCycleVersionId)
    : null;
  const annualTimeline = conversation.annualTimelineVersionId
    ? getBaziAnnualTimelineVersion(conversation.annualTimelineVersionId)
    : null;
  const relationAudit = conversation.relationAuditVersionId
    ? getBaziRelationAuditVersion(conversation.relationAuditVersionId)
    : null;
  const relationAdjudication = conversation.relationAdjudicationVersionId
    ? getBaziRelationAdjudicationVersion(conversation.relationAdjudicationVersionId)
    : null;
  const dynamicTenGod = conversation.dynamicTenGodVersionId
    ? getBaziDynamicTenGodVersion(conversation.dynamicTenGodVersionId)
    : null;
  const tenGodRepeat = conversation.tenGodRepeatVersionId
    ? getBaziTenGodRepeatVersion(conversation.tenGodRepeatVersionId)
    : null;
  const transparencyRoot = conversation.transparencyRootVersionId
    ? getBaziTransparencyRootVersion(conversation.transparencyRootVersionId)
    : null;
  const hiddenStemActivation = conversation.hiddenStemActivationVersionId
    ? getBaziHiddenStemActivationVersion(conversation.hiddenStemActivationVersionId)
    : null;
  const strengthComposite = conversation.strengthCompositeVersionId
    ? getBaziStrengthCompositeVersion(conversation.strengthCompositeVersionId)
    : null;
  const patternCondition = conversation.patternConditionVersionId
    ? getBaziPatternConditionVersion(conversation.patternConditionVersionId)
    : null;
  const monthDayTimeline = conversation.monthDayTimelineVersionId
    ? getBaziMonthDayTimelineVersion(conversation.monthDayTimelineVersionId)
    : null;
  const monthDayRelation = conversation.monthDayRelationVersionId
    ? getBaziMonthDayRelationVersion(conversation.monthDayRelationVersionId)
    : null;
  const monthDayVisibility = conversation.monthDayVisibilityVersionId
    ? getBaziMonthDayVisibilityVersion(conversation.monthDayVisibilityVersionId)
    : null;
  const monthDayStrength = conversation.monthDayStrengthVersionId
    ? getBaziMonthDayStrengthVersion(conversation.monthDayStrengthVersionId)
    : null;
  const monthDayPattern = conversation.monthDayPatternVersionId
    ? getBaziMonthDayPatternVersion(conversation.monthDayPatternVersionId)
    : null;
  return { ...conversation, chart, profile, analysis, luckCycles, annualTimeline, relationAudit, relationAdjudication, dynamicTenGod, tenGodRepeat, transparencyRoot, hiddenStemActivation, strengthComposite, patternCondition, monthDayTimeline, monthDayRelation, monthDayVisibility, monthDayStrength, monthDayPattern };
}

export function listBaziConversations(input: {
  status?: BaziConversationStatus;
  chartVersionId?: string;
  limit?: number;
  offset?: number;
} = {}): BaziConversationListItem[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (input.status) { clauses.push('c.status = ?'); params.push(input.status); }
  if (input.chartVersionId) { clauses.push('c.chart_version_id = ?'); params.push(input.chartVersionId); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const rows = getDatabase().prepare(`
    SELECT c.*, p.display_name, v.result_json,
      COUNT(m.id) AS message_count,
      COALESCE((
        SELECT latest.content FROM bazi_messages latest
        WHERE latest.conversation_id = c.id AND latest.content <> ''
        ORDER BY latest.seq DESC LIMIT 1
      ), '') AS last_message_preview
    FROM bazi_conversations c
    JOIN bazi_chart_versions v ON v.id = c.chart_version_id
    JOIN bazi_birth_profiles p ON p.id = v.birth_profile_id
    LEFT JOIN bazi_messages m ON m.conversation_id = c.id
    ${where}
    GROUP BY c.id
    ORDER BY c.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Array<ConversationRow & {
    display_name: string; result_json: string; message_count: number; last_message_preview: string;
  }>;
  return rows.map(row => {
    const result = JSON.parse(row.result_json) as { pillars: Record<string, { ganZhi: string } | null> };
    const pillars = ['year', 'month', 'day', 'time']
      .map(key => result.pillars[key]?.ganZhi).filter(Boolean).join(' ');
    return {
      ...mapConversation(row), profileName: row.display_name, pillars,
      messageCount: row.message_count, lastMessagePreview: row.last_message_preview.slice(0, 120),
    };
  });
}

export function updateBaziConversation(id: string, input: {
  title?: string;
  status?: BaziConversationStatus;
}): BaziConversationDetail | null {
  const existing = getBaziConversation(id);
  if (!existing) return null;
  getDatabase().prepare(`
    UPDATE bazi_conversations SET title = ?, status = ?, updated_at = ? WHERE id = ?
  `).run(input.title?.trim().slice(0, 120) || existing.title, input.status ?? existing.status, Date.now(), id);
  return getBaziConversation(id);
}

export function deleteBaziConversation(id: string): boolean {
  return getDatabase().prepare('DELETE FROM bazi_conversations WHERE id = ?').run(id).changes > 0;
}

export function listBaziMessages(conversationId: string): BaziConversationMessage[] {
  const rows = getDatabase().prepare(`SELECT * FROM bazi_messages WHERE conversation_id = ? ORDER BY seq ASC`)
    .all(conversationId) as MessageRow[];
  return rows.map(mapMessage);
}

export function getCompletedBaziMessagesBefore(conversationId: string, beforeSeq: number): BaziConversationMessage[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_messages
    WHERE conversation_id = ? AND seq < ? AND status = 'completed'
      AND role IN ('user', 'assistant') AND content <> ''
    ORDER BY seq ASC
  `).all(conversationId, beforeSeq) as MessageRow[];
  return rows.map(mapMessage);
}

export function appendBaziMessage(input: {
  conversationId: string; role: BaziMessageRole; content?: string;
  source?: string; status?: BaziMessageStatus;
}): BaziConversationMessage {
  const db = getDatabase();
  const id = db.transaction(() => {
    const conversation = db.prepare('SELECT last_message_seq FROM bazi_conversations WHERE id = ?')
      .get(input.conversationId) as { last_message_seq: number } | undefined;
    if (!conversation) throw new Error('八字会话不存在');
    const messageId = randomUUID();
    const seq = conversation.last_message_seq + 1;
    const now = Date.now();
    db.prepare(`
      INSERT INTO bazi_messages (
        id, conversation_id, seq, role, content, source, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(messageId, input.conversationId, seq, input.role, input.content ?? '', input.source ?? 'question', input.status ?? 'completed', now, now);
    db.prepare('UPDATE bazi_conversations SET last_message_seq = ?, updated_at = ? WHERE id = ?')
      .run(seq, now, input.conversationId);
    return messageId;
  })();
  return getBaziMessage(id)!;
}

export function getBaziMessage(id: string): BaziConversationMessage | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_messages WHERE id = ?').get(id) as MessageRow | undefined;
  return row ? mapMessage(row) : null;
}

export function updateBaziMessage(id: string, input: {
  content?: string; status?: BaziMessageStatus; tokenCount?: number; errorCode?: string | null;
}): BaziConversationMessage | null {
  const existing = getBaziMessage(id);
  if (!existing) return null;
  getDatabase().prepare(`
    UPDATE bazi_messages
    SET content = ?, status = ?, token_count = ?, error_code = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.content ?? existing.content, input.status ?? existing.status,
    input.tokenCount ?? existing.tokenCount,
    input.errorCode === undefined ? existing.errorCode : input.errorCode,
    Date.now(), id,
  );
  return getBaziMessage(id);
}

export function updateBaziConversationSummary(input: {
  conversationId: string; summary: BaziConversationSummary; throughSeq: number;
}): void {
  getDatabase().prepare(`
    UPDATE bazi_conversations
    SET summary_json = ?, summary_through_seq = ?, summary_version = summary_version + 1,
        summary_updated_at = ?, updated_at = ?
    WHERE id = ? AND summary_through_seq < ?
  `).run(JSON.stringify(input.summary), input.throughSeq, Date.now(), Date.now(), input.conversationId, input.throughSeq);
}

export function createBaziContextRun(input: {
  conversationId: string; triggerMessageId: string; assistantMessageId: string;
  provider: string; model: string; contextLimit: number; outputReserve: number;
  inputBudget: number; estimatedInputTokens: number; summaryVersion: number | null;
  recentMessageStartSeq: number | null; recentMessageCount: number;
  contextManifest: Record<string, unknown>;
}): BaziContextRun {
  const id = randomUUID();
  getDatabase().prepare(`
    INSERT INTO bazi_context_runs (
      id, conversation_id, trigger_message_id, assistant_message_id, provider, model,
      context_limit, output_reserve, input_budget, estimated_input_tokens,
      summary_version, recent_message_start_seq, recent_message_count,
      context_manifest_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    id, input.conversationId, input.triggerMessageId, input.assistantMessageId,
    input.provider, input.model, input.contextLimit, input.outputReserve, input.inputBudget,
    input.estimatedInputTokens, input.summaryVersion, input.recentMessageStartSeq,
    input.recentMessageCount, JSON.stringify(input.contextManifest), Date.now(),
  );
  return getBaziContextRun(id)!;
}

export function completeBaziContextRun(id: string, input: {
  status: Exclude<BaziContextRunStatus, 'pending'>; errorCode?: string | null;
  actualInputTokens?: number | null; actualOutputTokens?: number | null; cachedInputTokens?: number | null;
}): void {
  getDatabase().prepare(`
    UPDATE bazi_context_runs
    SET status = ?, error_code = ?, actual_input_tokens = ?, actual_output_tokens = ?,
        cached_input_tokens = ?, completed_at = ? WHERE id = ?
  `).run(input.status, input.errorCode ?? null, input.actualInputTokens ?? null,
    input.actualOutputTokens ?? null, input.cachedInputTokens ?? null, Date.now(), id);
}

export function getBaziContextRun(id: string): BaziContextRun | null {
  const row = getDatabase().prepare('SELECT * FROM bazi_context_runs WHERE id = ?').get(id) as ContextRunRow | undefined;
  return row ? mapContextRun(row) : null;
}

export function listBaziContextRuns(conversationId: string, limit = 20): BaziContextRun[] {
  const rows = getDatabase().prepare(`
    SELECT * FROM bazi_context_runs WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(conversationId, Math.min(Math.max(limit, 1), 100)) as ContextRunRow[];
  return rows.map(mapContextRun);
}

function mapConversation(row: ConversationRow): BaziConversation {
  return {
    id: row.id, chartVersionId: row.chart_version_id, analysisVersionId: row.analysis_version_id,
    luckCycleVersionId: row.luck_cycle_version_id,
    annualTimelineVersionId: row.annual_timeline_version_id,
    relationAuditVersionId: row.relation_audit_version_id,
    relationAdjudicationVersionId: row.relation_adjudication_version_id,
    dynamicTenGodVersionId: row.dynamic_ten_god_version_id,
    tenGodRepeatVersionId: row.ten_god_repeat_version_id,
    transparencyRootVersionId: row.transparency_root_version_id,
    hiddenStemActivationVersionId: row.hidden_stem_activation_version_id,
    strengthCompositeVersionId: row.strength_composite_version_id,
    patternConditionVersionId: row.pattern_condition_version_id,
    monthDayTimelineVersionId: row.month_day_timeline_version_id,
    monthDayRelationVersionId: row.month_day_relation_version_id,
    monthDayVisibilityVersionId: row.month_day_visibility_version_id,
    monthDayStrengthVersionId: row.month_day_strength_version_id,
    monthDayPatternVersionId: row.month_day_pattern_version_id,
    title: row.title, status: row.status,
    methodologyVersion: row.methodology_version, engineVersion: row.engine_version,
    promptVersion: row.prompt_version, summary: parseJson<BaziConversationSummary>(row.summary_json),
    summaryThroughSeq: row.summary_through_seq, summaryVersion: row.summary_version,
    summaryUpdatedAt: row.summary_updated_at, lastMessageSeq: row.last_message_seq,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): BaziConversationMessage {
  return {
    id: row.id, conversationId: row.conversation_id, seq: row.seq, role: row.role,
    content: row.content, source: row.source, status: row.status, tokenCount: row.token_count,
    errorCode: row.error_code, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapContextRun(row: ContextRunRow): BaziContextRun {
  return {
    id: row.id, conversationId: row.conversation_id, triggerMessageId: row.trigger_message_id,
    assistantMessageId: row.assistant_message_id, provider: row.provider, model: row.model,
    contextLimit: row.context_limit, outputReserve: row.output_reserve, inputBudget: row.input_budget,
    estimatedInputTokens: row.estimated_input_tokens, actualInputTokens: row.actual_input_tokens,
    actualOutputTokens: row.actual_output_tokens, cachedInputTokens: row.cached_input_tokens,
    summaryVersion: row.summary_version, recentMessageStartSeq: row.recent_message_start_seq,
    recentMessageCount: row.recent_message_count,
    contextManifest: parseJson<Record<string, unknown>>(row.context_manifest_json) ?? {},
    status: row.status, errorCode: row.error_code, createdAt: row.created_at, completedAt: row.completed_at,
  };
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}
