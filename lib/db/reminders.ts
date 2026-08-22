import { randomUUID } from 'node:crypto';
import type { Conversation } from '@/lib/conversations/types';
import type { LifeEvent } from '@/lib/events/types';
import {
  buildReminderCandidates,
  DEFAULT_REMINDER_TIMEZONE,
  getDateKeyInTimezone,
  REMINDER_ENGINE_VERSION,
  shiftDateKey,
  validateReminderConfig,
  validateTimezone,
} from '@/lib/reminders/engine';
import type {
  CreateReminderRuleInput,
  ReminderConfig,
  ReminderGenerationContext,
  ReminderInstance,
  ReminderInstancePayload,
  ReminderInstanceStatus,
  ReminderKind,
  ReminderRule,
  ReminderRuleStatus,
} from '@/lib/reminders/types';
import { getConversation } from './conversations';
import { getLifeEvent } from './events';
import { getDatabase } from './client';

interface ReminderRuleRow {
  id: string;
  title: string;
  kind: ReminderKind;
  status: ReminderRuleStatus;
  conversation_id: string | null;
  event_id: string | null;
  timezone: string;
  config_json: string;
  engine_version: string;
  last_materialized_at: number | null;
  created_at: number;
  updated_at: number;
}

interface ReminderInstanceRow {
  id: string;
  rule_id: string;
  occurrence_key: string;
  scheduled_for: string;
  due_at: number;
  title: string;
  payload_json: string;
  status: ReminderInstanceStatus;
  completed_at: number | null;
  dismissed_at: number | null;
  created_at: number;
  updated_at: number;
}

