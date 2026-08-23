import type { LifeEventCategory } from '@/lib/events/types';

export const MONTHLY_REVIEW_MATCHES = [
  'not_reviewed',
  'matched',
  'partial',
  'not_matched',
] as const;

export type MonthlyReviewMatch = typeof MONTHLY_REVIEW_MATCHES[number];
export type MonthlyReviewStatus = 'draft' | 'confirmed';
export type MonthlyReviewDimension = 'career' | 'relationship' | 'health' | 'finance';

export interface MonthlyReviewScores {
  career: number | null;
  relationship: number | null;
  health: number | null;
  finance: number | null;
}

export interface MonthlyReview {
  id: string;
  conversationId: string;
  reminderInstanceId: string | null;
  reviewMonth: string;
  status: MonthlyReviewStatus;
  importantEvents: string;
  scores: MonthlyReviewScores;
  priorPrediction: string;
  actualOutcome: string;
  predictionMatch: MonthlyReviewMatch;
  corrections: string;
  nextFocus: string;
  generatedEventId: string | null;
  generatedMemoryId: string | null;
  confirmedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface MonthlyReviewDraftInput {
  conversationId: string;
  reminderInstanceId?: string | null;
  reviewMonth: string;
  importantEvents?: string;
  scores?: Partial<MonthlyReviewScores>;
  priorPrediction?: string;
  actualOutcome?: string;
  predictionMatch?: MonthlyReviewMatch;
  corrections?: string;
  nextFocus?: string;
}

export interface MonthlyReviewUpdateInput {
  importantEvents?: string;
  scores?: Partial<MonthlyReviewScores>;
  priorPrediction?: string;
  actualOutcome?: string;
  predictionMatch?: MonthlyReviewMatch;
  corrections?: string;
  nextFocus?: string;
}

export interface MonthlyReviewEventPromotion {
  title: string;
  category: LifeEventCategory;
  impactLevel: 1 | 2 | 3 | 4 | 5;
  description?: string;
}

export interface ConfirmMonthlyReviewInput {
  saveToMemory?: boolean;
  event?: MonthlyReviewEventPromotion | null;
}
