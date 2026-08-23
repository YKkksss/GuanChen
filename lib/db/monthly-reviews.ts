import { randomUUID } from 'node:crypto';
import { getConversation } from '@/lib/db/conversations';
import { upsertMemoryItem } from '@/lib/db/context';
import { getReminderInstance, setReminderInstanceStatus } from '@/lib/db/reminders';
import { createLifeEventWithTransits } from '@/lib/events/service';
import { LIFE_EVENT_CATEGORIES } from '@/lib/events/types';
import type {
  ConfirmMonthlyReviewInput,
  MonthlyReview,
  MonthlyReviewDraftInput,
  MonthlyReviewMatch,
  MonthlyReviewScores,
  MonthlyReviewStatus,
  MonthlyReviewUpdateInput,
} from '@/lib/monthly-reviews/types';
import { MONTHLY_REVIEW_MATCHES } from '@/lib/monthly-reviews/types';
import { getDatabase } from './client';

interface MonthlyReviewRow {
  id: string;
  conversation_id: string;
  reminder_instance_id: string | null;
  review_month: string;
  status: MonthlyReviewStatus;
  important_events: string;
  scores_json: string;
  prior_prediction: string;
  actual_outcome: string;
  prediction_match: MonthlyReviewMatch;
  corrections: string;
  next_focus: string;
  generated_event_id: string | null;
  generated_memory_id: string | null;
  confirmed_at: number | null;
  created_at: number;
  updated_at: number;
}

const EMPTY_SCORES: MonthlyReviewScores = {
  career: null,
  relationship: null,
  health: null,
  finance: null,
};

export function getMonthlyReview(id: string): MonthlyReview | null {
  const row = getDatabase().prepare('SELECT * FROM monthly_reviews WHERE id = ?')
    .get(id) as MonthlyReviewRow | undefined;
  return row ? mapMonthlyReview(row) : null;
}

export function getMonthlyReviewByMonth(conversationId: string, reviewMonth: string): MonthlyReview | null {
  const row = getDatabase().prepare(`
    SELECT * FROM monthly_reviews WHERE conversation_id = ? AND review_month = ?
  `).get(conversationId, reviewMonth) as MonthlyReviewRow | undefined;
  return row ? mapMonthlyReview(row) : null;
}

