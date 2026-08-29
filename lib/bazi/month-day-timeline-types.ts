import type { BaziAnnualTimelineStatus } from './annual-timeline-types';
import type { BaziLateZiPolicy } from './types';

export type BaziMonthDayTimelineStatus =
  | 'complete'
  | 'calendar_only_without_luck'
  | 'sequence_only_unsupported_timezone';

export interface BaziMonthDayTimelineSource {
  id: string;
  title: string;
  type: 'official_implementation' | 'project_methodology';
  url?: string;
  note: string;
}

export interface BaziMonthDayTimelineMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'deterministic_schedule';
  label: string;
  policy: {
    monthBoundaryRule: 'exact_jie_instant';
    monthIntervalRule: 'half_open_jie_to_next_jie';
    dayBoundaryRule: 'inherit_chart_late_zi_policy';
    sameDayIntervalRule: 'civil_midnight_to_next_midnight';
    nextDayIntervalRule: 'previous_day_23_to_current_day_23';
    annualJoinRule: 'clip_to_selected_annual_interval';
    luckCycleJoinRule: 'inherit_annual_luck_segments';
    cacheRule: 'one_version_per_chart_and_annual_year';
    supportedTimezoneIds: ['Asia/Shanghai'];
    interpretationPolicy: 'schedule_only_no_fortune_claims';
  };
  deterministicOutputs: string[];
  prohibitedClaims: string[];
  deferredRules: string[];
  sources: BaziMonthDayTimelineSource[];
}

export interface BaziMonthDayTimelineSegment {
  startAt: string;
  endAtExclusive: string;
  monthIndex: number;
  monthGanZhi: string;
  luckCycleIndex: number | null;
  luckCycleGanZhi: string | null;
  label: string;
}

export interface BaziFlowMonthItem {
  index: number;
  jieName: string;
  ganZhi: string;
  stem: string;
  branch: string;
  startAt: string | null;
  endAtExclusive: string | null;
  activeFrom: string | null;
  activeUntilExclusive: string | null;
  segments: BaziMonthDayTimelineSegment[];
  crossesLuckCycleBoundary: boolean;
  scheduleStatus: 'established' | 'provisional_sequence_only';
}

export interface BaziFlowDayItem {
  index: number;
  effectiveDate: string;
  ganZhi: string;
  stem: string;
  branch: string;
  startAt: string;
  endAtExclusive: string;
  activeFrom: string;
  activeUntilExclusive: string;
  segments: BaziMonthDayTimelineSegment[];
  crossesMonthBoundary: boolean;
  crossesLuckCycleBoundary: boolean;
}

export interface BaziMonthDayTimelineResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: BaziMonthDayTimelineStatus;
  capabilities: {
    monthGanZhi: true;
    exactJieBoundary: boolean;
    dayGanZhi: boolean;
    lateZiBoundary: boolean;
    luckCycleOverlap: boolean;
    interpretation: false;
    eventPrediction: false;
  };
  source: {
    chartMethodologyVersion: string;
    chartEngineVersion: string;
    annualTimelineMethodologyVersion: string;
    annualTimelineEngineVersion: string;
    annualTimelineStatus: BaziAnnualTimelineStatus;
    targetYear: number;
    targetYearGanZhi: string;
    timeZoneId: string;
    lateZiPolicy: BaziLateZiPolicy;
  };
  annualInterval: {
    year: number;
    ganZhi: string;
    liChunAt: string | null;
    nextLiChunAt: string | null;
    activeFrom: string | null;
    activeUntilExclusive: string | null;
  };
  counts: {
    months: number;
    days: number;
    monthBoundaryDays: number;
    luckBoundaryDays: number;
  };
  months: BaziFlowMonthItem[];
  days: BaziFlowDayItem[];
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziMonthDayTimelineVersion {
  id: string;
  chartVersionId: string;
  annualTimelineVersionId: string;
  targetYear: number;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  annualTimelineFingerprint: string;
  monthDayTimelineFingerprint: string;
  result: BaziMonthDayTimelineResult;
  createdAt: number;
  updatedAt: number;
}
