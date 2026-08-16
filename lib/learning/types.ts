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
