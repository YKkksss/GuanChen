import type { BaziGender } from './types';

export type BaziLuckCycleDirection = 'forward' | 'backward';
export type BaziStemPolarity = 'yang' | 'yin';
export type BaziLuckCycleScheduleStatus =
  | 'complete'
  | 'withheld_unknown_time'
  | 'withheld_unsupported_timezone'
  | 'withheld_chart_time_basis_conflict';

export interface BaziLuckCycleSource {
  id: string;
  title: string;
  type: 'classical_text' | 'official_implementation' | 'project_methodology';
  url?: string;
  note: string;
}

export interface BaziLuckCycleMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'deterministic_schedule';
  label: string;
  policy: {
    directionRule: 'year_stem_yin_yang_and_gender';
    forwardGroups: ['yang_male', 'yin_female'];
    backwardGroups: ['yin_male', 'yang_female'];
    boundaryRule: 'forward_next_jie_backward_previous_jie';
    boundaryScope: 'jie_only_not_all_solar_terms';
    conversionRule: 'minute_precision_three_days_one_year';
    conversionEquivalences: {
      minutesPerYear: 4320;
      minutesPerMonth: 360;
      minutesPerDay: 12;
      hoursPerRemainingMinute: 2;
    };
    precision: 'minute_seconds_discarded';
    cycleLengthYears: 10;
    displayedCycles: 8;
    supportedTimezoneIds: ['Asia/Shanghai'];
    unknownTimePolicy: 'withhold_exact_start_keep_provisional_sequence';
    apparentSolarTimePolicy: 'use_civil_birth_instant_for_elapsed_time';
  };
  deterministicOutputs: string[];
  prohibitedClaims: string[];
  deferredRules: string[];
  sources: BaziLuckCycleSource[];
}

export interface BaziLuckCycleDirectionAudit {
  value: BaziLuckCycleDirection;
  label: '顺排' | '逆排';
  yearStem: string;
  yearStemPolarity: BaziStemPolarity;
  gender: BaziGender;
  basis: string;
  status: 'established_from_chart_snapshot' | 'provisional_from_partial_chart';
}

export interface BaziLuckCycleReferenceJie {
  name: string;
  relation: 'next' | 'previous';
  at: string;
  elapsedMinutes: number;
}

export interface BaziLuckCycleStartOffset {
  years: number;
  months: number;
  days: number;
  hours: number;
  label: string;
}

export interface BaziLuckCycleItem {
  index: number;
  ganZhi: string;
  stem: string;
  branch: string;
  startAt: string | null;
  endAtExclusive: string | null;
  nominalStartYear: number | null;
  nominalEndYear: number | null;
  nominalStartAge: number | null;
  nominalEndAge: number | null;
  entryOffsetLabel: string | null;
  scheduleStatus: 'established' | 'provisional_sequence_only';
}

export interface BaziLuckCycleResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  status: BaziLuckCycleScheduleStatus;
  capabilities: {
    direction: true;
    ganZhiSequence: true;
    exactStartBoundary: boolean;
    luckInterpretation: false;
    annualPrediction: false;
    eventPrediction: false;
  };
  sourceChart: {
    methodologyVersion: string;
    engineVersion: string;
    birthAt: string | null;
    timeZoneId: string;
    timeStandard: string;
    monthPillar: string;
  };
  direction: BaziLuckCycleDirectionAudit;
  referenceJie: BaziLuckCycleReferenceJie | null;
  startOffset: BaziLuckCycleStartOffset | null;
  startAt: string | null;
  cycles: BaziLuckCycleItem[];
  rulesApplied: string[];
  warnings: string[];
  boundary: string;
}

export interface BaziLuckCycleVersion {
  id: string;
  chartVersionId: string;
  methodologyVersion: string;
  engineVersion: string;
  chartFingerprint: string;
  luckCycleFingerprint: string;
  result: BaziLuckCycleResult;
  createdAt: number;
  updatedAt: number;
}
