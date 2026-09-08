import { getConversation } from '@/lib/db/conversations';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import { getCurrentStage, refreshChartStage } from '@/lib/ziwei/current-stage';
import { evaluateHeming } from './engine';
import type { HemingEvaluationResult } from './types';

export class HemingEvaluationError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'HemingEvaluationError';
  }
}

export function evaluateHemingConversation(conversationId: string, asOf: Date = new Date()): HemingEvaluationResult {
  const conversation = getConversation(conversationId);
  if (!conversation) throw new HemingEvaluationError('合盘会话不存在', 404);
  if (conversation.type !== 'heming') throw new HemingEvaluationError('该会话不是合盘会话', 400);
  if (!conversation.chartSnapshotA || !conversation.chartSnapshotB || !conversation.relationshipType) {
    throw new HemingEvaluationError('合盘资料不完整', 400);
  }

  // 双方使用同一观察时点；只刷新派生阶段，不改写保存的出生资料和本命快照。
  const chartA = refreshChartStage(mergePersistedBirthInfo(conversation.chartSnapshotA, conversation.birthInfoA), asOf);
  const chartB = refreshChartStage(mergePersistedBirthInfo(conversation.chartSnapshotB, conversation.birthInfoB), asOf);
  const stages = { A: getCurrentStage(chartA, asOf), B: getCurrentStage(chartB, asOf) };
  const result = evaluateHeming({
    chartA,
    chartB,
    relationshipType: conversation.relationshipType,
    relationshipContext: conversation.relationshipContext,
    chartEngineVersion: conversation.engineVersion,
  });
  result.observation = {
    asOfDate: stages.A.asOfDate,
    timeZone: stages.A.timeZone,
    ageConvention: stages.A.ageConvention,
    ages: { A: stages.A.currentAge, B: stages.B.currentAge },
  };
  for (const owner of ['A', 'B'] as const) {
    const fact = result.facts[owner].currentStage;
    const stage = stages[owner];
    if (fact) Object.assign(fact, { asOfDate: stage.asOfDate, ageConvention: stage.ageConvention, period: stage.period });
    else result.warnings.push(`${owner === 'A' ? '甲方' : '乙方'}在 ${stage.asOfDate} 未定位到大限，阶段证据不足，不以历史阶段代替。`);
  }
  return result;
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
