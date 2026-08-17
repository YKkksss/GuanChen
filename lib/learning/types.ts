import type { Palace, SiHua, Star } from '@/lib/ziwei/types';

export type LearningSourceType = 'project_rule' | 'classic' | 'methodology';
export type LearningKnowledgeCategory = 'chart_structure' | 'palace' | 'star' | 'sihua' | 'timing';

export interface LearningSourceReference {
  id: string;
  type: LearningSourceType;
  title: string;
  locator: string;
  href?: string;
  note: string;
}

export interface LearningKnowledgePoint {
  id: string;
  title: string;
  category: LearningKnowledgeCategory;
  level: 'beginner';
  objectives: string[];
  explanation: string;
  commonMistakes: string[];
  sourceIds: string[];
  version: string;
}

export interface LearningRelationPalace {
  relation: 'self' | 'opposite' | 'trine';
  branch: number;
  branchName: string;
  palaceName: string;
}

export interface LearningPalaceFacts {
  branch: number;
  branchName: string;
  stemName: string;
  palaceName: string;
  isMingGong: boolean;
  isShenGong: boolean;
  isEmpty: boolean;
  majorStars: Star[];
  luckyStars: Star[];
  shaStars: Star[];
  natalTransformations: Array<{ starName: string; type: SiHua }>;
  borrowedFrom: { branch: number; palaceName: string; stars: string[] } | null;
  relations: LearningRelationPalace[];
}

export interface LearningLessonStep {
  key: string;
  order: number;
  title: string;
  fact: string;
  teaching: string;
  knowledgePointIds: string[];
  sourceIds: string[];
  relatedBranches: number[];
}

export interface LearningPalaceLesson {
  schemaVersion: 1;
  methodologyVersion: string;
  knowledgeVersion: string;
  title: string;
  facts: LearningPalaceFacts;
  steps: LearningLessonStep[];
  knowledgePoints: LearningKnowledgePoint[];
  sources: LearningSourceReference[];
  boundary: string;
}

