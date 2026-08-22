import type { DaXian, Palace, Star } from '@/lib/ziwei/types';
import type { LifeEventCategory } from '@/lib/events/types';
import type { Pattern } from '@/lib/ziwei/patterns';

export type CaseStatus = 'draft' | 'reviewed' | 'archived';
export type CaseConfidence = 'low' | 'medium' | 'high';
export type CaseSourceType = 'local_chart' | 'public_record' | 'authorized_teaching' | 'historical_record';
export type CaseConsentScope = 'local_only' | 'teaching' | 'anonymous_export' | 'public_release';
export type CaseConsentStatus = 'active' | 'revoked';

export interface AnonymousCaseStar extends Pick<Star, 'name' | 'type' | 'siHua' | 'brightness'> {}

export interface AnonymousCasePalace extends Omit<Palace, 'stars' | 'isCurrentDaXian'> {
  stars: AnonymousCaseStar[];
}

export interface AnonymousCaseDaXian extends Omit<DaXian, 'siHua'> {
  siHua?: DaXian['siHua'];
}

export interface AnonymousCaseChartSnapshot {
  snapshotVersion: 'anonymous-chart-v1';
  profile: {
    gender: 'male' | 'female';
    currentAgeBand: string;
    birthTimeConfidence: 'known' | 'unknown';
  };
  mingGongBranch: number;
  shenGongBranch: number;
  wuxingJu: number;
  wuxingJuName: string;
  ziweiPos: number;
  palaces: AnonymousCasePalace[];
  daXians: AnonymousCaseDaXian[];
}

export interface CaseEventSnapshot {
  id: string;
  caseId: string;
  category: LifeEventCategory;
  ageBand: string | null;
  datePrecision: 'year' | 'range' | 'unknown';
  impactLevel: 1 | 2 | 3 | 4 | 5;
  sourceKind: 'user_confirmed';
  createdAt: number;
}

export interface CaseSource {
  id: string;
  caseId: string;
  sourceType: CaseSourceType;
  citation: string | null;
  note: string | null;
  reliability: CaseConfidence;
  createdAt: number;
}

export interface CaseConsent {
  id: string;
  caseId: string;
  scope: CaseConsentScope;
  status: CaseConsentStatus;
  consentVersion: string;
  confirmedAt: number;
  revokedAt: number | null;
  updatedAt: number;
}

export interface CaseAuditLog {
  id: string;
  caseId: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: number;
}

export interface CaseRecord {
  id: string;
  caseCode: string;
  sourceConversationId: string | null;
  title: string;
  status: CaseStatus;
  confidence: CaseConfidence;
  chartSnapshot: AnonymousCaseChartSnapshot;
  anonymizationVersion: string;
  sources: CaseSource[];
  consents: CaseConsent[];
  events: CaseEventSnapshot[];
  auditLogs: CaseAuditLog[];
  createdAt: number;
  updatedAt: number;
  reviewedAt: number | null;
}

export interface CaseListItem {
  id: string;
  caseCode: string;
  title: string;
  status: CaseStatus;
  confidence: CaseConfidence;
  eventCount: number;
  activeScopes: CaseConsentScope[];
  wuxingJuName: string;
  createdAt: number;
  updatedAt: number;
}

export type CaseFacetType =
  | 'ming_branch'
  | 'ming_major_star'
  | 'sihua'
  | 'pattern'
  | 'wuxing_ju'
  | 'event_category';

export interface CaseSearchFacet {
  type: CaseFacetType;
  value: string;
  label: string;
}

export interface CaseSearchFilters {
  query?: string;
  mingBranch?: number;
  majorStar?: string;
  sihua?: string;
  pattern?: string;
  wuxingJu?: string;
  eventCategory?: LifeEventCategory;
  limit?: number;
  offset?: number;
}

export interface CaseSearchItem extends CaseListItem {
  mingBranch: number;
  mingMajorStars: string[];
  patterns: string[];
  sihua: string[];
  eventCategories: LifeEventCategory[];
  matchReasons: string[];
}

export interface CaseSearchOption {
  value: string;
  label: string;
  count: number;
}

export interface CaseSearchOptions {
  mingBranches: CaseSearchOption[];
  majorStars: CaseSearchOption[];
  sihua: CaseSearchOption[];
  patterns: CaseSearchOption[];
  wuxingJu: CaseSearchOption[];
  eventCategories: CaseSearchOption[];
}

