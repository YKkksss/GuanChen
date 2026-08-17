import {
  getLearningProgress,
  listLearningProgress,
  saveLearningAttempt,
  startLearningLesson,
} from '@/lib/db/learning-courses';
import { recordQuestionOutcomes } from '@/lib/db/learning-practice';
import {
  LEARNING_COURSES,
  getLearningCourse,
  getLearningCourseLesson,
  gradeLearningQuiz,
} from './course-catalog';
import type {
  LearningCourse,
  LearningCourseProgress,
  LearningLessonProgress,
} from './types';

export function buildCourseProgress(course: LearningCourse): LearningCourseProgress {
  const progress = listLearningProgress(course.id)
    .filter(item => course.lessons.some(lesson => lesson.id === item.lessonId));
  const completedLessons = progress.filter(item => item.status === 'completed').length;
  return {
    courseId: course.id,
    totalLessons: course.lessons.length,
    startedLessons: progress.length,
    completedLessons,
    completionPercent: course.lessons.length ? Math.round((completedLessons / course.lessons.length) * 100) : 0,
    lastLessonId: progress[0]?.lessonId ?? null,
    lessons: progress,
  };
}

export function listCourseOverviews() {
  return LEARNING_COURSES.map(course => ({ course, progress: buildCourseProgress(course) }));
}

export function startCourseLesson(courseId: string, lessonId: string): {
  lessonProgress: LearningLessonProgress;
  courseProgress: LearningCourseProgress;
} {
  const { course, lesson } = resolveCourseLesson(courseId, lessonId);
  assertPrerequisites(course, lesson.prerequisiteLessonIds);
  const lessonProgress = startLearningLesson(course.id, lesson.id);
  return { lessonProgress, courseProgress: buildCourseProgress(course) };
}

export function submitCourseLessonAttempt(
  courseId: string,
  lessonId: string,
  answers: Record<string, string>,
) {
  const { course, lesson } = resolveCourseLesson(courseId, lessonId);
  assertPrerequisites(course, lesson.prerequisiteLessonIds);
  const normalizedAnswers = normalizeAnswers(lesson.quiz.map(item => item.id), answers);
  const grade = gradeLearningQuiz(lesson, normalizedAnswers);
  const saved = saveLearningAttempt({ courseId: course.id, lessonId: lesson.id, answers: normalizedAnswers, grade });
  recordQuestionOutcomes({
    sourceType: 'lesson_quiz',
    sourceRef: `${course.id}/${lesson.id}`,
    questions: lesson.quiz,
    grade,
  });
  return { ...saved, grade, courseProgress: buildCourseProgress(course) };
}

export function canAccessCourseLesson(course: LearningCourse, lessonId: string): boolean {
  const lesson = getLearningCourseLesson(course, lessonId);
  if (!lesson) return false;
  return lesson.prerequisiteLessonIds.every(id => getLearningProgress(course.id, id)?.status === 'completed');
}

function resolveCourseLesson(courseId: string, lessonId: string) {
  const course = getLearningCourse(courseId);
  if (!course) throw new Error('学习课程不存在');
  const lesson = getLearningCourseLesson(course, lessonId);
  if (!lesson) throw new Error('课程章节不存在');
  return { course, lesson };
}

function assertPrerequisites(course: LearningCourse, prerequisiteLessonIds: string[]) {
  const unfinished = prerequisiteLessonIds.find(id => getLearningProgress(course.id, id)?.status !== 'completed');
  if (!unfinished) return;
  const lesson = getLearningCourseLesson(course, unfinished);
  throw new Error(`请先完成前置章节：${lesson?.title ?? unfinished}`);
}

function normalizeAnswers(questionIds: string[], rawAnswers: Record<string, string>): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const questionId of questionIds) {
    const value = rawAnswers[questionId];
    if (typeof value !== 'string' || !value.trim()) throw new Error('请完成本章全部题目后再提交');
    answers[questionId] = value.trim();
  }
  return answers;
}
