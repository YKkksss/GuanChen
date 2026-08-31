import type {
  AnnualTransitSnapshot,
  DailyTransitSnapshot,
  MonthlyTransitSnapshot,
  TransitLevel,
} from '@/lib/transits/types';

export const LIFE_EVENT_CATEGORIES = [
  'education',
  'career',
  'finance',
  'relationship',
  'children',
  'relocation',
  'family',
  'health',
  'achievement',
  'custom',
] as const;

export type LifeEventCategory = typeof LIFE_EVENT_CATEGORIES[number];
export type LifeEventDatePrecision = 'day' | 'month' | 'year' | 'range' | 'unknown';
export type LifeEventSource = 'user_input' | 'conversation_extracted';
export type LifeEventCandidateStatus = 'pending' | 'confirmed' | 'dismissed';
export type LifeEventExtractionStatus = 'running' | 'completed' | 'skipped' | 'failed';

export interface LifeEvent {
  id: string;
  conversationId: string;
  title: string;
  category: LifeEventCategory;
  customCategory: string | null;
  startDate: string;
  endDate: string | null;
  datePrecision: LifeEventDatePrecision;
  description: string | null;
  impactLevel: 1 | 2 | 3 | 4 | 5;
  source: LifeEventSource;
  sourceMessageId: string | null;
  confirmedByUser: boolean;
  createdAt: number;
  updatedAt: number;
}

interface EventTransitLinkBase {
  id: string;
  eventId: string;
  snapshotId: string;
  targetDate: string;
  relationship: 'occurs_in' | 'starts_in' | 'continues_in' | 'ends_in';
  createdAt: number;
}

export type EventTransitLink = EventTransitLinkBase & (
  | { level: Extract<TransitLevel, 'year'>; snapshot: AnnualTransitSnapshot }
  | { level: Extract<TransitLevel, 'month'>; snapshot: MonthlyTransitSnapshot }
  | { level: Extract<TransitLevel, 'day'>; snapshot: DailyTransitSnapshot }
);

export interface LifeEventWithTransits extends LifeEvent {
  transitLinks: EventTransitLink[];
}

export interface LifeEventInput {
  title: string;
  category: LifeEventCategory;
  customCategory?: string | null;
  startDate: string;
  endDate?: string | null;
  datePrecision: LifeEventDatePrecision;
  description?: string | null;
  impactLevel: 1 | 2 | 3 | 4 | 5;
  source?: LifeEventSource;
  sourceMessageId?: string | null;
  confirmedByUser?: boolean;
}

export interface LifeEventCandidateDraft {
  title: string;
  category: LifeEventCategory;
  customCategory: string | null;
  startDate: string;
  endDate: string | null;
  datePrecision: LifeEventDatePrecision;
  description: string | null;
  impactLevel: 1 | 2 | 3 | 4 | 5;
  confidence: number;
  sourceExcerpt: string;
  reviewNotes: string[];
}

export interface LifeEventCandidate extends LifeEventCandidateDraft {
  id: string;
  runId: string;
  conversationId: string;
  sourceMessageId: string;
  candidateKey: string;
  extractionVersion: string;
  status: LifeEventCandidateStatus;
  confirmedEventId: string | null;
  createdAt: number;
  updatedAt: number;
  confirmedAt: number | null;
  dismissedAt: number | null;
}

export interface LifeEventExtractionRun {
  id: string;
  conversationId: string;
  sourceMessageId: string;
  extractorVersion: string;
  status: LifeEventExtractionStatus;
  candidateCount: number;
  errorCode: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export const LIFE_EVENT_CATEGORY_LABELS: Record<LifeEventCategory, string> = {
  education: '学业',
  career: '工作与创业',
  finance: '财务',
  relationship: '感情与婚姻',
  children: '生育与亲子',
  relocation: '搬迁与出行',
  family: '家庭事件',
  health: '健康事件',
  achievement: '奖项与成果',
  custom: '自定义',
};
