import { getConversation } from '@/lib/db/conversations';
import {
  createLifeEvent,
  getLifeEvent,
  replaceEventTransitLinks,
  updateLifeEvent,
} from '@/lib/db/events';
import { getOrCreateAnnualTransit } from '@/lib/transits/service';
import type { EventTransitLink, LifeEventInput, LifeEventWithTransits } from './types';

const MAX_RANGE_YEARS = 130;

export function createLifeEventWithTransits(
  conversationId: string,
  input: LifeEventInput,
): LifeEventWithTransits {
  validateEventYears(conversationId, input);
  const event = createLifeEvent(conversationId, input);
  return linkEventToAnnualTransits(event);
}

export function updateLifeEventWithTransits(
  conversationId: string,
  eventId: string,
  input: LifeEventInput,
): LifeEventWithTransits | null {
  const existing = getLifeEvent(eventId);
  if (!existing || existing.conversationId !== conversationId) return null;
  validateEventYears(conversationId, input);
  const event = updateLifeEvent(eventId, input);
  return event ? linkEventToAnnualTransits(event) : null;
}

export function linkEventToAnnualTransits(event: LifeEventWithTransits): LifeEventWithTransits {
  const years = getEventYears(event);
  const links = years.map((year, index) => {
    const transit = getOrCreateAnnualTransit(event.conversationId, year);
    let relationship: EventTransitLink['relationship'] = 'occurs_in';
    if (event.datePrecision === 'range') {
      relationship = years.length === 1
        ? 'occurs_in'
        : index === 0
          ? 'starts_in'
          : index === years.length - 1
            ? 'ends_in'
            : 'continues_in';
    }
    return { snapshotId: transit.id, targetDate: String(year), relationship };
  });
  replaceEventTransitLinks({ eventId: event.id, links });
  return getLifeEvent(event.id)!;
}

export function getEventYears(event: Pick<LifeEventInput, 'startDate' | 'endDate' | 'datePrecision'>): number[] {
  if (event.datePrecision === 'unknown' || !event.startDate) return [];
  const startYear = Number.parseInt(event.startDate.slice(0, 4), 10);
  const endYear = event.datePrecision === 'range' && event.endDate
    ? Number.parseInt(event.endDate.slice(0, 4), 10)
    : startYear;
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) return [];
  if (endYear - startYear > MAX_RANGE_YEARS) throw new Error(`日期范围不能超过 ${MAX_RANGE_YEARS} 年`);
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

function validateEventYears(
  conversationId: string,
  event: Pick<LifeEventInput, 'startDate' | 'endDate' | 'datePrecision'>,
) {
  const conversation = getConversation(conversationId);
  if (!conversation?.birthInfo) throw new Error('会话不存在或缺少出生信息');
  const years = getEventYears(event);
  const latestYear = Math.min(conversation.birthInfo.year + 130, 2200);
  const invalidYear = years.find(year => year < conversation.birthInfo!.year || year > latestYear);
  if (invalidYear !== undefined) {
    throw new Error(`事件年份必须在 ${conversation.birthInfo.year} 至 ${latestYear} 之间`);
  }
}
