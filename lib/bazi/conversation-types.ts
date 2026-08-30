import type { ChatMessage } from '@/lib/ai/deepseek';
import type { BaziBirthProfile, BaziChartVersion } from './types';
import type { BaziAnalysisVersion } from './interpretation-types';
import type { BaziLuckCycleVersion } from './luck-cycle-types';
import type { BaziAnnualTimelineVersion } from './annual-timeline-types';
import type { BaziRelationAuditVersion } from './relation-audit-types';
import type { BaziRelationAdjudicationVersion } from './relation-adjudication-types';
import type { BaziDynamicTenGodVersion } from './dynamic-ten-god-types';
import type { BaziTenGodRepeatVersion } from './ten-god-repeat-types';
import type { BaziTransparencyRootVersion } from './transparency-root-types';
import type { BaziHiddenStemActivationVersion } from './hidden-stem-activation-types';
import type { BaziStrengthCompositeVersion } from './strength-composite-types';
import type { BaziPatternConditionVersion } from './pattern-condition-types';
import type { BaziMonthDayTimelineVersion } from './month-day-timeline-types';
import type { BaziMonthDayRelationVersion } from './month-day-relation-types';
import type { BaziMonthDayVisibilityVersion } from './month-day-visibility-types';
import type { BaziMonthDayStrengthVersion } from './month-day-strength-types';

export type BaziConversationStatus = 'active' | 'archived';
export type BaziMessageRole = 'user' | 'assistant' | 'system';
export type BaziMessageStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled';
export type BaziContextRunStatus = 'pending' | 'completed' | 'failed';

export interface BaziConversationSummary {
  topicsDiscussed: string[];
  explainedFacts: string[];
  userQuestions: string[];
  corrections: string[];
  openQuestions: string[];
  boundariesReiterated: string[];
  doNotAssume: string[];
}

export interface BaziConversation {
  id: string;
  chartVersionId: string;
  analysisVersionId: string | null;
  luckCycleVersionId: string | null;
  annualTimelineVersionId: string | null;
  relationAuditVersionId: string | null;
  relationAdjudicationVersionId: string | null;
  dynamicTenGodVersionId: string | null;
  tenGodRepeatVersionId: string | null;
  transparencyRootVersionId: string | null;
  hiddenStemActivationVersionId: string | null;
  strengthCompositeVersionId: string | null;
  patternConditionVersionId: string | null;
  monthDayTimelineVersionId: string | null;
  monthDayRelationVersionId: string | null;
  monthDayVisibilityVersionId: string | null;
  monthDayStrengthVersionId: string | null;
  title: string;
  status: BaziConversationStatus;
  methodologyVersion: string;
  engineVersion: string;
  promptVersion: string;
  summary: BaziConversationSummary | null;
  summaryThroughSeq: number;
  summaryVersion: number;
  summaryUpdatedAt: number | null;
  lastMessageSeq: number;
  createdAt: number;
  updatedAt: number;
}

export interface BaziConversationDetail extends BaziConversation {
  chart: BaziChartVersion;
  profile: BaziBirthProfile;
  analysis: BaziAnalysisVersion | null;
  luckCycles: BaziLuckCycleVersion | null;
  annualTimeline: BaziAnnualTimelineVersion | null;
  relationAudit: BaziRelationAuditVersion | null;
  relationAdjudication: BaziRelationAdjudicationVersion | null;
  dynamicTenGod: BaziDynamicTenGodVersion | null;
  tenGodRepeat: BaziTenGodRepeatVersion | null;
  transparencyRoot: BaziTransparencyRootVersion | null;
  hiddenStemActivation: BaziHiddenStemActivationVersion | null;
  strengthComposite: BaziStrengthCompositeVersion | null;
  patternCondition: BaziPatternConditionVersion | null;
  monthDayTimeline: BaziMonthDayTimelineVersion | null;
  monthDayRelation: BaziMonthDayRelationVersion | null;
  monthDayVisibility: BaziMonthDayVisibilityVersion | null;
  monthDayStrength: BaziMonthDayStrengthVersion | null;
}

export interface BaziConversationListItem extends BaziConversation {
  profileName: string;
  pillars: string;
  messageCount: number;
  lastMessagePreview: string;
}

export interface BaziConversationMessage {
  id: string;
  conversationId: string;
  seq: number;
  role: BaziMessageRole;
  content: string;
  source: string;
  status: BaziMessageStatus;
  tokenCount: number;
  errorCode: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface BaziContextRun {
  id: string;
  conversationId: string;
  triggerMessageId: string;
  assistantMessageId: string;
  provider: string;
  model: string;
  contextLimit: number;
  outputReserve: number;
  inputBudget: number;
  estimatedInputTokens: number;
  actualInputTokens: number | null;
  actualOutputTokens: number | null;
  cachedInputTokens: number | null;
  summaryVersion: number | null;
  recentMessageStartSeq: number | null;
  recentMessageCount: number;
  contextManifest: Record<string, unknown>;
  status: BaziContextRunStatus;
  errorCode: string | null;
  createdAt: number;
  completedAt: number | null;
}

export interface BuiltBaziContext {
  messages: ChatMessage[];
  contextLimit: number;
  outputReserve: number;
  inputBudget: number;
  estimatedInputTokens: number;
  summaryVersion: number | null;
  recentMessageStartSeq: number | null;
  recentMessageIds: string[];
  manifest: Record<string, unknown>;
}
