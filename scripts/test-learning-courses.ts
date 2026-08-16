import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-learning-courses-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { getDatabase } = await import('../lib/db/client');
  const {
    LEARNING_COURSES,
    getCourseSources,
    gradeLearningQuiz,
  } = await import('../lib/learning/course-catalog');
  const {
    buildCourseProgress,
    canAccessCourseLesson,
    startCourseLesson,
    submitCourseLessonAttempt,
  } = await import('../lib/learning/course-service');
  const { listLearningAttempts } = await import('../lib/db/learning-courses');

  try {
    const course = LEARNING_COURSES[0];
    assert.equal(course.id, 'ziwei-chart-foundation');
    assert.equal(course.lessons.length, 7, '首条课程应包含七个基础章节');
    assert.equal(course.lessons[0].prerequisiteLessonIds.length, 0);
    course.lessons.slice(1).forEach((lesson, index) => {
      assert.deepEqual(lesson.prerequisiteLessonIds, [course.lessons[index].id], '章节应以前一章为前置');
    });
    assert.ok(course.lessons.every(lesson => lesson.quiz.length >= 2));
    assert.ok(course.lessons.every(lesson => lesson.sourceIds.length > 0));
    assert.equal(getCourseSources(course).length, course.sourceIds.length);

    for (const lesson of course.lessons) {
      const correctAnswers = Object.fromEntries(lesson.quiz.map(question => [question.id, question.correctOptionId]));
      const grade = gradeLearningQuiz(lesson, correctAnswers);
      assert.equal(grade.score, 100);
      assert.equal(grade.passed, true);
    }

    const first = course.lessons[0];
    const second = course.lessons[1];
    assert.equal(canAccessCourseLesson(course, first.id), true);
    assert.equal(canAccessCourseLesson(course, second.id), false);
    assert.throws(() => startCourseLesson(course.id, second.id), /前置章节/);

    startCourseLesson(course.id, first.id);
    let progress = buildCourseProgress(course);
    assert.equal(progress.startedLessons, 1);
    assert.equal(progress.completedLessons, 0);
    assert.equal(progress.lastLessonId, first.id);

    const wrongAnswers = Object.fromEntries(first.quiz.map(question => [question.id, question.options.find(option => option.id !== question.correctOptionId)!.id]));
    const failed = submitCourseLessonAttempt(course.id, first.id, wrongAnswers);
    assert.equal(failed.grade.passed, false);
    assert.equal(failed.progress.status, 'in_progress');
    assert.equal(failed.progress.attemptsCount, 1);
    assert.throws(() => submitCourseLessonAttempt(course.id, first.id, {}), /全部题目/);

    const correctAnswers = Object.fromEntries(first.quiz.map(question => [question.id, question.correctOptionId]));
    const passed = submitCourseLessonAttempt(course.id, first.id, correctAnswers);
    assert.equal(passed.grade.passed, true);
    assert.equal(passed.progress.status, 'completed');
    assert.equal(passed.progress.bestScore, 100);
    assert.equal(passed.progress.attemptsCount, 2);
    assert.equal(listLearningAttempts(course.id, first.id).length, 2);
    assert.equal(canAccessCourseLesson(course, second.id), true);

    startCourseLesson(course.id, second.id);
    progress = buildCourseProgress(course);
    assert.equal(progress.startedLessons, 2);
    assert.equal(progress.completedLessons, 1);
    assert.equal(progress.completionPercent, 14);
    assert.equal(progress.lastLessonId, second.id);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 15').get());

    console.log('M6-2 课程系统测试通过：七章前置关系、来源契约、确定性评分、解锁规则、学习进度与答题记录均正常。');
  } finally {
    const database = globalThis.__ziweiSqlite;
    if (database?.open) database.close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
