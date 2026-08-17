import { randomUUID } from 'node:crypto';
import type {
  LearningOpenAiFeedback,
  LearningOpenAttemptStatus,
  LearningOpenExercise,
  LearningOpenGrade,
  LearningOpenPracticeAttempt,
} from '@/lib/learning/types';
import { getDatabase } from './client';

interface OpenAttemptRow {
  id: string;
  exercise_id: string;
  exercise_template_id: LearningOpenPracticeAttempt['exerciseTemplateId'];
  conversation_id: string | null;
  parent_attempt_id: string | null;
  answer: string;
  score: number;
  passed: number;
  rubric_version: string;
  prompt_version: string;
  provider: string | null;
  model: string | null;
  status: LearningOpenAttemptStatus;
  grade_json: string;
  exercise_snapshot_json: string;
  feedback_json: string | null;
  error_code: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
  completed_at: number | null;
}

export function createOpenPracticeAttempt(input: {
  exercise: LearningOpenExercise;
  answer: string;
  grade: LearningOpenGrade;
  parentAttemptId?: string | null;
  provider: string;
  model: string;
}): LearningOpenPracticeAttempt {
  const id = randomUUID();
  getDatabase().prepare(`
    INSERT INTO learning_open_practice_attempts (
      id, exercise_id, exercise_template_id, conversation_id, parent_attempt_id,
      answer, score, passed, rubric_version, prompt_version, provider, model,
      status, grade_json, exercise_snapshot_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_feedback', ?, ?, ?)
  `).run(
    id,
    input.exercise.id,
    input.exercise.templateId,
    input.exercise.conversationId,
    input.parentAttemptId ?? null,
    input.answer,
    input.grade.score,
    input.grade.passed ? 1 : 0,
    input.exercise.rubricVersion,
    input.exercise.promptVersion,
    input.provider,
    input.model,
    JSON.stringify(input.grade),
    JSON.stringify(input.exercise),
    Date.now(),
  );
  return getOpenPracticeAttempt(id)!;
}

export function completeOpenPracticeAttempt(input: {
  id: string;
  feedback: LearningOpenAiFeedback;
  inputTokens: number | null;
  outputTokens: number | null;
}): LearningOpenPracticeAttempt {
  getDatabase().prepare(`
    UPDATE learning_open_practice_attempts
    SET status = 'completed', feedback_json = ?, error_code = NULL,
        input_tokens = ?, output_tokens = ?, completed_at = ?
    WHERE id = ?
  `).run(JSON.stringify(input.feedback), input.inputTokens, input.outputTokens, Date.now(), input.id);
  return getOpenPracticeAttempt(input.id)!;
}

export function failOpenPracticeAttempt(id: string, errorCode: string): LearningOpenPracticeAttempt {
  getDatabase().prepare(`
    UPDATE learning_open_practice_attempts
    SET status = 'feedback_failed', error_code = ?, completed_at = ?
    WHERE id = ?
  `).run(errorCode.slice(0, 500), Date.now(), id);
  return getOpenPracticeAttempt(id)!;
}

export function retryOpenPracticeAttempt(id: string, provider: string, model: string): LearningOpenPracticeAttempt | null {
  const existing = getOpenPracticeAttempt(id);
  if (!existing) return null;
  getDatabase().prepare(`
    UPDATE learning_open_practice_attempts
    SET status = 'pending_feedback', provider = ?, model = ?, feedback_json = NULL,
        error_code = NULL, input_tokens = NULL, output_tokens = NULL, completed_at = NULL
    WHERE id = ?
  `).run(provider, model, id);
  return getOpenPracticeAttempt(id);
}

export function getOpenPracticeAttempt(id: string): LearningOpenPracticeAttempt | null {
  const row = getDatabase().prepare('SELECT * FROM learning_open_practice_attempts WHERE id = ?').get(id) as OpenAttemptRow | undefined;
  return row ? mapAttempt(row) : null;
}

export function listOpenPracticeAttempts(input: {
  conversationId?: string;
  exerciseTemplateId?: LearningOpenPracticeAttempt['exerciseTemplateId'];
  limit?: number;
} = {}): LearningOpenPracticeAttempt[] {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (input.conversationId) {
    conditions.push('conversation_id = ?');
    values.push(input.conversationId);
  }
  if (input.exerciseTemplateId) {
    conditions.push('exercise_template_id = ?');
    values.push(input.exerciseTemplateId);
  }
  const limit = Math.max(1, Math.min(100, input.limit ?? 20));
  values.push(limit);
  const rows = getDatabase().prepare(`
    SELECT * FROM learning_open_practice_attempts
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...values) as OpenAttemptRow[];
  return rows.map(mapAttempt);
}

export function getOpenPracticeAttemptStats(): { count: number; latestAt: number | null } {
  const row = getDatabase().prepare(`
    SELECT COUNT(*) AS count, MAX(created_at) AS latest_at
    FROM learning_open_practice_attempts
  `).get() as { count: number; latest_at: number | null };
  return { count: row.count, latestAt: row.latest_at };
}

function mapAttempt(row: OpenAttemptRow): LearningOpenPracticeAttempt {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    exerciseTemplateId: row.exercise_template_id,
    conversationId: row.conversation_id,
    parentAttemptId: row.parent_attempt_id,
    answer: row.answer,
    score: row.score,
    passed: row.passed === 1,
    rubricVersion: row.rubric_version,
    promptVersion: row.prompt_version,
    provider: row.provider,
    model: row.model,
    status: row.status,
    grade: parseJson<LearningOpenGrade>(row.grade_json),
    exercise: parseJson<LearningOpenExercise>(row.exercise_snapshot_json),
    feedback: row.feedback_json ? parseJson<LearningOpenAiFeedback>(row.feedback_json) : null,
    errorCode: row.error_code,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}
