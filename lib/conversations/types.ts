import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import type { HemingRelationshipContext, RelationshipType } from '@/lib/heming/types';

export type ConversationType = 'chart' | 'heming';
export type ConversationStatus = 'active' | 'archived';
export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled';
export type MemoryCategory =
  | 'user_fact'
  | 'confirmed_event'
  | 'user_preference'
  | 'correction'
  | 'open_question'
  | 'previous_interpretation';
export type MemoryStatus = 'active' | 'superseded' | 'deleted';
export type ContextRunStatus = 'pending' | 'completed' | 'failed';

export interface ConversationSummary {
  user_context: string[];
  confirmed_events: string[];
  topics_discussed: string[];
  previous_conclusions: string[];
  corrections: string[];
  open_questions: string[];
  user_preferences: string[];
  disputed_or_uncertain: string[];
  do_not_assume: string[];
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string;
  status: ConversationStatus;
  birthInfo: BirthInfo | null;
  chartSnapshot: ZiweiChart | null;
  birthInfoA: BirthInfo | null;
  birthInfoB: BirthInfo | null;
  chartSnapshotA: ZiweiChart | null;
  chartSnapshotB: ZiweiChart | null;
  relationshipType: RelationshipType | null;
  relationshipContext: HemingRelationshipContext | null;
  engineVersion: string;
  promptVersion: string;
  summary: ConversationSummary | null;
  summaryThroughSeq: number;
  summaryVersion: number;
  summaryUpdatedAt: number | null;
  lastMessageSeq: number;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationListItem {
  id: string;
  type: ConversationType;
  title: string;
  status: ConversationStatus;
  birthInfo: BirthInfo | null;
  messageCount: number;
  lastMessagePreview: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  seq: number;
  role: MessageRole;
  content: string;
  source: string;
  topic: string | null;
  palaceBranch: number | null;
  sihuaType: string | null;
  metadata: Record<string, unknown> | null;
  status: MessageStatus;
  tokenCount: number;
  errorCode: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryItem {
  id: string;
  conversationId: string;
  category: MemoryCategory;
  content: string;
  normalizedKey: string | null;
  sourceMessageId: string | null;
  confidence: number;
  status: MemoryStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ContextRun {
  id: string;
  conversationId: string;
  triggerMessageId: string;
  assistantMessageId: string | null;
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
  retrievedMessageIds: string[];
  contextManifest: Record<string, unknown>;
  status: ContextRunStatus;
  errorCode: string | null;
  createdAt: number;
  completedAt: number | null;
}

export function isHiddenSource(source: string): boolean {
  return source === 'topic' || source === 'palace' || source === 'sihua' || source === 'auto';
}