export function listMonthlyReviews(input: {
  conversationId?: string;
  status?: MonthlyReviewStatus;
  limit?: number;
  offset?: number;
} = {}): MonthlyReview[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (input.conversationId) { clauses.push('conversation_id = ?'); params.push(input.conversationId); }
  if (input.status) { clauses.push('status = ?'); params.push(input.status); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const rows = getDatabase().prepare(`
    SELECT * FROM monthly_reviews
    ${where}
    ORDER BY review_month DESC, updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as MonthlyReviewRow[];
  return rows.map(mapMonthlyReview);
}

export function createMonthlyReview(input: MonthlyReviewDraftInput): MonthlyReview {
  const normalized = normalizeDraft(input);
  const conversation = getConversation(normalized.conversationId);
  if (!conversation || conversation.type !== 'chart') throw new Error('请选择有效的单人命盘');
  validateReminderLink(normalized.reminderInstanceId, normalized.conversationId);

  const existing = getMonthlyReviewByMonth(normalized.conversationId, normalized.reviewMonth);
  if (existing) {
    if (normalized.reminderInstanceId && !existing.reminderInstanceId && existing.status === 'draft') {
      getDatabase().prepare(`
        UPDATE monthly_reviews SET reminder_instance_id = ?, updated_at = ? WHERE id = ?
      `).run(normalized.reminderInstanceId, Date.now(), existing.id);
      return getMonthlyReview(existing.id)!;
    }
    return existing;
  }

  const id = randomUUID();
  const now = Date.now();
  getDatabase().prepare(`
    INSERT INTO monthly_reviews (
      id, conversation_id, reminder_instance_id, review_month, status,
      important_events, scores_json, prior_prediction, actual_outcome,
      prediction_match, corrections, next_focus, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalized.conversationId,
    normalized.reminderInstanceId,
    normalized.reviewMonth,
    normalized.importantEvents,
    JSON.stringify(normalized.scores),
    normalized.priorPrediction,
    normalized.actualOutcome,
    normalized.predictionMatch,
    normalized.corrections,
    normalized.nextFocus,
    now,
    now,
  );
  return getMonthlyReview(id)!;
}

export function updateMonthlyReview(id: string, input: MonthlyReviewUpdateInput): MonthlyReview | null {
  const existing = getMonthlyReview(id);
  if (!existing) return null;
  if (existing.status !== 'draft') throw new Error('已确认的月度复盘不能再修改');
  const normalized = normalizeUpdate(input, existing);
  getDatabase().prepare(`
    UPDATE monthly_reviews SET
      important_events = ?, scores_json = ?, prior_prediction = ?,
      actual_outcome = ?, prediction_match = ?, corrections = ?,
      next_focus = ?, updated_at = ?
    WHERE id = ?
  `).run(
    normalized.importantEvents,
    JSON.stringify(normalized.scores),
    normalized.priorPrediction,
    normalized.actualOutcome,
    normalized.predictionMatch,
    normalized.corrections,
    normalized.nextFocus,
    Date.now(),
    id,
  );
  return getMonthlyReview(id);
}

export function deleteMonthlyReview(id: string): boolean {
  const existing = getMonthlyReview(id);
  if (!existing) return false;
  if (existing.status !== 'draft') throw new Error('已确认的月度复盘不能删除');
  return getDatabase().prepare('DELETE FROM monthly_reviews WHERE id = ?').run(id).changes > 0;
}

export function confirmMonthlyReview(id: string, input: ConfirmMonthlyReviewInput): MonthlyReview | null {
  const existing = getMonthlyReview(id);
  if (!existing) return null;
  if (existing.status === 'confirmed') return existing;
  if (!existing.actualOutcome.trim()) throw new Error('请先填写本月实际情况');
  const eventInput = normalizeEventPromotion(input.event ?? null);

  const confirm = getDatabase().transaction(() => {
    let generatedEventId: string | null = null;
    let generatedMemoryId: string | null = null;

    if (eventInput) {
      const event = createLifeEventWithTransits(existing.conversationId, {
        title: eventInput.title,
        category: eventInput.category,
        startDate: existing.reviewMonth,
        datePrecision: 'month',
        description: eventInput.description || existing.importantEvents || existing.actualOutcome,
        impactLevel: eventInput.impactLevel,
        source: 'user_input',
        sourceMessageId: null,
        confirmedByUser: true,
      });
      generatedEventId = event.id;
    }

    if (input.saveToMemory) {
      const memory = upsertMemoryItem({
        conversationId: existing.conversationId,
        category: 'user_fact',
        content: buildMemoryContent(existing),
        normalizedKey: `monthly-review:${existing.id}`,
        confidence: 1,
      });
      generatedMemoryId = memory.id;
    }

    const now = Date.now();
    getDatabase().prepare(`
      UPDATE monthly_reviews SET
        status = 'confirmed', generated_event_id = ?, generated_memory_id = ?,
        confirmed_at = ?, updated_at = ?
      WHERE id = ? AND status = 'draft'
    `).run(generatedEventId, generatedMemoryId, now, now, id);
    if (existing.reminderInstanceId) {
      setReminderInstanceStatus(existing.reminderInstanceId, 'completed', now);
    }
  });
  confirm();
  return getMonthlyReview(id);
}

function normalizeDraft(input: MonthlyReviewDraftInput) {
  return {
    conversationId: normalizeRequiredText(input.conversationId, 100, '命盘编号'),
    reminderInstanceId: normalizeOptionalText(input.reminderInstanceId, 100),
    reviewMonth: normalizeReviewMonth(input.reviewMonth),
    importantEvents: normalizeText(input.importantEvents, 4_000),
    scores: normalizeScores(input.scores),
    priorPrediction: normalizeText(input.priorPrediction, 4_000),
    actualOutcome: normalizeText(input.actualOutcome, 4_000),
    predictionMatch: normalizeMatch(input.predictionMatch),
    corrections: normalizeText(input.corrections, 4_000),
    nextFocus: normalizeText(input.nextFocus, 4_000),
  };
}

function normalizeUpdate(input: MonthlyReviewUpdateInput, existing: MonthlyReview) {
  return {
    importantEvents: input.importantEvents === undefined ? existing.importantEvents : normalizeText(input.importantEvents, 4_000),
    scores: input.scores === undefined ? existing.scores : normalizeScores({ ...existing.scores, ...input.scores }),
    priorPrediction: input.priorPrediction === undefined ? existing.priorPrediction : normalizeText(input.priorPrediction, 4_000),
    actualOutcome: input.actualOutcome === undefined ? existing.actualOutcome : normalizeText(input.actualOutcome, 4_000),
    predictionMatch: input.predictionMatch === undefined ? existing.predictionMatch : normalizeMatch(input.predictionMatch),
    corrections: input.corrections === undefined ? existing.corrections : normalizeText(input.corrections, 4_000),
    nextFocus: input.nextFocus === undefined ? existing.nextFocus : normalizeText(input.nextFocus, 4_000),
  };
}

function normalizeScores(input?: Partial<MonthlyReviewScores>): MonthlyReviewScores {
  return (Object.keys(EMPTY_SCORES) as Array<keyof MonthlyReviewScores>).reduce((result, key) => {
    const value = input?.[key] ?? null;
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 5)) {
      throw new Error('事业、感情、健康和财务评分必须在 1 至 5 之间');
    }
    result[key] = value;
    return result;
  }, { ...EMPTY_SCORES });
}

