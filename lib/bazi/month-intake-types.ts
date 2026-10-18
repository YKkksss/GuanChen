import type { BaziElement } from './types';

export const BAZI_MONTH_INTAKE_VERSION = 'bazi-month-intake-v1-transparency-meeting-routes';
export const BAZI_MONTH_INTAKE_POLICY = 'ziping-zhenquan-useful-god-change-narrow';

export type BaziMonthIntakeStatus = 'complete' | 'partial_unknown_time';
export type BaziMonthIntakeSourceQi = 'main_qi' | 'secondary_qi' | 'residual_qi';
export type BaziMonthIntakeTransparency = 'not_transparent' | 'single_transparent' | 'multiple_transparent';
export type BaziMonthIntakeEntry = 'main_qi_entry' | 'transparency_entry' | 'hidden_candidate';
export type BaziMonthIntakeMeetingType = 'three_harmony' | 'three_meeting';

/** 月支已保存藏干逐干建立的入口路径；未透者也保留，不筛掉候选。 */
export interface BaziMonthIntakeRoute {
  id: string;
  sourceQi: BaziMonthIntakeSourceQi;
  sourceQiLabel: string;
  stem: string;
  element: BaziElement;
  tenGod: string | null;
  entry: BaziMonthIntakeEntry;
  entryLabel: string;
  transparency: BaziMonthIntakeTransparency;
  transparencyLabel: string;
  /** 年干、月干、时干的同干位置；日干不在此列。 */
  positions: string[];
  dayMasterSameStem: boolean;
  patternCandidates: Array<{ id: string; label: string }>;
  pending: string[];
  note: string;
  evidenceId: string;
}

/** 含月支的三合或三会：完整组成为入口，缺字组只作条件保留。 */
export interface BaziMonthIntakeMeeting {
  id: string;
  type: BaziMonthIntakeMeetingType;
  typeLabel: string;
  branches: string[];
  label: string;
  /** 只记录组合所指向的五行，不指定阴阳天干。 */
  targetElement: BaziElement;
  complete: boolean;
  entry: boolean;
  observedBranches: string[];
  missingBranches: string[];
  conclusion: 'target_element_only_not_transformed';
  note: string;
  evidenceId: string;
}

/** 含月支的六合，单列，不冒充三合或三会。 */
export interface BaziMonthIntakeSixCombine {
  id: string;
  branches: string[];
  partner: string;
  label: string;
  note: string;
  evidenceId: string;
}

export type BaziMonthIntakeObstructionKind =
  | 'month_branch_clash'
  | 'surface_stem_combine'
  | 'element_opposition';

export interface BaziMonthIntakeObstruction {
  id: string;
  kind: BaziMonthIntakeObstructionKind;
  label: string;
  detail: string;
  status: 'condition_pending';
  relatedRouteIds: string[];
  relatedMeetingIds: string[];
  evidenceId: string;
}

export interface BaziMonthIntakeCounts {
  hiddenRoutes: number;
  mainQiTransparent: boolean;
  singleTransparent: number;
  multipleTransparent: number;
  notTransparent: number;
  completeMeetings: number;
  incompleteMeetings: number;
  sixCombines: number;
  obstructions: number;
}

export interface BaziMonthIntakeSource {
  id: string;
  title: string;
  url: string;
  note: string;
}

export interface BaziMonthIntakeReview {
  version: string;
  policy: string;
  policyLabel: string;
  status: BaziMonthIntakeStatus;
  label: string;
  detail: string;
  monthBranch: string;
  unknownTime: boolean;
  dayMasterStem: string;
  dayMasterElement: BaziElement;
  monthMainQiStem: string;
  monthMainQiElement: BaziElement;
  monthHiddenStems: Array<{ stem: string; element: BaziElement; tenGod: string | null }>;
  routes: BaziMonthIntakeRoute[];
  meetings: BaziMonthIntakeMeeting[];
  incompleteMeetings: BaziMonthIntakeMeeting[];
  sixCombines: BaziMonthIntakeSixCombine[];
  obstructions: BaziMonthIntakeObstruction[];
  counts: BaziMonthIntakeCounts;
  sources: BaziMonthIntakeSource[];
  boundaries: string[];
}
