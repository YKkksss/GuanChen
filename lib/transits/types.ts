import type { SiHua } from '@/lib/ziwei/types';

export type TransitLevel = 'year' | 'month' | 'day';

export interface TransitRuleEvidence {
  id: string;
  label: string;
  source: 'iztro' | 'project-rule';
  details: string;
}

export interface TransitTransform {
  type: SiHua;
  starName: string;
  natalPalaceBranch: number | null;
  natalPalaceName: string | null;
}

export interface TransitPalaceMapping {
  branch: number;
  nativePalaceName: string;
  transitPalaceName: string;
  transitStars: string[];
}

export interface TransitKeyPalace {
  branch: number;
  nativePalaceName: string;
  transitPalaceName: string;
  reasons: string[];
}

export interface AnnualTransitSnapshot {
  level: 'year';
  selectedYear: number;
  targetDate: string;
  representativeDate: string;
  boundaryPolicy: 'annual-midyear-representative-date';
  engineVersion: string;
  lunarDate: string;
  nominalAge: number;
  year: {
    heavenlyStem: string;
    earthlyBranch: string;
    ganZhi: string;
  };
  decadal: {
    startAge: number | null;
    endAge: number | null;
    palaceBranch: number;
    nativePalaceName: string;
    heavenlyStem: string;
    earthlyBranch: string;
  };
  flowYear: {
    palaceBranch: number;
    nativePalaceName: string;
    heavenlyStem: string;
    earthlyBranch: string;
  };
  transformations: TransitTransform[];
  relatedPalaceBranches: number[];
  palaceMappings: TransitPalaceMapping[];
  keyPalaces: TransitKeyPalace[];
  topicPalaces: Record<'career' | 'relationship' | 'wealth' | 'health', number>;
  evidence: TransitRuleEvidence[];
}

export interface MonthlyTransitSnapshot {
  level: 'month';
  targetDate: string;
  representativeDate: string;
  boundaryPolicy: 'lunar-month-first-day';
  engineVersion: string;
  lunarDate: string;
  nominalAge: number;
  lunarMonth: {
    year: number;
    month: number;
    isLeap: boolean;
    label: string;
    startDate: string;
    endDate: string;
    dayCount: number;
  };
  year: {
    heavenlyStem: string;
    earthlyBranch: string;
    ganZhi: string;
  };
  decadal: {
    startAge: number | null;
    endAge: number | null;
    palaceBranch: number;
    nativePalaceName: string;
    heavenlyStem: string;
    earthlyBranch: string;
  };
  flowYear: {
    palaceBranch: number;
    nativePalaceName: string;
    heavenlyStem: string;
    earthlyBranch: string;
  };
  flowMonth: {
    palaceBranch: number;
    nativePalaceName: string;
    heavenlyStem: string;
    earthlyBranch: string;
    ganZhi: string;
  };
  yearlyTransformations: TransitTransform[];
  transformations: TransitTransform[];
  relatedPalaceBranches: number[];
  palaceMappings: TransitPalaceMapping[];
  keyPalaces: TransitKeyPalace[];
  topicPalaces: Record<'career' | 'relationship' | 'wealth' | 'health', number>;
  evidence: TransitRuleEvidence[];
}

export interface MonthlyTransitYearItem {
  snapshotId: string;
  targetDate: string;
  lunarMonth: MonthlyTransitSnapshot['lunarMonth'];
  nominalAge: number;
  yearGanZhi: string;
  flowMonth: MonthlyTransitSnapshot['flowMonth'];
  transformations: TransitTransform[];
  keyPalaces: TransitKeyPalace[];
  topicPalaces: MonthlyTransitSnapshot['topicPalaces'];
}

export interface MonthlyTransitYearOverview {
  level: 'month-year';
  lunarYear: number;
  startDate: string;
  endDate: string;
  monthCount: number;
  boundaryPolicy: 'lunar-year-first-day-to-next-lunar-year-eve';
  comparisonPolicy: 'user-selected-factual-difference';
  engineVersion: string;
  previousYearStartDate: string | null;
  nextYearStartDate: string | null;
  months: MonthlyTransitYearItem[];
  evidence: TransitRuleEvidence[];
}

export interface DailyTransitSnapshot {
  level: 'day';
  targetDate: string;
  representativeDate: string;
  representativeTimeIndex: 0;
  boundaryPolicy: 'civil-date-early-rat-hour-representative';
  engineVersion: string;
  lunarDate: string;
  nominalAge: number;
  lunarDay: {
    year: number;
    month: number;
    day: number;
    isLeapMonth: boolean;
    monthLabel: string;
    dayLabel: string;
  };
  lunarMonth: MonthlyTransitSnapshot['lunarMonth'];
  year: MonthlyTransitSnapshot['year'];
  decadal: MonthlyTransitSnapshot['decadal'];
  flowYear: MonthlyTransitSnapshot['flowYear'];
  flowMonth: MonthlyTransitSnapshot['flowMonth'];
  flowDay: {
    palaceBranch: number;
    nativePalaceName: string;
    heavenlyStem: string;
    earthlyBranch: string;
    ganZhi: string;
  };
  yearlyTransformations: TransitTransform[];
  monthlyTransformations: TransitTransform[];
  transformations: TransitTransform[];
  relatedPalaceBranches: number[];
  palaceMappings: TransitPalaceMapping[];
  keyPalaces: TransitKeyPalace[];
  topicPalaces: Record<'career' | 'relationship' | 'wealth' | 'health', number>;
  evidence: TransitRuleEvidence[];
}

export type TransitSnapshot = AnnualTransitSnapshot | MonthlyTransitSnapshot | DailyTransitSnapshot;

export interface TransitSnapshotRecord<TSnapshot extends TransitSnapshot = TransitSnapshot> {
  id: string;
  conversationId: string;
  level: TransitLevel;
  targetDate: string;
  engineVersion: string;
  snapshot: TSnapshot;
  createdAt: number;
  updatedAt: number;
}

export type TransitReportStatus = 'generating' | 'completed' | 'failed';

export interface AnnualTransitReportVersion {
  id: string;
  reportId: string;
  version: number;
  snapshotId: string;
  engineVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  generationReason: import('@/lib/reports/types').ReportGenerationReason;
  baseVersionId: string | null;
  content: string;
  status: TransitReportStatus;
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: number;
  completedAt: number | null;
}

export interface AnnualTransitReport {
  id: string;
  conversationId: string;
  snapshotId: string;
  level: 'year';
  targetDate: string;
  engineVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  activeVersionId: string | null;
  versionId: string | null;
  version: number | null;
  versionCount: number;
  generationReason: import('@/lib/reports/types').ReportGenerationReason;
  baseVersionId: string | null;
  content: string;
  status: TransitReportStatus;
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface AnnualTransitReportDetail {
  report: AnnualTransitReport;
  versions: AnnualTransitReportVersion[];
}
