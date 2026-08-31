import { getConversation } from '@/lib/db/conversations';
import { getTransitSnapshot, upsertTransitSnapshot } from '@/lib/db/transits';
import {
  buildAnnualTransitSnapshot,
  buildMonthlyTransitSnapshot,
  MONTHLY_TRANSIT_ENGINE_VERSION,
  TRANSIT_ENGINE_VERSION,
} from './engine';
import type { AnnualTransitSnapshot, MonthlyTransitSnapshot, TransitSnapshotRecord } from './types';

export function getOrCreateAnnualTransit(
  conversationId: string,
  selectedYear: number,
): TransitSnapshotRecord<AnnualTransitSnapshot> {
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
  const cached = getTransitSnapshot<AnnualTransitSnapshot>(lookup);
  if (cached) return cached;

  return upsertTransitSnapshot({
    ...lookup,
    snapshot: buildAnnualTransitSnapshot(conversation.chartSnapshot, selectedYear),
  });
}

export function getOrCreateMonthlyTransit(
  conversationId: string,
  targetDate: string,
): TransitSnapshotRecord<MonthlyTransitSnapshot> {
  const conversation = getConversation(conversationId);
  if (!conversation?.birthInfo || !conversation.chartSnapshot) {
    throw new Error('会话不存在或缺少命盘快照');
  }

  const minimumDate = [
    conversation.birthInfo.year,
    String(conversation.birthInfo.month).padStart(2, '0'),
    String(conversation.birthInfo.day).padStart(2, '0'),
  ].join('-');
  const maximumDate = `${Math.min(conversation.birthInfo.year + 130, 2200)}-12-31`;
  if (targetDate < minimumDate || targetDate > maximumDate) {
    throw new Error(`日期必须在 ${minimumDate} 至 ${maximumDate} 之间`);
  }
  const snapshot = buildMonthlyTransitSnapshot(conversation.chartSnapshot, targetDate);

  const lookup = {
    conversationId,
    level: 'month' as const,
    targetDate: snapshot.targetDate,
    engineVersion: MONTHLY_TRANSIT_ENGINE_VERSION,
  };
  const cached = getTransitSnapshot<MonthlyTransitSnapshot>(lookup);
  if (cached) return cached;
  return upsertTransitSnapshot({ ...lookup, snapshot });
}