export interface CaseSearchResponse {
  cases: CaseSearchItem[];
  total: number;
  options: CaseSearchOptions;
  indexVersion: number;
}

export interface CaseTeachingEvidence {
  id: string;
  title: string;
  facts: string[];
  source: 'anonymous_chart' | 'pattern_engine' | 'confirmed_events';
}

export interface CaseTeachingDetail {
  caseCode: string;
  title: string;
  confidence: CaseConfidence;
  anonymizationVersion: string;
  chartSnapshot: AnonymousCaseChartSnapshot;
  patterns: Pattern[];
  events: Array<Omit<CaseEventSnapshot, 'id' | 'caseId' | 'createdAt'>>;
  evidence: CaseTeachingEvidence[];
  studySteps: string[];
  discussionQuestions: string[];
  sourceSummary: string;
  boundaryNotice: string;
}

export type CaseComparisonMode = 'chart_to_chart' | 'daxian_to_daxian';
export type CaseComparisonStatus = 'active' | 'archived';
export type CaseComparisonDimensionStatus = 'common' | 'different' | 'unavailable';
export type CaseComparisonCategory = 'core' | 'ming_structure' | 'sihua' | 'pattern' | 'event' | 'daxian';

export interface CaseComparisonSide {
  caseId: string;
  caseCode: string;
  title: string;
  stageKey: string | null;
  stageLabel: string | null;
}

export interface CaseComparisonEvidence {
  side: 'left' | 'right';
  caseCode: string;
  source: 'anonymous_chart' | 'pattern_engine' | 'confirmed_events' | 'daxian_snapshot';
  path: string;
  value: string;
}

export interface CaseComparisonDimension {
  id: string;
  category: CaseComparisonCategory;
  title: string;
  status: CaseComparisonDimensionStatus;
  leftValue: string;
  rightValue: string;
  summary: string;
  evidence: CaseComparisonEvidence[];
}

export interface CaseComparisonResult {
  schemaVersion: 1;
  engineVersion: string;
  mode: CaseComparisonMode;
  left: CaseComparisonSide;
  right: CaseComparisonSide;
  dimensions: CaseComparisonDimension[];
  counts: {
    common: number;
    different: number;
    unavailable: number;
  };
  boundaryNotice: string;
  generatedAt: number;
}

export interface CaseComparison {
  id: string;
  comparisonCode: string;
  mode: CaseComparisonMode;
  title: string;
  status: CaseComparisonStatus;
  leftCaseId: string;
  rightCaseId: string;
  leftStageKey: string | null;
  rightStageKey: string | null;
  engineVersion: string;
  result: CaseComparisonResult;
  leftCaseUpdatedAt: number;
  rightCaseUpdatedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface CaseComparisonListItem {
  id: string;
  comparisonCode: string;
  mode: CaseComparisonMode;
  title: string;
  status: CaseComparisonStatus;
  leftLabel: string;
  rightLabel: string;
  counts: CaseComparisonResult['counts'];
  updatedAt: number;
}

export interface PrivacyPreviewItem {
  key: string;
  label: string;
  handling: 'removed' | 'generalized' | 'retained';
  result: string;
}

export interface CaseAnonymizationPreview {
  sourceConversationId: string;
  suggestedTitle: string;
  anonymizationVersion: string;
  chartSnapshot: AnonymousCaseChartSnapshot;
  events: Array<Omit<CaseEventSnapshot, 'id' | 'caseId' | 'createdAt'>>;
  privacyItems: PrivacyPreviewItem[];
  confirmedEventCount: number;
}

export interface AnonymousCaseExport {
  format: 'ziweidoushu-anonymous-case';
  formatVersion: 1;
  caseCode: string;
  title: string;
  confidence: CaseConfidence;
  anonymizationVersion: string;
  chartSnapshot: AnonymousCaseChartSnapshot;
  source: {
    sourceType: CaseSourceType;
    citation: string | null;
    note: string | null;
    reliability: CaseConfidence;
  } | null;
  events: Array<Omit<CaseEventSnapshot, 'id' | 'caseId' | 'createdAt'>>;
  authorization: {
    scope: 'anonymous_export';
    consentVersion: string;
    confirmedAt: number;
  };
  exportedAt: number;
}
