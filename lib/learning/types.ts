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
