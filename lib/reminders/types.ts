export const REMINDER_KINDS = [
  'monthly_review',
  'birthday_review',
  'transit_change',
  'event_anniversary',
  'custom',
] as const;

export type ReminderKind = typeof REMINDER_KINDS[number];
export type ReminderRuleStatus = 'enabled' | 'disabled' | 'archived';
export type ReminderInstanceStatus = 'pending' | 'completed' | 'dismissed';
export type ReminderDisplayStatus = 'upcoming' | 'due' | 'completed' | 'dismissed';
export type ReminderTransitLevel = 'annual' | 'daxian';
export type CustomReminderRecurrence = 'none' | 'monthly' | 'yearly';

export interface ReminderClockConfig {
  hour: number;
  minute: number;
}

export interface MonthlyReviewReminderConfig extends ReminderClockConfig {
  kind: 'monthly_review';
  dayOfMonth: number;
}

export interface BirthdayReviewReminderConfig extends ReminderClockConfig {
  kind: 'birthday_review';
  leadDays: number;
}

export interface TransitChangeReminderConfig extends ReminderClockConfig {
  kind: 'transit_change';
  level: ReminderTransitLevel;
  leadDays: number;
}

export interface EventAnniversaryReminderConfig extends ReminderClockConfig {
  kind: 'event_anniversary';
  leadDays: number;
}

export interface CustomReminderConfig extends ReminderClockConfig {
  kind: 'custom';
  date: string;
  recurrence: CustomReminderRecurrence;
}

export type ReminderConfig =
  | MonthlyReviewReminderConfig
  | BirthdayReviewReminderConfig
  | TransitChangeReminderConfig
  | EventAnniversaryReminderConfig
  | CustomReminderConfig;

export interface ReminderRule {
  id: string;
  title: string;
  kind: ReminderKind;
  status: ReminderRuleStatus;
  conversationId: string | null;
  eventId: string | null;
  timezone: string;
  config: ReminderConfig;
  engineVersion: string;
  lastMaterializedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReminderInstancePayload {
  kind: ReminderKind;
  sourceLabel: string;
  boundaryNote: string;
  conversationId: string | null;
  eventId: string | null;
  stageIndex?: number;
  stageLabel?: string;
}

export interface ReminderInstance {
  id: string;
  ruleId: string;
  occurrenceKey: string;
  scheduledFor: string;
  dueAt: number;
  title: string;
  payload: ReminderInstancePayload;
  status: ReminderInstanceStatus;
  displayStatus: ReminderDisplayStatus;
  completedAt: number | null;
  dismissedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReminderCandidate {
  occurrenceKey: string;
  scheduledFor: string;
  dueAt: number;
  title: string;
  payload: ReminderInstancePayload;
}

export interface CreateReminderRuleInput {
  title: string;
  kind: ReminderKind;
  conversationId?: string | null;
  eventId?: string | null;
  timezone?: string;
  config: ReminderConfig;
}

export interface ReminderGenerationContext {
  birthDate?: { year: number; month: number; day: number } | null;
  daXians?: Array<{ startAge: number; endAge: number; palaceName: string }>;
  eventDate?: string | null;
  conversationId?: string | null;
  eventId?: string | null;
}
