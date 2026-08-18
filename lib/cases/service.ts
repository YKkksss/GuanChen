import { buildCaseAnonymizationPreview } from './anonymizer';
import type { CaseConfidence, CaseConsentScope } from './types';
import { getConversation } from '@/lib/db/conversations';
import { listLifeEvents } from '@/lib/db/events';
import { createCaseRecord } from '@/lib/db/cases';

export function previewCaseFromConversation(conversationId: string) {
  const conversation = getConversation(conversationId);
  if (!conversation) throw new Error('命盘会话不存在');
  return buildCaseAnonymizationPreview({
    conversation,
    events: listLifeEvents({ conversationId }),
  });
}

export function createCaseFromConversation(input: {
  conversationId: string;
  acknowledged: boolean;
  title?: string;
  confidence?: CaseConfidence;
  scopes?: CaseConsentScope[];
}) {
  if (!input.acknowledged) throw new Error('请先确认已经查看脱敏字段预览');
  const conversation = getConversation(input.conversationId);
  if (!conversation) throw new Error('命盘会话不存在');
  validateAnonymousTitle(input.title, conversation.birthInfo?.name);
  const preview = previewCaseFromConversation(input.conversationId);
  return createCaseRecord({
    preview,
    title: input.title,
    confidence: input.confidence,
    scopes: input.scopes ?? [],
  });
}

function validateAnonymousTitle(title: string | undefined, sourceName: string | undefined) {
  const normalized = title?.trim();
  if (!normalized) return;
  const name = sourceName?.trim();
  if (name && normalized.includes(name)) {
    throw new Error('匿名案例标题不能包含来源命盘中的姓名');
  }
  if (/\b(?:19|20)\d{2}[-/.年]\d{1,2}(?:[-/.月]\d{1,2})?/.test(normalized)) {
    throw new Error('匿名案例标题不能包含精确出生日期');
  }
}
