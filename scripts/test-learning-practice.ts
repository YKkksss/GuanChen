import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-learning-practice-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation } = await import('../lib/db/conversations');
  const { getDatabase } = await import('../lib/db/client');
  const {
    getReviewItem,
    getReviewSummary,
    listKnowledgeProgress,
    listReviewItems,
    setReviewItemStatus,
    submitReviewAnswer,
  } = await import('../lib/db/learning-practice');
  const { LEARNING_COURSES, gradeLearningQuestions } = await import('../lib/learning/course-catalog');
  const { startCourseLesson, submitCourseLessonAttempt } = await import('../lib/learning/course-service');
  const {
    getChartPractice,
    getLearningPracticeOverview,
    submitChartPractice,
    submitFoundationReview,
  } = await import('../lib/learning/practice-service');
  const { FOUNDATION_REVIEW_PRACTICE } = await import('../lib/learning/practice-catalog');

  try {
    const course = LEARNING_COURSES[0];
    const firstLesson = course.lessons[0];
    assert.ok(firstLesson.quiz.every(question => question.knowledgePointIds.includes('chart-palace')));
    startCourseLesson(course.id, firstLesson.id);
    const wrongLessonAnswers = Object.fromEntries(firstLesson.quiz.map(question => [question.id, question.options.find(option => option.id !== question.correctOptionId)!.id]));
    submitCourseLessonAttempt(course.id, firstLesson.id, wrongLessonAnswers);
    assert.equal(getReviewSummary().due, firstLesson.quiz.length, '章节错题应自动进入复习队列');
    let knowledge = listKnowledgeProgress().find(item => item.knowledgePointId === 'chart-palace')!;
    assert.equal(knowledge.wrongCount, firstLesson.quiz.length);
    assert.equal(knowledge.status, 'reviewing');

    const firstReview = listReviewItems('due')[0];
    assert.ok(firstReview.question.prompt);
    const firstCorrect = submitReviewAnswer(firstReview.id, firstReview.question.correctOptionId);
    assert.equal(firstCorrect.correct, true);
    assert.equal(firstCorrect.item.status, 'reviewing');
    assert.equal(firstCorrect.item.correctStreak, 1);
    const secondCorrect = submitReviewAnswer(firstReview.id, firstReview.question.correctOptionId);
    assert.equal(secondCorrect.item.status, 'mastered', '连续答对两次后应自动标记已掌握');
    assert.equal(secondCorrect.item.correctStreak, 2);
    assert.equal(setReviewItemStatus(firstReview.id, 'due')?.status, 'due');
    assert.equal(setReviewItemStatus(firstReview.id, 'mastered')?.status, 'mastered');

    assert.equal(FOUNDATION_REVIEW_PRACTICE.questions.length, 8);
    const foundationAnswers = Object.fromEntries(FOUNDATION_REVIEW_PRACTICE.questions.map((question, index) => [question.id, index === 0 ? question.options.find(option => option.id !== question.correctOptionId)!.id : question.correctOptionId]));
    const foundation = submitFoundationReview(foundationAnswers);
    assert.equal(foundation.grade.score, 88);
    assert.equal(foundation.grade.passed, true);
    assert.ok(getReviewSummary().total >= firstLesson.quiz.length);

    const birthInfo = { name: '练习命盘', year: 1992, month: 4, day: 18, hour: 5, gender: 'male' as const };
    const chart = generateChart(birthInfo);
    const conversation = createConversation({ type: 'chart', title: '练习命盘', birthInfo, chartSnapshot: chart });
    const chartPractice = getChartPractice(conversation.id);
    assert.equal(chartPractice.kind, 'chart_structure');
    assert.equal(chartPractice.conversationId, conversation.id);
    assert.ok(chartPractice.questions.length >= 7);
    assert.ok(chartPractice.questions.some(question => question.id === 'chart-ming-palace'));
    const chartAnswers = Object.fromEntries(chartPractice.questions.map(question => [question.id, question.correctOptionId]));
    const chartGrade = gradeLearningQuestions(chartPractice.questions, chartPractice.passScore, chartAnswers);
    assert.equal(chartGrade.score, 100);
    const chartResult = submitChartPractice(conversation.id, chartAnswers);
    assert.equal(chartResult.attempt.conversationId, conversation.id);
    assert.equal(chartResult.grade.passed, true);

    const overview = getLearningPracticeOverview();
    assert.equal(overview.practiceAttempts, 2);
    assert.ok(overview.knowledge.length >= 7);
    assert.ok(overview.knowledge.every(item => item.title !== item.knowledgePointId));
    knowledge = overview.knowledge.find(item => item.knowledgePointId === 'chart-palace')!;
    assert.ok(knowledge.attemptsCount >= 4);
    assert.ok(getReviewItem(firstReview.id));
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 16').get());

    console.log('M6-3 学习练习测试通过：综合题、命盘识别、掌握度、错题聚合、连续复习与 SQLite v16 均正常。');
  } finally {
    const database = globalThis.__ziweiSqlite;
    if (database?.open) database.close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
