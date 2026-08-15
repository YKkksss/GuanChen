import { getConversation } from '@/lib/db/conversations';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import { evaluateHeming } from './engine';
import type { HemingEvaluationResult } from './types';

export class HemingEvaluationError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'HemingEvaluationError';
  }
}

export function evaluateHemingConversation(conversationId: string): HemingEvaluationResult {
  const conversation = getConversation(conversationId);
  if (!conversation) throw new HemingEvaluationError('合盘会话不存在', 404);
  if (conversation.type !== 'heming') throw new HemingEvaluationError('该会话不是合盘会话', 400);
  if (!conversation.chartSnapshotA || !conversation.chartSnapshotB || !conversation.relationshipType) {
    throw new HemingEvaluationError('合盘资料不完整', 400);
  }

  return evaluateHeming({
    chartA: mergePersistedBirthInfo(conversation.chartSnapshotA, conversation.birthInfoA),
    chartB: mergePersistedBirthInfo(conversation.chartSnapshotB, conversation.birthInfoB),
    relationshipType: conversation.relationshipType,
    relationshipContext: conversation.relationshipContext,
    chartEngineVersion: conversation.engineVersion,
  });
}

function mergePersistedBirthInfo(
  chart: ZiweiChart,
  persistedBirthInfo: BirthInfo | null,
): ZiweiChart {
  if (!persistedBirthInfo) return chart;
  return {
    ...chart,
    birthInfo: {
      ...chart.birthInfo,
      ...persistedBirthInfo,
    },
  };
}
