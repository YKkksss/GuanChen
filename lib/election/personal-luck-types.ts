import type { BaziLuckCycleItem } from '@/lib/bazi/luck-cycle-types';
import type { BaziTenGodName } from '@/lib/bazi/dynamic-ten-god-types';

export const PERSONAL_ELECTION_LUCK_VERSION = 'personal-election-luck-v1-exact-background';
export const PERSONAL_ELECTION_LUCK_HOURS_VERSION = 'almanac-hours-v2-personal-luck-boundaries';

/** 只保存排期所需资料，不保存地点、经纬度、档案备注或完整出生输入。 */
export interface PersonalElectionLuckSnapshot {
  version: string;
  methodologyVersion: string;
  engineVersion: string;
  relationVersion: string;
  relationEngineVersion: string;
  tenGodMethodologyVersion: string;
  tenGodEngineVersion: string;
  status: 'complete' | 'withheld_unknown_time' | 'withheld_unsupported_clock' | 'withheld_chart_time_basis_conflict';
  birthDate: string;
  birthAt: string | null;
  dayMasterStem: string;
  lateZiPolicy: 'same_day' | 'next_day';
  cycles: Array<Pick<BaziLuckCycleItem, 'index' | 'ganZhi' | 'startAt' | 'endAtExclusive'>>;
  warnings: string[];
}

export interface PersonalElectionLuckRelation { label: string; detail: string }
export interface PersonalElectionLuckLayer {
  key: 'luck_cycle' | 'annual' | 'month';
  label: string;
  ganZhi: string;
  tenGod: BaziTenGodName;
  eventRelations: PersonalElectionLuckRelation[];
}
export interface PersonalElectionLuckSegment {
  startAt: string;
  endAtExclusive: string;
  luck: {
    kind: 'pre_birth' | 'birth_time_unknown' | 'pre_luck' | 'active' | 'out_of_range' | 'unavailable';
    label: string;
    ganZhi: string | null;
    index: number | null;
  };
  layers: PersonalElectionLuckLayer[];
  backgroundRelations: PersonalElectionLuckRelation[];
}
export interface PersonalElectionLuckAssessment {
  version: string;
  timezone: 'UTC+08:00';
  targetTenGod: BaziTenGodName;
  segments: PersonalElectionLuckSegment[];
  warnings: string[];
  boundary: string;
}
