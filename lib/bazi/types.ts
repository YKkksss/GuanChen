import type { RectificationTimeConversionSnapshot } from '@/lib/rectification/types';

export const BAZI_TIME_STANDARDS = ['civil_time', 'apparent_solar_time'] as const;
export const BAZI_LATE_ZI_POLICIES = ['same_day', 'next_day'] as const;
export const BAZI_PILLAR_KEYS = ['year', 'month', 'day', 'time'] as const;
export const BAZI_ELEMENTS = ['木', '火', '土', '金', '水'] as const;

export type BaziTimeStandard = typeof BAZI_TIME_STANDARDS[number];
export type BaziLateZiPolicy = typeof BAZI_LATE_ZI_POLICIES[number];
export type BaziPillarKey = typeof BAZI_PILLAR_KEYS[number];
export type BaziElement = typeof BAZI_ELEMENTS[number];
export type BaziGender = 'male' | 'female';

export interface BaziCalculationInput {
  birthDate: string;
  birthTime?: string;
  gender: BaziGender;
  timeZoneId?: string;
  longitude?: number;
  timeStandard?: BaziTimeStandard;
  lateZiPolicy?: BaziLateZiPolicy;
  unknownTime?: boolean;
}

export interface BaziSourceReference {
  id: string;
  title: string;
  type: 'official_documentation' | 'project_methodology';
  url?: string;
  note: string;
}

export interface BaziCalculationPolicy {
  calendarInput: 'gregorian';
  yearBoundary: 'exact_li_chun';
  monthBoundary: 'exact_jie';
  defaultTimeStandard: BaziTimeStandard;
  supportedTimeStandards: BaziTimeStandard[];
  defaultLateZiPolicy: BaziLateZiPolicy;
  supportedLateZiPolicies: BaziLateZiPolicy[];
  timezoneSource: 'iana_tzdb';
  apparentSolarAlgorithm: 'noaa-fractional-year';
  unknownTimePolicy: 'omit_time_pillar_and_warn';
  supportedDateRange: { minimum: string; maximum: string };
}

export interface BaziMethodology {
  schemaVersion: 1;
  version: string;
  engineVersion: string;
  status: 'foundation';
  label: string;
  calculationPolicy: BaziCalculationPolicy;
  deterministicOutputs: string[];
  deferredInterpretations: string[];
  prohibitedClaims: string[];
  sources: BaziSourceReference[];
}

export interface BaziHiddenStem {
  stem: string;
  element: BaziElement;
  tenGod: string;
}

export interface BaziPillar {
  key: BaziPillarKey;
  label: string;
  ganZhi: string;
  stem: string;
  branch: string;
  stemElement: BaziElement;
  branchElement: BaziElement;
  stemTenGod: string;
  hiddenStems: BaziHiddenStem[];
  naYin: string;
  growthStage: string;
  xunKong: string;
}

export interface BaziElementCount {
  element: BaziElement;
  surface: number;
  hiddenStems: number;
}

export interface BaziCalculationResult {
  methodologyVersion: string;
  engineVersion: string;
  calculatedAt: string;
  input: Required<Pick<BaziCalculationInput,
    'birthDate' | 'gender' | 'timeStandard' | 'lateZiPolicy' | 'unknownTime'>> & {
      birthTime: string | null;
      timeZoneId: string;
      longitude: number | null;
    };
  effectiveTime: {
    date: string;
    time: string;
    standard: BaziTimeStandard;
    conversion: RectificationTimeConversionSnapshot | null;
  };
  calendar: {
    solar: string;
    lunar: string;
    solarTerm: string | null;
  };
  dayMaster: {
    stem: string;
    element: BaziElement;
  };
  pillars: {
    year: BaziPillar;
    month: BaziPillar;
    day: BaziPillar;
    time: BaziPillar | null;
  };
  elementCounts: BaziElementCount[];
  completeness: 'complete' | 'partial_unknown_time';
  rulesApplied: string[];
  warnings: string[];
}
