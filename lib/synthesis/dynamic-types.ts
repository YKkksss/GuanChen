import type { AnnualTransitSnapshot, MonthlyTransitSnapshot } from '@/lib/transits/types';
import type { BaziLuckCycleItem } from '@/lib/bazi/luck-cycle-types';
import type { SynthesisDetail, SynthesisFacts, SynthesisTopic } from './types';

export const LEGACY_SYNTHESIS_DYNAMIC_VERSION = 'synthesis-dynamic-v1-fixed-utc8-observation';
export const SYNTHESIS_DYNAMIC_VERSION = 'synthesis-dynamic-v2-topic-cross-layer';
export interface SynthesisDynamicSelection { level: 'year' | 'month'; dateTime: string }
export interface SynthesisDynamicPillar { ganZhi: string; startAt: string; endAtExclusive: string }
export interface SynthesisDynamicStage {
  version: string;
  key: string;
  selection: SynthesisDynamicSelection;
  label: string;
  timezoneLabel: string;
  range: { minDateTime: string; maxDateTime: string };
  ziwei: { annual: AnnualTransitSnapshot; monthly: MonthlyTransitSnapshot | null };
  bazi: {
    year: SynthesisDynamicPillar;
    month: SynthesisDynamicPillar | null;
    luck: { status: 'active' | 'pre_luck' | 'unavailable'; reason: string; startAt: string | null; cycle: BaziLuckCycleItem | null; direction: string; methodologyVersion: string; engineVersion: string };
    roles: Array<{ key: 'luck' | 'year' | 'month'; label: string; ganZhi: string; stemTenGod: string; hiddenStems: Array<{ stem: string; tenGod: string }> }>;
  };
  boundaries: string[];
  /** 旧快照可能没有复核层，回看时保持原事实，不补算。 */
  review?: import('./dynamic-review-types').SynthesisDynamicReview;
}
export interface SynthesisDynamicFacts extends SynthesisFacts { dynamic: SynthesisDynamicStage }
export interface SynthesisDynamicHistory { key: string; selection: SynthesisDynamicSelection; label: string; topic: SynthesisTopic; updatedAt: number; hasReport: boolean }
export interface SynthesisDynamicDetail extends SynthesisDetail {
  facts: SynthesisDynamicFacts;
  history: SynthesisDynamicHistory[];
  savedSnapshotId: string | null;
}
