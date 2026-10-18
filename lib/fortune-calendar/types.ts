import type { DailyTransitSnapshot } from '@/lib/transits/types';

export const CALENDAR_TOPICS = {
  overview: { label: '综合', palaces: ['命宫', '官禄宫', '夫妻宫', '财帛宫', '福德宫'] },
  career: { label: '事业', palaces: ['官禄宫', '命宫', '迁移宫'] },
  relationship: { label: '感情', palaces: ['夫妻宫', '福德宫', '命宫'] },
  wealth: { label: '财运', palaces: ['财帛宫', '田宅宫', '福德宫'] },
  study: { label: '学习', palaces: ['命宫', '官禄宫', '福德宫'] },
} as const;
export type CalendarTopic = keyof typeof CALENDAR_TOPICS;
export function isCalendarTopic(value: unknown): value is CalendarTopic {
  return typeof value === 'string' && Object.hasOwn(CALENDAR_TOPICS, value);
}
export const READING_SECTIONS = { overview: '当天主题', focus: '可以关注', attention: '需要留意', action: '行动建议' } as const;
export type ReadingSectionKey = keyof typeof READING_SECTIONS;
export interface CalendarEvidence { id: string; label: string; details: string }
export interface CalendarFacts {
  snapshot: DailyTransitSnapshot;
  unknownTime: boolean;
  evidence: CalendarEvidence[];
}
export interface CalendarReadingContent {
  summary: string;
  sections: Array<{ key: ReadingSectionKey; content: string; evidenceIds: string[] }>;
}
export interface CalendarReading {
  id: string; conversationId: string; date: string; topic: CalendarTopic;
  status: 'generating' | 'completed' | 'failed';
  content: CalendarReadingContent | null; facts: CalendarFacts;
  provider: string; model: string; promptVersion: string;
  errorCode: string | null; createdAt: number; updatedAt: number;
}
export interface CalendarDay {
  date: string; day: number; weekday: number; available: boolean;
  lunarLabel: string; lunarMonthLabel: string; ganZhi: string;
  dayPalace: string | null;
  reading: { status: CalendarReading['status']; summary: string | null } | null;
}
export interface CalendarMonth {
  month: string; today: string; minDate: string; maxDate: string;
  conversationTitle: string; unknownTime: boolean; days: CalendarDay[];
}
export interface CalendarDayDetail { date: string; topic: CalendarTopic; facts: CalendarFacts; reading: CalendarReading | null }