export interface LearningNote {
  id: string;
  conversationId: string;
  knowledgePointId: string;
  palaceBranch: number;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface LearningLessonResponse {
  lesson: LearningPalaceLesson;
  note: LearningNote | null;
}

export type LearningPalace = Pick<Palace, 'branch' | 'name'>;

export type LearningLessonStatus = 'not_started' | 'in_progress' | 'completed';
export type LearningQuizQuestionType = 'single_choice' | 'true_false';

export interface LearningLessonSection {
  id: string;
  title: string;
  paragraphs: string[];
  keyPoints: string[];
}

export interface LearningQuizOption {
  id: string;
  label: string;
}

export interface LearningQuizQuestion {
  id: string;
  type: LearningQuizQuestionType;
  prompt: string;
  options: LearningQuizOption[];
  correctOptionId: string;
  explanation: string;
  knowledgePointIds: string[];
  sourceIds: string[];
}

export interface LearningCourseLesson {
  id: string;
  slug: string;
  order: number;
  title: string;
  summary: string;
  durationMinutes: number;
  knowledgePointIds: string[];
  prerequisiteLessonIds: string[];
  objectives: string[];
  sections: LearningLessonSection[];
  commonMistakes: string[];
  sourceIds: string[];
  passScore: number;
  quiz: LearningQuizQuestion[];
}

export interface LearningCourse {
  schemaVersion: 1;
  id: string;
  slug: string;
  version: string;
  title: string;
  subtitle: string;
  description: string;
  level: 'beginner';
  estimatedMinutes: number;
  methodologyVersion: string;
  knowledgeVersion: string;
  lessons: LearningCourseLesson[];
  sourceIds: string[];
  boundary: string;
}

export interface LearningLessonProgress {
  id: string;
  courseId: string;
  lessonId: string;
  status: Exclude<LearningLessonStatus, 'not_started'>;
  bestScore: number;
  attemptsCount: number;
  latestAnswers: Record<string, string>;
  startedAt: number;
  completedAt: number | null;
  updatedAt: number;
}

export interface LearningCourseProgress {
  courseId: string;
  totalLessons: number;
  startedLessons: number;
  completedLessons: number;
  completionPercent: number;
  lastLessonId: string | null;
  lessons: LearningLessonProgress[];
}

export interface LearningQuizResultItem {
  questionId: string;
  selectedOptionId: string | null;
  correctOptionId: string;
  correct: boolean;
  explanation: string;
}

export interface LearningQuizGrade {
  score: number;
  passed: boolean;
  correctCount: number;
  totalCount: number;
  results: LearningQuizResultItem[];
}

export interface LearningAttempt {
  id: string;
  courseId: string;
  lessonId: string;
  score: number;
  passed: boolean;
  answers: Record<string, string>;
  grade: LearningQuizGrade;
  createdAt: number;
}

export type LearningPracticeKind = 'foundation_review' | 'chart_structure';
export type LearningReviewStatus = 'due' | 'reviewing' | 'mastered';
export type LearningKnowledgeStatus = 'learning' | 'reviewing' | 'mastered';

export interface LearningPracticeSet {
  schemaVersion: 1;
  id: string;
  kind: LearningPracticeKind;
  title: string;
  description: string;
  version: string;
  passScore: number;
  estimatedMinutes: number;
  conversationId: string | null;
  conversationTitle: string | null;
  questions: LearningQuizQuestion[];
  sourceIds: string[];
  boundary: string;
}

export interface LearningPracticeAttempt {
  id: string;
  practiceSetId: string;
  conversationId: string | null;
  score: number;
  passed: boolean;
  answers: Record<string, string>;
  grade: LearningQuizGrade;
  questions: LearningQuizQuestion[];
  createdAt: number;
}

export interface LearningKnowledgeProgress {
  knowledgePointId: string;
  title: string;
  attemptsCount: number;
  correctCount: number;
  wrongCount: number;
  masteryScore: number;
  status: LearningKnowledgeStatus;
  updatedAt: number;
}

export interface LearningReviewItem {
  id: string;
  questionKey: string;
  sourceType: 'lesson_quiz' | 'practice';
  sourceRef: string;
  question: LearningQuizQuestion;
  latestWrongAnswer: string | null;
  status: LearningReviewStatus;
  wrongCount: number;
  correctStreak: number;
  nextReviewAt: number;
  lastWrongAt: number;
  masteredAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface LearningReviewSummary {
  due: number;
  reviewing: number;
  mastered: number;
  total: number;
}

export interface LearningPracticeOverview {
  knowledge: LearningKnowledgeProgress[];
  review: LearningReviewSummary;
  practiceAttempts: number;
  latestPracticeAt: number | null;
  openPracticeAttempts: number;
  latestOpenPracticeAt: number | null;
}

export type LearningOpenExerciseTemplateId = 'ming-structure' | 'sanfang-synthesis' | 'analysis-boundary';
export type LearningOpenAttemptStatus = 'pending_feedback' | 'completed' | 'feedback_failed';

export interface LearningOpenExerciseTemplateSummary {
  id: LearningOpenExerciseTemplateId;
  title: string;
  description: string;
  estimatedMinutes: number;
}

export interface LearningOpenEvidencePoint {
  id: string;
  label: string;
  fact: string;
  acceptedExpressions: string[];
  sourceIds: string[];
}

export interface LearningOpenRubricCriterion {
  id: string;
  title: string;
  description: string;
  maxScore: number;
  evidencePointIds: string[];
  knowledgePointIds: string[];
}

export interface LearningOpenCommonErrorRule {
  id: string;
  title: string;
  description: string;
  deduction: number;
}

export interface LearningOpenExercise {
  schemaVersion: 1;
  id: string;
  templateId: LearningOpenExerciseTemplateId;
  title: string;
  description: string;
  prompt: string;
  conversationId: string;
  conversationTitle: string;
  estimatedMinutes: number;
  recommendedLength: string;
  passScore: number;
  rubricVersion: string;
  promptVersion: string;
  evidencePoints: LearningOpenEvidencePoint[];
  rubric: LearningOpenRubricCriterion[];
  commonErrors: LearningOpenCommonErrorRule[];
  sourceIds: string[];
  boundary: string;
}

export interface LearningOpenCriterionGrade {
  criterionId: string;
  title: string;
  score: number;
  maxScore: number;
  coveredEvidencePointIds: string[];
  missingEvidencePointIds: string[];
}

export interface LearningOpenDetectedIssue {
  ruleId: string;
  title: string;
  detail: string;
  deduction: number;
}

export interface LearningOpenGrade {
  score: number;
  rawScore: number;
  passScore: number;
  passed: boolean;
  wordCount: number;
  criteria: LearningOpenCriterionGrade[];
  detectedIssues: LearningOpenDetectedIssue[];
  coveredEvidencePointIds: string[];
  missingEvidencePointIds: string[];
}

export interface LearningOpenCriterionComment {
  criterionId: string;
  comment: string;
  evidencePointIds: string[];
}

export interface LearningOpenAiFeedback {
  schemaVersion: 1;
  summary: string;
  strengths: string[];
  omissions: string[];
  factIssues: string[];
  reasoningSuggestions: string[];
  expressionSuggestions: string[];
  nextRevisionFocus: string[];
  criterionComments: LearningOpenCriterionComment[];
  disclaimer: string;
}

export interface LearningOpenPracticeAttempt {
  id: string;
  exerciseId: string;
  exerciseTemplateId: LearningOpenExerciseTemplateId;
  conversationId: string | null;
  parentAttemptId: string | null;
  answer: string;
  score: number;
  passed: boolean;
  rubricVersion: string;
  promptVersion: string;
  provider: string | null;
  model: string | null;
  status: LearningOpenAttemptStatus;
  grade: LearningOpenGrade;
  exercise: LearningOpenExercise;
  feedback: LearningOpenAiFeedback | null;
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: number;
  completedAt: number | null;
}
