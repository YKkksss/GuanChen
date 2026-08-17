import { randomUUID } from 'node:crypto';
import type {
  LearningKnowledgeProgress,
  LearningPracticeAttempt,
  LearningQuizGrade,
  LearningQuizQuestion,
  LearningReviewItem,
  LearningReviewStatus,
  LearningReviewSummary,
} from '@/lib/learning/types';
import { getDatabase } from './client';

interface PracticeAttemptRow {
  id: string;
  practice_set_id: string;
  conversation_id: string | null;
  score: number;
  passed: number;
  answers_json: string;
  result_json: string;
  question_snapshot_json: string;
  created_at: number;
}

interface KnowledgeProgressRow {
  knowledge_point_id: string;
  attempts_count: number;
  correct_count: number;
  wrong_count: number;
  mastery_score: number;
  status: LearningKnowledgeProgress['status'];
  updated_at: number;
}

interface ReviewItemRow {
  id: string;
  question_key: string;
  source_type: LearningReviewItem['sourceType'];
  source_ref: string;
  question_json: string;
  latest_wrong_answer: string | null;
  status: LearningReviewStatus;
  wrong_count: number;
  correct_streak: number;
  next_review_at: number;
  last_wrong_at: number;
  mastered_at: number | null;
  created_at: number;
  updated_at: number;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapAttempt(row: PracticeAttemptRow): LearningPracticeAttempt {
  return {
    id: row.id,
    practiceSetId: row.practice_set_id,
    conversationId: row.conversation_id,
    score: row.score,
    passed: row.passed === 1,
    answers: parseJson(row.answers_json, {}),
    grade: parseJson(row.result_json, { score: row.score, passed: row.passed === 1, correctCount: 0, totalCount: 0, results: [] }),
    questions: parseJson(row.question_snapshot_json, []),
    createdAt: row.created_at,
  };
}

function mapKnowledge(row: KnowledgeProgressRow, title = row.knowledge_point_id): LearningKnowledgeProgress {
  return {
    knowledgePointId: row.knowledge_point_id,
    title,
    attemptsCount: row.attempts_count,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    masteryScore: row.mastery_score,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function mapReview(row: ReviewItemRow): LearningReviewItem {
  return {
    id: row.id,
    questionKey: row.question_key,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    question: parseJson<LearningQuizQuestion>(row.question_json, null as unknown as LearningQuizQuestion),
    latestWrongAnswer: row.latest_wrong_answer,
    status: row.status,
    wrongCount: row.wrong_count,
    correctStreak: row.correct_streak,
    nextReviewAt: row.next_review_at,
    lastWrongAt: row.last_wrong_at,
    masteredAt: row.mastered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function savePracticeAttempt(input: {
  practiceSetId: string;
  conversationId: string | null;
  answers: Record<string, string>;
  grade: LearningQuizGrade;
  questions: LearningQuizQuestion[];
}): LearningPracticeAttempt {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO learning_practice_attempts (
      id, practice_set_id, conversation_id, score, passed, answers_json,
      result_json, question_snapshot_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.practiceSetId,
    input.conversationId,
    input.grade.score,
    input.grade.passed ? 1 : 0,
    JSON.stringify(input.answers),
    JSON.stringify(input.grade),
    JSON.stringify(input.questions),
    Date.now(),
  );
  return getPracticeAttempt(id)!;
}

export function getPracticeAttempt(id: string): LearningPracticeAttempt | null {
  const row = getDatabase().prepare('SELECT * FROM learning_practice_attempts WHERE id = ?').get(id) as PracticeAttemptRow | undefined;
  return row ? mapAttempt(row) : null;
}

export function getPracticeAttemptStats(): { count: number; latestAt: number | null } {
  const row = getDatabase().prepare(`
    SELECT COUNT(*) AS count, MAX(created_at) AS latest_at FROM learning_practice_attempts
  `).get() as { count: number; latest_at: number | null };
  return { count: row.count, latestAt: row.latest_at };
}

export function recordQuestionOutcomes(input: {
  sourceType: LearningReviewItem['sourceType'];
  sourceRef: string;
  questions: LearningQuizQuestion[];
  grade: LearningQuizGrade;
}) {
  const db = getDatabase();
  db.transaction(() => {
    for (const result of input.grade.results) {
      const question = input.questions.find(item => item.id === result.questionId);
      if (!question) continue;
      for (const knowledgePointId of question.knowledgePointIds) {
        updateKnowledgeProgress(knowledgePointId, result.correct);
      }
      updateReviewItem({
        questionKey: `${input.sourceType}:${input.sourceRef}:${question.id}`,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        question,
        selectedOptionId: result.selectedOptionId,
        correct: result.correct,
      });
    }
  })();
}

export function listKnowledgeProgress(): LearningKnowledgeProgress[] {
  return (getDatabase().prepare(`
    SELECT * FROM learning_knowledge_progress ORDER BY mastery_score ASC, updated_at DESC
  `).all() as KnowledgeProgressRow[]).map(row => mapKnowledge(row));
}

export function listReviewItems(status?: LearningReviewStatus): LearningReviewItem[] {
  const rows = status
    ? getDatabase().prepare(`SELECT * FROM learning_review_items WHERE status = ? ORDER BY next_review_at ASC, updated_at DESC`).all(status)
    : getDatabase().prepare(`SELECT * FROM learning_review_items ORDER BY CASE status WHEN 'due' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, next_review_at ASC, updated_at DESC`).all();
  return (rows as ReviewItemRow[]).map(mapReview);
}

export function getReviewItem(id: string): LearningReviewItem | null {
  const row = getDatabase().prepare('SELECT * FROM learning_review_items WHERE id = ?').get(id) as ReviewItemRow | undefined;
  return row ? mapReview(row) : null;
}

export function getReviewSummary(): LearningReviewSummary {
  const rows = getDatabase().prepare(`
    SELECT status, COUNT(*) AS count FROM learning_review_items GROUP BY status
  `).all() as Array<{ status: LearningReviewStatus; count: number }>;
  const counts = new Map(rows.map(row => [row.status, row.count]));
  const due = counts.get('due') ?? 0;
  const reviewing = counts.get('reviewing') ?? 0;
  const mastered = counts.get('mastered') ?? 0;
  return { due, reviewing, mastered, total: due + reviewing + mastered };
}

export function setReviewItemStatus(id: string, status: 'due' | 'mastered'): LearningReviewItem | null {
  const existing = getReviewItem(id);
  if (!existing) return null;
  const now = Date.now();
  getDatabase().prepare(`
    UPDATE learning_review_items
    SET status = ?, correct_streak = ?, next_review_at = ?, mastered_at = ?, updated_at = ?
    WHERE id = ?
  `).run(status, status === 'mastered' ? 2 : 0, status === 'mastered' ? now + 7 * 86_400_000 : now, status === 'mastered' ? now : null, now, id);
  return getReviewItem(id);
}

export function submitReviewAnswer(id: string, selectedOptionId: string): { item: LearningReviewItem; correct: boolean } {
  const item = getReviewItem(id);
  if (!item) throw new Error('复习题不存在');
  if (!item.question.options.some(option => option.id === selectedOptionId)) throw new Error('复习答案无效');
  const correct = selectedOptionId === item.question.correctOptionId;
  const grade: LearningQuizGrade = {
    score: correct ? 100 : 0,
    passed: correct,
    correctCount: correct ? 1 : 0,
    totalCount: 1,
    results: [{
      questionId: item.question.id,
      selectedOptionId,
      correctOptionId: item.question.correctOptionId,
      correct,
      explanation: item.question.explanation,
    }],
  };
  recordQuestionOutcomes({ sourceType: item.sourceType, sourceRef: item.sourceRef, questions: [item.question], grade });
  return { item: getReviewItem(id)!, correct };
}

function updateKnowledgeProgress(knowledgePointId: string, correct: boolean) {
  const db = getDatabase();
  const existing = db.prepare(`
    SELECT * FROM learning_knowledge_progress WHERE knowledge_point_id = ?
  `).get(knowledgePointId) as KnowledgeProgressRow | undefined;
  const attemptsCount = (existing?.attempts_count ?? 0) + 1;
  const correctCount = (existing?.correct_count ?? 0) + (correct ? 1 : 0);
  const wrongCount = (existing?.wrong_count ?? 0) + (correct ? 0 : 1);
  const masteryScore = Math.round((correctCount / attemptsCount) * 100);
  const status: LearningKnowledgeProgress['status'] = attemptsCount >= 3 && masteryScore >= 80
    ? 'mastered'
    : wrongCount > 0
      ? 'reviewing'
      : 'learning';
  const now = Date.now();
  db.prepare(`
    INSERT INTO learning_knowledge_progress (
      knowledge_point_id, attempts_count, correct_count, wrong_count, mastery_score, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(knowledge_point_id) DO UPDATE SET
      attempts_count = excluded.attempts_count,
      correct_count = excluded.correct_count,
      wrong_count = excluded.wrong_count,
      mastery_score = excluded.mastery_score,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(knowledgePointId, attemptsCount, correctCount, wrongCount, masteryScore, status, now);
}

function updateReviewItem(input: {
  questionKey: string;
  sourceType: LearningReviewItem['sourceType'];
  sourceRef: string;
  question: LearningQuizQuestion;
  selectedOptionId: string | null;
  correct: boolean;
}) {
  const db = getDatabase();
  const existing = db.prepare('SELECT * FROM learning_review_items WHERE question_key = ?').get(input.questionKey) as ReviewItemRow | undefined;
  const now = Date.now();
  if (!input.correct) {
    if (existing) {
      db.prepare(`
        UPDATE learning_review_items
        SET question_json = ?, latest_wrong_answer = ?, status = 'due',
            wrong_count = wrong_count + 1, correct_streak = 0, next_review_at = ?,
            last_wrong_at = ?, mastered_at = NULL, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(input.question), input.selectedOptionId, now, now, now, existing.id);
    } else {
      db.prepare(`
        INSERT INTO learning_review_items (
          id, question_key, source_type, source_ref, question_json, latest_wrong_answer,
          status, wrong_count, correct_streak, next_review_at, last_wrong_at,
          mastered_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'due', 1, 0, ?, ?, NULL, ?, ?)
      `).run(randomUUID(), input.questionKey, input.sourceType, input.sourceRef, JSON.stringify(input.question), input.selectedOptionId, now, now, now, now);
    }
    return;
  }
  if (!existing) return;
  const correctStreak = existing.correct_streak + 1;
  const mastered = correctStreak >= 2;
  db.prepare(`
    UPDATE learning_review_items
    SET status = ?, correct_streak = ?, next_review_at = ?, mastered_at = ?, updated_at = ?
    WHERE id = ?
  `).run(mastered ? 'mastered' : 'reviewing', correctStreak, now + (mastered ? 7 : 1) * 86_400_000, mastered ? now : null, now, existing.id);
}
