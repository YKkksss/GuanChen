import { getConversation } from '@/lib/db/conversations';
import {
  createLifeEvent,
  getLifeEvent,
  replaceEventTransitLinks,
  updateLifeEvent,
} from '@/lib/db/events';
import {
  getOrCreateAnnualTransit,
  getOrCreateDailyTransit,
  getOrCreateMonthlyTransit,
} from '@/lib/transits/service';
import type { TransitLevel } from '@/lib/transits/types';
import type { EventTransitLink, LifeEventInput, LifeEventWithTransits } from './types';

const MAX_RANGE_YEARS = 130;

export function createLifeEventWithTransits(
  conversationId: string,
  input: LifeEventInput,
): LifeEventWithTransits {
  validateEventYears(conversationId, input);
  const event = createLifeEvent(conversationId, input);
  return linkEventToTransits(event);
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
  return event ? linkEventToTransits(event) : null;
}

export function linkEventToTransits(event: LifeEventWithTransits): LifeEventWithTransits {
  if (!event.confirmedByUser) {
    replaceEventTransitLinks({ eventId: event.id, links: [] });
    return getLifeEvent(event.id)!;
  }

  const years = getEventYears(event);
  const links = new Map<string, {
    snapshotId: string;
    level: TransitLevel;
    targetDate: string;
    relationship: EventTransitLink['relationship'];
  }>();
  const addLink = (
    level: TransitLevel,
    snapshotId: string,
    targetDate: string,
    relationship: EventTransitLink['relationship'],
  ) => {
    const key = `${level}:${targetDate}`;
    const existing = links.get(key);
    links.set(key, {
      snapshotId,
      level,
      targetDate,
      relationship: existing && existing.relationship !== relationship ? 'occurs_in' : relationship,
    });
  };

  years.forEach((year, index) => {
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
    addLink('year', transit.id, transit.targetDate, relationship);
  });

  if (event.datePrecision === 'month') {
    const targetDate = resolveMonthObservationDate(event.conversationId, event.startDate);
    const transit = getOrCreateMonthlyTransit(event.conversationId, targetDate);
    addLink('month', transit.id, transit.targetDate, 'occurs_in');
  }

  if (event.datePrecision === 'day') {
    const monthly = getOrCreateMonthlyTransit(event.conversationId, event.startDate);
    const daily = getOrCreateDailyTransit(event.conversationId, event.startDate);
    addLink('month', monthly.id, monthly.targetDate, 'occurs_in');
    addLink('day', daily.id, daily.targetDate, 'occurs_in');
  }

  if (event.datePrecision === 'range' && event.endDate) {
    const boundaries = [
      { date: event.startDate, relationship: 'starts_in' as const },
      { date: event.endDate, relationship: 'ends_in' as const },
    ];
    boundaries.forEach(boundary => {
      const monthly = getOrCreateMonthlyTransit(event.conversationId, boundary.date);
      const daily = getOrCreateDailyTransit(event.conversationId, boundary.date);
      addLink('month', monthly.id, monthly.targetDate, boundary.relationship);
      addLink('day', daily.id, daily.targetDate, boundary.relationship);
    });
  }

  replaceEventTransitLinks({ eventId: event.id, links: Array.from(links.values()) });
  return getLifeEvent(event.id)!;
}

/** @deprecated 请使用 linkEventToTransits。保留别名用于兼容既有调用。 */
export const linkEventToAnnualTransits = linkEventToTransits;

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

  const minimumDate = formatBirthDate(conversation.birthInfo);
  const maximumDate = `${latestYear}-12-31`;
  if (event.datePrecision === 'day' || event.datePrecision === 'range') {
    const invalidDate = event.startDate < minimumDate
      ? event.startDate
      : event.endDate && event.endDate > maximumDate
        ? event.endDate
        : null;
    if (invalidDate) throw new Error(`事件日期必须在 ${minimumDate} 至 ${maximumDate} 之间`);
  }

  if (event.datePrecision === 'month') {
    const minimumMonth = minimumDate.slice(0, 7);
    const maximumMonth = maximumDate.slice(0, 7);
    if (event.startDate < minimumMonth || event.startDate > maximumMonth) {
      throw new Error(`事件月份必须在 ${minimumMonth} 至 ${maximumMonth} 之间`);
    }
  }
}

function resolveMonthObservationDate(conversationId: string, month: string): string {
  const birthInfo = getConversation(conversationId)?.birthInfo;
  if (!birthInfo) throw new Error('会话不存在或缺少出生信息');
  const monthStart = `${month}-01`;
  const birthDate = formatBirthDate(birthInfo);
  return monthStart < birthDate && month === birthDate.slice(0, 7) ? birthDate : monthStart;
}

function formatBirthDate(birthInfo: { year: number; month: number; day: number }): string {
  return [
    birthInfo.year,
    String(birthInfo.month).padStart(2, '0'),
    String(birthInfo.day).padStart(2, '0'),
  ].join('-');
}
