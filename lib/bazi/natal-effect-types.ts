import type { BaziPillarKey } from './types';

export type NatalConditionStatus = 'matched' | 'not_matched' | 'pending';
export interface NatalCondition {
  label: string;
  status: NatalConditionStatus;
  detail: string;
}
export interface BaziNatalPeriodReview {
  referenceKey: string;
  status: 'not_applicable' | 'resolved' | 'source_ambiguous' | 'uncertain_time' | 'unsupported_clock' | 'inconsistent_month';
  label: string;
  detail: string;
  sourceUrl: string;
  boundary: { name: string; at: string; timeZone: 'UTC+08:00' } | null;
  observation: { from: string; untilExclusive: string; precision: 'second' | 'day' } | null;
  branches: Array<{ id: string; label: string; primary: string[]; support: string[]; status: NatalConditionStatus; detail: string }>;
  activeBranchId: string | null;
  activeStems: string[];
}
export type NatalCombinationStatus = 'adjacent_clear' | 'adjacent_unknown' | 'adjacent_competing' | 'remote_restricted' | 'control_between' | 'separated_pending';
export interface BaziNatalCombination {
  id: string;
  pillars: [BaziPillarKey, BaziPillarKey];
  label: string;
  status: NatalCombinationStatus;
  involvesDay: boolean;
  conditions: NatalCondition[];
  observations: string[];
  pending: string[];
}
export interface BaziNatalBranchClash {
  id: string;
  label: string;
  pillars: [BaziPillarKey, BaziPillarKey];
  adjacent: boolean;
  concurrentRelations: string[];
  detail: string;
}
export interface BaziNatalRootReview {
  stem: string;
  isDayMaster: boolean;
  surfaces: string[];
  roots: Array<{
    id: string; location: string; kind: 'same_stem' | 'same_element';
    clashes: string[]; concurrentRelations: string[];
  }>;
  conditions: NatalCondition[];
}
export interface BaziNatalEffectReview {
  version: string;
  methodLabel: string;
  sources: Array<{ id: string; label: string; url: string; scope: string }>;
  period: BaziNatalPeriodReview;
  combinations: BaziNatalCombination[];
  branchClashes: BaziNatalBranchClash[];
  roots: BaziNatalRootReview[];
  unknownTime: boolean;
  boundary: string;
}
