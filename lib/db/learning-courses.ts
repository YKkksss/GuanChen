import { randomUUID } from 'node:crypto';
import type {
  LearningAttempt,
  LearningLessonProgress,
  LearningQuizGrade,
} from '@/lib/learning/types';
import { getDatabase } from './client';

interface LearningProgressRow {
  id: string;
  course_id: string;
  lesson_id: string;
  status: LearningLessonProgress['status'];
  best_score: number;
  attempts_count: number;
  latest_answers_json: string;
  started_at: number;
  completed_at: number | null;
  updated_at: number;
}

interface LearningAttemptRow {
  id: string;
  course_id: string;
  lesson_id: string;
  score: number;
  passed: number;
  answers_json: string;
  result_json: string;
  created_at: number;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapProgress(row: LearningProgressRow): LearningLessonProgress {
  return {
    id: row.id,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    status: row.status,
    bestScore: row.best_score,
    attemptsCount: row.attempts_count,
    latestAnswers: parseJson<Record<string, string>>(row.latest_answers_json, {}),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function mapAttempt(row: LearningAttemptRow): LearningAttempt {
  return {
    id: row.id,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    score: row.score,
    passed: row.passed === 1,
    answers: parseJson<Record<string, string>>(row.answers_json, {}),
    grade: parseJson<LearningQuizGrade>(row.result_json, {
      score: row.score,
      passed: row.passed === 1,
      correctCount: 0,
      totalCount: 0,
      results: [],
    }),
    createdAt: row.created_at,
  };
}

export function listLearningProgress(courseId: string): LearningLessonProgress[] {
  return (getDatabase().prepare(`
    SELECT * FROM learning_progress
    WHERE course_id = ?
    ORDER BY updated_at DESC, lesson_id ASC
  `).all(courseId) as LearningProgressRow[]).map(mapProgress);
}

export function getLearningProgress(courseId: string, lessonId: string): LearningLessonProgress | null {
  const row = getDatabase().prepare(`
    SELECT * FROM learning_progress WHERE course_id = ? AND lesson_id = ?
  `).get(courseId, lessonId) as LearningProgressRow | undefined;
  return row ? mapProgress(row) : null;
}

export function startLearningLesson(courseId: string, lessonId: string): LearningLessonProgress {
  const db = getDatabase();
  const existing = getLearningProgress(courseId, lessonId);
  const now = Date.now();
  if (existing) {
    db.prepare('UPDATE learning_progress SET updated_at = ? WHERE id = ?').run(now, existing.id);
    return getLearningProgress(courseId, lessonId)!;
  }
  const id = randomUUID();
  db.prepare(`
    INSERT INTO learning_progress (
      id, course_id, lesson_id, status, best_score, attempts_count,
      latest_answers_json, started_at, completed_at, updated_at
    ) VALUES (?, ?, ?, 'in_progress', 0, 0, '{}', ?, NULL, ?)
  `).run(id, courseId, lessonId, now, now);
  return getLearningProgress(courseId, lessonId)!;
}

export function saveLearningAttempt(input: {
  courseId: string;
  lessonId: string;
  answers: Record<string, string>;
  grade: LearningQuizGrade;
}): { attempt: LearningAttempt; progress: LearningLessonProgress } {
  const db = getDatabase();
  return db.transaction(() => {
    const existing = getLearningProgress(input.courseId, input.lessonId)
      ?? startLearningLesson(input.courseId, input.lessonId);
    const now = Date.now();
    const attemptId = randomUUID();
    db.prepare(`
      INSERT INTO learning_attempts (
        id, course_id, lesson_id, score, passed, answers_json, result_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attemptId,
      input.courseId,
      input.lessonId,
      input.grade.score,
      input.grade.passed ? 1 : 0,
      JSON.stringify(input.answers),
      JSON.stringify(input.grade),
      now,
    );

    const completedAt = existing.completedAt ?? (input.grade.passed ? now : null);
    const status = existing.status === 'completed' || input.grade.passed ? 'completed' : 'in_progress';
    db.prepare(`
      UPDATE learning_progress
      SET status = ?, best_score = ?, attempts_count = attempts_count + 1,
          latest_answers_json = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      status,
      Math.max(existing.bestScore, input.grade.score),
      JSON.stringify(input.answers),
      completedAt,
      now,
      existing.id,
    );

    const attemptRow = db.prepare('SELECT * FROM learning_attempts WHERE id = ?').get(attemptId) as LearningAttemptRow;
    return { attempt: mapAttempt(attemptRow), progress: getLearningProgress(input.courseId, input.lessonId)! };
  })();
}

export function listLearningAttempts(courseId: string, lessonId: string): LearningAttempt[] {
  return (getDatabase().prepare(`
    SELECT * FROM learning_attempts
    WHERE course_id = ? AND lesson_id = ?
    ORDER BY created_at DESC
  `).all(courseId, lessonId) as LearningAttemptRow[]).map(mapAttempt);
}