function normalizeMatch(value?: MonthlyReviewMatch): MonthlyReviewMatch {
  const match = value ?? 'not_reviewed';
  if (!MONTHLY_REVIEW_MATCHES.includes(match)) throw new Error('预测兑现结果无效');
  return match;
}

function normalizeReviewMonth(value: string) {
  const month = value.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('复盘月份格式应为 YYYY-MM');
  const year = Number(month.slice(0, 4));
  if (year < 1800 || year > 2200) throw new Error('复盘年份必须在 1800 至 2200 之间');
  return month;
}

function validateReminderLink(reminderInstanceId: string | null, conversationId: string) {
  if (!reminderInstanceId) return;
  const instance = getReminderInstance(reminderInstanceId);
  if (!instance || instance.payload.kind !== 'monthly_review') throw new Error('关联的月度复盘提醒不存在');
  if (instance.payload.conversationId && instance.payload.conversationId !== conversationId) {
    throw new Error('提醒关联命盘与复盘命盘不一致');
  }
}

function normalizeEventPromotion(input: ConfirmMonthlyReviewInput['event']) {
  if (!input) return null;
  const title = normalizeRequiredText(input.title, 100, '事件标题');
  if (!LIFE_EVENT_CATEGORIES.includes(input.category)) throw new Error('事件类型不正确');
  if (!Number.isInteger(input.impactLevel) || input.impactLevel < 1 || input.impactLevel > 5) {
    throw new Error('事件影响程度必须在 1 至 5 之间');
  }
  return {
    title,
    category: input.category,
    impactLevel: input.impactLevel,
    description: normalizeText(input.description, 2_000),
  };
}

function buildMemoryContent(review: MonthlyReview) {
  const parts = [
    `${review.reviewMonth} 月度复盘`,
    review.actualOutcome && `实际情况：${review.actualOutcome}`,
    review.corrections && `判断修正：${review.corrections}`,
    review.nextFocus && `后续观察：${review.nextFocus}`,
  ].filter(Boolean);
  return parts.join('；').slice(0, 1_000);
}

function normalizeRequiredText(value: unknown, maxLength: number, label: string) {
  const text = typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  if (!text) throw new Error(`${label}不能为空`);
  return text;
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  const text = typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  return text || null;
}

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function mapMonthlyReview(row: MonthlyReviewRow): MonthlyReview {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    reminderInstanceId: row.reminder_instance_id,
    reviewMonth: row.review_month,
    status: row.status,
    importantEvents: row.important_events,
    scores: { ...EMPTY_SCORES, ...JSON.parse(row.scores_json) as Partial<MonthlyReviewScores> },
    priorPrediction: row.prior_prediction,
    actualOutcome: row.actual_outcome,
    predictionMatch: row.prediction_match,
    corrections: row.corrections,
    nextFocus: row.next_focus,
    generatedEventId: row.generated_event_id,
    generatedMemoryId: row.generated_memory_id,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
