import type { ChatMessage } from '@/lib/ai/deepseek';
import type { BaziBirthProfile, BaziChartVersion } from './types';
import type { BaziAnalysisVersion } from './interpretation-types';
import type { BaziLuckCycleVersion } from './luck-cycle-types';
import type { BaziAnnualTimelineVersion } from './annual-timeline-types';

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
