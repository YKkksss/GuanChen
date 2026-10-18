import type { BaziElement } from './types';

export const BAZI_MONTH_COMMAND_VERSION = 'bazi-month-command-v1-sanming-literal-fixed-days';
export const BAZI_MONTH_COMMAND_POLICY = 'sanming-main-paragraph-30-fixed-days';
export type BaziMonthCommandStatus = 'resolved' | 'uncertain_time' | 'uncovered_tail' | 'unsupported_clock' | 'inconsistent_chart';
export interface BaziMonthCommandSegment {
  id: string;
  monthBranch: string;
  order: number;
  sourceText: string;
  stem: string | null;
  element: BaziElement;
  sourceDays: number;
  fromDay: number;
  untilDay: number;
  from: string;
  untilExclusive: string;
  overlapsObservation: boolean;
  stemStatus: 'explicit' | 'text_ambiguous';
  tenGod: string | null;
  surface: string[];
  dayMasterSameStem: boolean;
  exactRoots: string[];
  sameElementRoots: string[];
  monthHiddenMatch: boolean;
  patternCandidates: Array<{ id: string; label: string }>;
  note: string;
  evidenceId: string;
}
export interface BaziMonthCommandReview {
  version: string;
  policy: string;
  policyLabel: string;
  status: BaziMonthCommandStatus;
  label: string;
  detail: string;
  savedMonthBranch: string;
  unknownTime: boolean;
  observation: { from: string; untilExclusive: string; precision: 'second' | 'day'; timeZone: 'UTC+08:00' } | null;
  months: Array<{ branch: string; startTerm: string; start: string; endTerm: string; untilExclusive: string; elapsedSecondsFrom: number; elapsedSecondsUntilExclusive: number; actualDurationSeconds: number; uncoveredTail: { from: string; untilExclusive: string; overlapsObservation: boolean } | null }>;
  segments: BaziMonthCommandSegment[];
  activeSegmentId: string | null;
  candidateSegmentIds: string[];
  comparisons: {
    monthHiddenStems: Array<{ stem: string; element: BaziElement; tenGod: string | null }>;
    climatePeriod: { label: string; status: string; activeStems: string[]; note: string };
    note: string;
  };
  sources: Array<{ id: string; title: string; url: string; note: string }>;
  boundaries: string[];
}
