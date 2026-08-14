import { getConversation } from '@/lib/db/conversations';
import { getTransitSnapshot, upsertTransitSnapshot } from '@/lib/db/transits';
import { buildAnnualTransitSnapshot, TRANSIT_ENGINE_VERSION } from './engine';
import type { TransitSnapshotRecord } from './types';

export function getOrCreateAnnualTransit(
  conversationId: string,
  selectedYear: number,
): TransitSnapshotRecord {
  const conversation = getConversation(conversationId);
  if (!conversation?.birthInfo || !conversation.chartSnapshot) {
    throw new Error('会话不存在或缺少命盘快照');
  }
  const latestYear = Math.min(conversation.birthInfo.year + 130, 2200);
  if (!Number.isInteger(selectedYear) || selectedYear < conversation.birthInfo.year || selectedYear > latestYear) {
    throw new Error(`年份必须在 ${conversation.birthInfo.year} 至 ${latestYear} 之间`);
  }

  const lookup = {
    conversationId,
    level: 'year' as const,
    targetDate: String(selectedYear),
    engineVersion: TRANSIT_ENGINE_VERSION,
  };
  const cached = getTransitSnapshot(lookup);
  if (cached) return cached;

  return upsertTransitSnapshot({
    ...lookup,
    snapshot: buildAnnualTransitSnapshot(conversation.chartSnapshot, selectedYear),
  });
}