export function createReminderRule(input: CreateReminderRuleInput, now = Date.now()): ReminderRule {
  const normalized = normalizeAndValidateRule(input);
  const id = randomUUID();
  getDatabase().prepare(`
    INSERT INTO reminder_rules (
      id, title, kind, status, conversation_id, event_id, timezone,
      config_json, engine_version, last_materialized_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'enabled', ?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(
    id,
    normalized.title,
    normalized.kind,
    normalized.conversationId,
    normalized.eventId,
    normalized.timezone,
    JSON.stringify(normalized.config),
    REMINDER_ENGINE_VERSION,
    now,
    now,
  );
  materializeReminderRule(id, { now });
  return getReminderRule(id)!;
}

export function getReminderRule(id: string): ReminderRule | null {
  const row = getDatabase().prepare('SELECT * FROM reminder_rules WHERE id = ?').get(id) as ReminderRuleRow | undefined;
  return row ? mapRule(row) : null;
}

export function listReminderRules(input: {
  status?: ReminderRuleStatus;
  kind?: ReminderKind;
  conversationId?: string;
  limit?: number;
  offset?: number;
} = {}): ReminderRule[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (input.status) { clauses.push('status = ?'); params.push(input.status); }
  if (input.kind) { clauses.push('kind = ?'); params.push(input.kind); }
  if (input.conversationId) { clauses.push('conversation_id = ?'); params.push(input.conversationId); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const rows = getDatabase().prepare(`
    SELECT * FROM reminder_rules ${where}
    ORDER BY CASE status WHEN 'enabled' THEN 0 WHEN 'disabled' THEN 1 ELSE 2 END, updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as ReminderRuleRow[];
  return rows.map(mapRule);
}

export function updateReminderRule(id: string, input: {
  title?: string;
  status?: ReminderRuleStatus;
  timezone?: string;
  config?: ReminderConfig;
}, now = Date.now()): ReminderRule | null {
  const existing = getReminderRule(id);
  if (!existing) return null;
  const title = input.title === undefined ? existing.title : normalizeTitle(input.title);
  const status = input.status ?? existing.status;
  const timezone = input.timezone ?? existing.timezone;
  const config = input.config ?? existing.config;
  validateTimezone(timezone);
  validateReminderConfig(existing.kind, config);
  validateDependencies({
    kind: existing.kind,
    conversationId: existing.conversationId,
    eventId: existing.eventId,
    config,
  });
  const schedulingChanged = timezone !== existing.timezone || JSON.stringify(config) !== JSON.stringify(existing.config);
  getDatabase().transaction(() => {
    getDatabase().prepare(`
      UPDATE reminder_rules SET title = ?, status = ?, timezone = ?, config_json = ?,
        engine_version = ?, updated_at = ? WHERE id = ?
    `).run(title, status, timezone, JSON.stringify(config), REMINDER_ENGINE_VERSION, now, id);
    if (schedulingChanged) {
      getDatabase().prepare(`DELETE FROM reminder_instances WHERE rule_id = ? AND status = 'pending'`).run(id);
    }
  })();
  if (status === 'enabled') materializeReminderRule(id, { now });
  return getReminderRule(id);
}

export function deleteReminderRule(id: string): boolean {
  return getDatabase().prepare('DELETE FROM reminder_rules WHERE id = ?').run(id).changes > 0;
}

export function materializeReminderRule(id: string, options: {
  now?: number;
  windowStart?: string;
  windowEnd?: string;
} = {}): number {
  const rule = getReminderRule(id);
  if (!rule) throw new Error('提醒规则不存在');
  if (rule.status !== 'enabled') return 0;
  const now = options.now ?? Date.now();
  const today = getDateKeyInTimezone(now, rule.timezone);
  const windowStart = options.windowStart ?? shiftDateKey(today, -31);
  const windowEnd = options.windowEnd ?? shiftDateKey(today, 400);
  const { context } = validateDependencies(rule);
  const candidates = buildReminderCandidates({
    title: rule.title,
    kind: rule.kind,
    timezone: rule.timezone,
    config: rule.config,
    context,
    windowStart,
    windowEnd,
  });
  const db = getDatabase();
  let changes = 0;
  db.transaction(() => {
    const upsert = db.prepare(`
      INSERT INTO reminder_instances (
        id, rule_id, occurrence_key, scheduled_for, due_at, title,
        payload_json, status, completed_at, dismissed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)
      ON CONFLICT(rule_id, occurrence_key) DO UPDATE SET
        scheduled_for = excluded.scheduled_for,
        due_at = excluded.due_at,
        title = excluded.title,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
      WHERE reminder_instances.status = 'pending'
    `);
    candidates.forEach(candidate => {
      changes += upsert.run(
        randomUUID(), id, candidate.occurrenceKey, candidate.scheduledFor,
        candidate.dueAt, candidate.title, JSON.stringify(candidate.payload), now, now,
      ).changes;
    });
    db.prepare(`
      UPDATE reminder_rules SET engine_version = ?, last_materialized_at = ?, updated_at = ? WHERE id = ?
    `).run(REMINDER_ENGINE_VERSION, now, now, id);
  })();
  return changes;
}

export function materializeAllActiveReminders(options: {
  now?: number;
  windowStart?: string;
  windowEnd?: string;
} = {}): { ruleCount: number; changedInstances: number; errors: Array<{ ruleId: string; message: string }> } {
  const rules = listReminderRules({ status: 'enabled', limit: 100 });
  let changedInstances = 0;
  const errors: Array<{ ruleId: string; message: string }> = [];
  rules.forEach(rule => {
    try {
      changedInstances += materializeReminderRule(rule.id, options);
    } catch (error) {
      errors.push({ ruleId: rule.id, message: error instanceof Error ? error.message : '提醒生成失败' });
    }
  });
  return { ruleCount: rules.length, changedInstances, errors };
}

export function getReminderInstance(id: string, now = Date.now()): ReminderInstance | null {
  const row = getDatabase().prepare('SELECT * FROM reminder_instances WHERE id = ?').get(id) as ReminderInstanceRow | undefined;
  return row ? mapInstance(row, now) : null;
}

export function listReminderInstances(input: {
  ruleId?: string;
  conversationId?: string;
  status?: ReminderInstanceStatus;
  dueOnly?: boolean;
  before?: number;
  after?: number;
  now?: number;
  limit?: number;
  offset?: number;
} = {}): ReminderInstance[] {
  const now = input.now ?? Date.now();
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (input.ruleId) { clauses.push('instance.rule_id = ?'); params.push(input.ruleId); }
  if (input.conversationId) { clauses.push('rule.conversation_id = ?'); params.push(input.conversationId); }
  if (input.status) { clauses.push('instance.status = ?'); params.push(input.status); }
  if (input.dueOnly) {
    clauses.push("instance.status = 'pending'");
    clauses.push("rule.status = 'enabled'");
    clauses.push('instance.due_at <= ?');
    params.push(now);
  }
  if (input.before !== undefined) { clauses.push('instance.due_at <= ?'); params.push(input.before); }
  if (input.after !== undefined) { clauses.push('instance.due_at >= ?'); params.push(input.after); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const rows = getDatabase().prepare(`
    SELECT instance.* FROM reminder_instances instance
    JOIN reminder_rules rule ON rule.id = instance.rule_id
    ${where}
    ORDER BY instance.due_at ASC, instance.created_at ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as ReminderInstanceRow[];
  return rows.map(row => mapInstance(row, now));
}

export function setReminderInstanceStatus(id: string, status: ReminderInstanceStatus, now = Date.now()): ReminderInstance | null {
  const existing = getReminderInstance(id, now);
  if (!existing) return null;
  getDatabase().prepare(`
    UPDATE reminder_instances SET status = ?, completed_at = ?, dismissed_at = ?, updated_at = ? WHERE id = ?
  `).run(
    status,
    status === 'completed' ? now : null,
    status === 'dismissed' ? now : null,
    now,
    id,
  );
  return getReminderInstance(id, now);
}

function normalizeAndValidateRule(input: CreateReminderRuleInput) {
  const normalized = {
    title: normalizeTitle(input.title),
    kind: input.kind,
    conversationId: input.conversationId ?? null,
    eventId: input.eventId ?? null,
    timezone: input.timezone ?? DEFAULT_REMINDER_TIMEZONE,
    config: input.config,
  };
  validateTimezone(normalized.timezone);
  validateReminderConfig(normalized.kind, normalized.config);
  const validated = validateDependencies(normalized);
  return { ...normalized, conversationId: validated.conversation?.id ?? normalized.conversationId };
}

function validateDependencies(input: {
  kind: ReminderKind;
  conversationId: string | null;
  eventId: string | null;
  config: ReminderConfig;
}): { conversation: Conversation | null; event: LifeEvent | null; context: ReminderGenerationContext } {
  const event = input.eventId ? getLifeEvent(input.eventId) : null;
  if (input.eventId && !event) throw new Error('关联事件不存在');
  const conversationId = input.conversationId ?? event?.conversationId ?? null;
  const conversation = conversationId ? getConversation(conversationId) : null;
  if (conversationId && !conversation) throw new Error('关联命盘会话不存在');
  if (event && conversationId !== event.conversationId) throw new Error('关联事件不属于所选命盘会话');
  if (input.kind === 'birthday_review' || input.kind === 'transit_change') {
    if (!conversation || conversation.type !== 'chart' || !conversation.birthInfo || !conversation.chartSnapshot) {
      throw new Error('该提醒需要关联包含出生信息的单人命盘');
    }
  }
  if (input.kind === 'event_anniversary') {
    if (!event || !event.confirmedByUser || event.datePrecision !== 'day' || !/^\d{4}-\d{2}-\d{2}$/.test(event.startDate)) {
      throw new Error('事件周年提醒只能关联日期精度为“日”的已确认事件');
    }
  }
  return {
    conversation,
    event,
    context: {
      birthDate: conversation?.birthInfo ? {
        year: conversation.birthInfo.year,
        month: conversation.birthInfo.month,
        day: conversation.birthInfo.day,
      } : null,
      daXians: conversation?.chartSnapshot?.daXians ?? [],
      eventDate: event?.startDate ?? null,
      conversationId: conversation?.id ?? null,
      eventId: event?.id ?? null,
    },
  };
}

function normalizeTitle(value: string) {
  const title = value.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!title) throw new Error('提醒标题不能为空');
  return title;
}

function mapRule(row: ReminderRuleRow): ReminderRule {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    conversationId: row.conversation_id,
    eventId: row.event_id,
    timezone: row.timezone,
    config: JSON.parse(row.config_json) as ReminderConfig,
    engineVersion: row.engine_version,
    lastMaterializedAt: row.last_materialized_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInstance(row: ReminderInstanceRow, now: number): ReminderInstance {
  return {
    id: row.id,
    ruleId: row.rule_id,
    occurrenceKey: row.occurrence_key,
    scheduledFor: row.scheduled_for,
    dueAt: row.due_at,
    title: row.title,
    payload: JSON.parse(row.payload_json) as ReminderInstancePayload,
    status: row.status,
    displayStatus: row.status === 'completed' ? 'completed' : row.status === 'dismissed' ? 'dismissed' : row.due_at <= now ? 'due' : 'upcoming',
    completedAt: row.completed_at,
    dismissedAt: row.dismissed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
