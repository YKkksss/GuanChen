import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-learning-open-practice-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');

async function main() {
  const { generateChart } = await import('../lib/ziwei/algorithm');
  const { createConversation } = await import('../lib/db/conversations');
  const { getDatabase } = await import('../lib/db/client');
  const {
    completeOpenPracticeAttempt,
    createOpenPracticeAttempt,
    failOpenPracticeAttempt,
    getOpenPracticeAttemptStats,
    listOpenPracticeAttempts,
    retryOpenPracticeAttempt,
  } = await import('../lib/db/learning-open-practice');
  const {
    buildOpenPracticeExercise,
    gradeOpenPracticeAnswer,
    listOpenPracticeTemplates,
  } = await import('../lib/learning/open-practice-catalog');
  const {
    buildOpenPracticeFeedbackMessages,
    parseOpenPracticeFeedback,
  } = await import('../lib/learning/open-practice-service');
  const { getLearningPracticeOverview } = await import('../lib/learning/practice-service');

  try {
    const birthInfo = { name: '开放题练习命盘', year: 1992, month: 4, day: 18, hour: 5, gender: 'male' as const };
    const chart = generateChart(birthInfo);
    const conversation = createConversation({ type: 'chart', title: '开放题练习命盘', birthInfo, chartSnapshot: chart });
    const templates = listOpenPracticeTemplates();
    assert.deepEqual(templates.map(item => item.id), ['ming-structure', 'sanfang-synthesis', 'analysis-boundary']);

    for (const template of templates) {
      const exercise = buildOpenPracticeExercise(conversation, template.id);
      assert.equal(exercise.rubric.reduce((sum, item) => sum + item.maxScore, 0), 100);
      assert.ok(exercise.evidencePoints.length >= 8);
      assert.ok(exercise.rubric.every(item => item.evidencePointIds.length > 0));
      const answer = `${exercise.evidencePoints.map(point => point.acceptedExpressions[0]).join('；')}。这些内容先作为盘面结构记录，再按评分量表组织，传统解释仍需结合现实验证和持续观察。分析时保持先核对位置、再整理星曜关系、最后说明解释边界的顺序，并保留后续复核空间。`;
      const grade = gradeOpenPracticeAnswer(exercise, answer);
      assert.equal(grade.rawScore, 100, `${template.title}应能通过完整要点答案取得原始满分`);
      assert.equal(grade.detectedIssues.length, 0);
      assert.equal(grade.score, 100);
    }

    const exercise = buildOpenPracticeExercise(conversation, 'ming-structure');
    const correctLocation = exercise.evidencePoints.find(item => item.id === 'ming-location')!.fact.match(/命宫位于(.)宫/)![1];
    const wrongLocation = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'].find(item => item !== correctLocation)!;
    const weakAnswer = `命宫在${wrongLocation}，这个结果注定百分百会发生。`;
    const weakGrade = gradeOpenPracticeAnswer(exercise, weakAnswer);
    assert.ok(weakGrade.detectedIssues.some(item => item.ruleId === 'wrong-ming-location'));
    assert.ok(weakGrade.detectedIssues.some(item => item.ruleId === 'absolute-claim'));
    assert.ok(weakGrade.detectedIssues.some(item => item.ruleId === 'answer-too-short'));

    const fullAnswer = `${exercise.evidencePoints.map(point => point.acceptedExpressions[0]).join('；')}。以上先记录本命盘面事实，传统解释作为观察参考，现实情况仍需由用户确认。分析时保持先核对位置、再整理星曜关系、最后说明解释边界的顺序，并保留后续复核空间。`;
    const fullGrade = gradeOpenPracticeAnswer(exercise, fullAnswer);
    const firstAttempt = createOpenPracticeAttempt({
      exercise,
      answer: fullAnswer,
      grade: fullGrade,
      provider: 'test-provider',
      model: 'test-model',
    });
    assert.equal(firstAttempt.status, 'pending_feedback');
    assert.equal(firstAttempt.score, 100);

    const rawFeedback = JSON.stringify({
      summary: '程序评分已覆盖全部量表要点，表达顺序清楚。下一版可以进一步压缩重复句子。',
      strengths: ['命身位置与三方四正均有依据。'],
      omissions: [],
      factIssues: [],
      reasoningSuggestions: ['保持先事实、后结构、再解释的顺序。'],
      expressionSuggestions: ['减少重复表述。'],
      nextRevisionFocus: ['提高内容密度。'],
      criterionComments: exercise.rubric.map(item => ({ criterionId: item.id, comment: `${item.title}覆盖完整。`, evidencePointIds: [item.evidencePointIds[0], 'invented-evidence'] })),
    });
    const feedback = parseOpenPracticeFeedback(rawFeedback, exercise, fullGrade);
    assert.equal(feedback.criterionComments.length, exercise.rubric.length);
    assert.ok(feedback.criterionComments.every(item => !item.evidencePointIds.includes('invented-evidence')));
    const completed = completeOpenPracticeAttempt({ id: firstAttempt.id, feedback, inputTokens: 320, outputTokens: 180 });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.feedback?.schemaVersion, 1);
    assert.equal(completed.inputTokens, 320);

    const secondAttempt = createOpenPracticeAttempt({
      exercise,
      answer: `${fullAnswer}\n修订版补充结构顺序。`,
      grade: fullGrade,
      parentAttemptId: firstAttempt.id,
      provider: 'test-provider',
      model: 'test-model',
    });
    assert.equal(secondAttempt.parentAttemptId, firstAttempt.id);
    assert.equal(failOpenPracticeAttempt(secondAttempt.id, '测试反馈失败').status, 'feedback_failed');
    assert.equal(retryOpenPracticeAttempt(secondAttempt.id, 'retry-provider', 'retry-model')?.status, 'pending_feedback');
    assert.equal(listOpenPracticeAttempts({ conversationId: conversation.id, exerciseTemplateId: 'ming-structure' }).length, 2);
    assert.equal(getOpenPracticeAttemptStats().count, 2);

    const messages = buildOpenPracticeFeedbackMessages(exercise, fullGrade, fullAnswer);
    assert.equal(messages.length, 2);
    assert.match(messages[0].content, /不得修改、重算或提出另一个分数/);
    assert.match(messages[1].content, /权威盘面事实/);

    const overview = getLearningPracticeOverview();
    assert.equal(overview.openPracticeAttempts, 2);
    assert.ok(overview.latestOpenPracticeAt);
    assert.ok(getDatabase().prepare('SELECT 1 FROM schema_migrations WHERE version = 17').get());

    console.log('M6-4 开放式练习测试通过：三类题型、确定性量表评分、规则扣分、AI 反馈约束、修订链与 SQLite v17 均正常。');
  } finally {
    const database = globalThis.__ziweiSqlite;
    if (database?.open) database.close();
    globalThis.__ziweiSqlite = undefined;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
