import type { MonthlyClimateReference } from './monthly-climate-rules';
import type { BaziFineReview } from './fine-reading-types';
import type { BaziNatalEffectReview } from './natal-effect-types';
import type { BaziMethodReview } from './method-review-types';
import type { BaziCalculationResult, BaziElement } from './types';
import type { BaziInterpretationResult } from './interpretation-types';
import type { BaziPatternConditionResult } from './pattern-condition-types';
export type BaziSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export interface BaziReadingEvidence { id: string; label: string; details: string; family: 'chart' | 'strength' | 'pattern' | 'climate' | 'useful'; sourceUrl?: string }
export interface BaziClimateRule { id: string; label: string; elements: BaziElement[]; attention: BaziElement[]; rationale: string; sourceSection: string; scope: 'seasonal_reference' | 'stem_month_reference' }
export interface BaziElementPosition { element: BaziElement; surface: string[]; hidden: string[]; status: 'surface_present' | 'hidden_only' | 'not_observed' | 'unknown_time' }
export interface BaziClimateAnalysis {
  season: BaziSeason; seasonLabel: string; monthBranch: string; dayStem: string;
  rule: BaziClimateRule; seasonalRule: BaziClimateRule;
  directions: Array<BaziElementPosition & { purpose: string }>;
  stemReferences: Array<{ stem: string; surface: string[]; hidden: string[]; status: BaziElementPosition['status'] }>;
  reference?: MonthlyClimateReference;
  conditions: string[]; boundary: string;
}
export interface BaziUsefulElement {
  element: BaziElement; position: BaziElementPosition;
  suggestedBy: string[]; attentionBy: string[];
  status: 'candidate' | 'method_conflict' | 'attention' | 'undetermined' | 'conditions_pending';
  label: string; rationale: string; evidenceIds: string[];
}
export interface BaziReadingFacts {
  methodologyVersion: string; chartFingerprint: string;
  chart: BaziCalculationResult; interpretation: BaziInterpretationResult; patterns: BaziPatternConditionResult;
  climate: BaziClimateAnalysis; usefulElements: BaziUsefulElement[];
  fineReview?: BaziFineReview;
  natalReview?: BaziNatalEffectReview;
  methodReview?: BaziMethodReview;
  monthCommandReview?: import('./month-command-types').BaziMonthCommandReview;
  monthIntake?: import('./month-intake-types').BaziMonthIntakeReview;
  reviewQuestions: string[]; evidence: BaziReadingEvidence[];
}
export const BAZI_READING_SECTIONS = { strength: '旺衰与承载', pattern: '格局与条件', climate: '调候与寒暖燥湿', useful: '用神方向与喜忌复核', action: '观察与行动建议' } as const;
export type BaziReadingSection = keyof typeof BAZI_READING_SECTIONS;
export interface BaziReadingContent { summary: string; sections: Array<{ key: BaziReadingSection; content: string; evidenceIds: string[] }> }
export interface BaziReadingVersion { id: string; chartVersionId: string; version: number; status: 'generating' | 'completed' | 'failed'; factsFingerprint: string; facts: BaziReadingFacts; content: BaziReadingContent | null; provider: string; model: string; errorCode: string | null; createdAt: number; updatedAt: number }
export interface BaziReadingDetail { title: string; chartVersionId: string; facts: BaziReadingFacts; versions: BaziReadingVersion[]; activeVersionId: string | null }
