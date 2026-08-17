import { getConversation } from '@/lib/db/conversations';
import {
  getPracticeAttemptStats,
  getReviewSummary,
  listKnowledgeProgress,
  listReviewItems,
  recordQuestionOutcomes,
  savePracticeAttempt,
} from '@/lib/db/learning-practice';
import { getLearningKnowledgePoint } from './catalog';
import { gradeLearningQuestions } from './course-catalog';
import { buildChartStructurePractice, FOUNDATION_REVIEW_PRACTICE } from './practice-catalog';
import type {
  LearningPracticeOverview,
  LearningPracticeSet,
  LearningReviewStatus,
} from './types';

export function getLearningPracticeOverview(): LearningPracticeOverview {
  const stats = getPracticeAttemptStats();
  return {
    knowledge: listKnowledgeProgress().map(item => ({
      ...item,
      title: getLearningKnowledgePoint(item.knowledgePointId)?.title ?? item.knowledgePointId,
    })),
    review: getReviewSummary(),
    practiceAttempts: stats.count,
    latestPracticeAt: stats.latestAt,
  };
}

export function getFoundationReviewPractice(): LearningPracticeSet {
  return FOUNDATION_REVIEW_PRACTICE;
}

export function getChartPractice(conversationId: string): LearningPracticeSet {
  const conversation = getConversation(conversationId);
  if (!conversation) throw new Error('单人命盘会话不存在');
  return buildChartStructurePractice(conversation);
}

export function submitFoundationReview(answers: Record<string, string>) {
  return submitPractice(FOUNDATION_REVIEW_PRACTICE, answers);
}

export function submitChartPractice(conversationId: string, answers: Record<string, string>) {
  return submitPractice(getChartPractice(conversationId), answers);
}

export function getReviewItems(status?: LearningReviewStatus) {
  return { items: listReviewItems(status), summary: getReviewSummary() };
}

function submitPractice(practice: LearningPracticeSet, rawAnswers: Record<string, string>) {
  const answers = normalizeAnswers(practice, rawAnswers);
  const grade = gradeLearningQuestions(practice.questions, practice.passScore, answers);
  const attempt = savePracticeAttempt({
    practiceSetId: practice.id,
    conversationId: practice.conversationId,
    answers,
    grade,
    questions: practice.questions,
  });
  recordQuestionOutcomes({
    sourceType: 'practice',
    sourceRef: practice.id,
    questions: practice.questions,
    grade,
  });
  return { attempt, grade, overview: getLearningPracticeOverview() };
}

function normalizeAnswers(practice: LearningPracticeSet, rawAnswers: Record<string, string>): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of practice.questions) {
    const value = rawAnswers[question.id];
    if (typeof value !== 'string' || !value.trim()) throw new Error('请完成全部题目后再提交');
    if (!question.options.some(option => option.id === value)) throw new Error('练习答案无效');
    answers[question.id] = value;
  }
  return answers;
}
