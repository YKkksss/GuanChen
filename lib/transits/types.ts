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

export interface TransitSnapshotRecord {
  id: string;
  conversationId: string;
  level: TransitLevel;
  targetDate: string;
  engineVersion: string;
  snapshot: AnnualTransitSnapshot;
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
