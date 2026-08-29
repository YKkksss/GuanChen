import type { BaziLuckCycleScheduleStatus } from './luck-cycle-types';

export type BaziAnnualTimelineStatus =
  | 'complete'
  | 'annual_schedule_only'
  | 'sequence_only_unsupported_timezone';

export type BaziAnnualTimelineScheduleStatus =
  | 'established_with_luck_cycle'
  | 'established_without_luck_cycle'
  | 'provisional_sequence_only';

export interface BaziAnnualTimelineSource {
  id: string;
  title: string;
  type: 'classical_text' | 'official_implementation' | 'project_methodology';
  url?: string;
  note: string;
}

export interface BaziAnnualTimelineMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'deterministic_schedule';
  label: string;
  policy: {
    annualBoundaryRule: 'exact_li_chun_instant';
    intervalRule: 'half_open_li_chun_to_next_li_chun';
    luckCycleJoinRule: 'exact_interval_intersection';
    crossCycleRule: 'split_at_actual_luck_cycle_transition';
    supportedTimezoneIds: ['Asia/Shanghai'];
    fallbackYears: 81;
    interpretationPolicy: 'schedule_only_no_fortune_claims';
  };
  deterministicOutputs: string[];
  prohibitedClaims: string[];
  deferredRules: string[];
  sources: BaziAnnualTimelineSource[];
}

export interface BaziAnnualLuckSegment {
  startAt: string;
  endAtExclusive: string;
  kind: 'pre_luck' | 'luck_cycle';
  luckCycleIndex: number | null;
  luckCycleGanZhi: string | null;
  label: string;
}

export interface BaziAnnualTimelineItem {
  year: number;
  ganZhi: string;
  stem: string;
  branch: string;
  liChunAt: string | null;
  nextLiChunAt: string | null;
  activeFrom: string | null;
  activeUntilExclusive: string | null;
  startsBeforeBirth: boolean | null;
  segments: BaziAnnualLuckSegment[];
  crossesLuckCycleBoundary: boolean;
  scheduleStatus: BaziAnnualTimelineScheduleStatus;
}

export interface BaziAnnualTimelineResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: BaziAnnualTimelineStatus;
  capabilities: {
    annualGanZhi: true;
    exactLiChunBoundary: boolean;
    luckCycleOverlap: boolean;
    annualInterpretation: false;
    eventPrediction: false;
  };
  source: {
    chartMethodologyVersion: string;
    chartEngineVersion: string;
    chartYearPillar: string;
    birthAt: string | null;
    timeZoneId: string;
    luckCycleMethodologyVersion: string;
    luckCycleEngineVersion: string;
    luckCycleStatus: BaziLuckCycleScheduleStatus;
  };
  range: {
    startYear: number;
    endYear: number;
    yearCount: number;
  };
  years: BaziAnnualTimelineItem[];
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziAnnualTimelineVersion {
  id: string;
  chartVersionId: string;
  luckCycleVersionId: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  luckCycleFingerprint: string;
  annualTimelineFingerprint: string;
  result: BaziAnnualTimelineResult;
  createdAt: number;
  updatedAt: number;
}
