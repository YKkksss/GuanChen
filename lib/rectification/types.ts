import type {
  LifeEventCategory,
  LifeEventDatePrecision,
  LifeEventInput,
  LifeEventSource,
} from '@/lib/events/types';
import type { PalaceName } from '@/lib/heming/types';
import type { AnnualTransitSnapshot } from '@/lib/transits/types';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';

export const RECTIFICATION_TIME_SLOT_KEYS = [
  'early_zi', 'chou', 'yin', 'mao', 'chen', 'si', 'wu',
  'wei', 'shen', 'you', 'xu', 'hai', 'late_zi',
] as const;

export type RectificationTimeSlotKey = typeof RECTIFICATION_TIME_SLOT_KEYS[number];
export type RectificationConfidence = 'low' | 'medium' | 'high';
export type RectificationStatus = 'draft' | 'ready' | 'evaluated' | 'confirmed' | 'archived';
export type RectificationEvidenceOutcome = 'support' | 'weak_support' | 'neutral' | 'conflict' | 'insufficient';
export type RectificationRuleLayer = 'reported_time' | 'decadal' | 'annual_flow' | 'annual_key_palace' | 'annual_transformation' | 'convergence' | 'safety';
export type RectificationRuleKind =
  | 'reported_window_contains'
  | 'decadal_topic_focus'
  | 'annual_flow_topic_focus'
  | 'annual_key_palace_topic_focus'
  | 'annual_transformation_topic_focus'
  | 'multi_layer_convergence'
  | 'insufficient_event_guard'
  | 'indistinguishable_candidate_guard';

export type ReportedTimeSource =
  | 'birth_certificate'
  | 'hospital_record'
  | 'household_record'
  | 'family_written_record'
  | 'family_memory'
  | 'self_memory'
  | 'unknown';

export type RectificationEventEvidenceQuality =
  | 'documented'
  | 'corroborated_memory'
  | 'single_person_memory'
  | 'conversation_extracted'
  | 'unconfirmed';

export type RectificationReportedTimePrecision = 'exact' | 'approximate' | 'range' | 'period' | 'unknown';

export interface RectificationSourceReference {
  id: string;
  title: string;
  type: 'official_documentation' | 'research_paper' | 'project_methodology' | 'traditional_reference';
  url?: string;
  note: string;
}

export interface RectificationTimeSlotDefinition {
  key: RectificationTimeSlotKey;
  label: string;
  branchIndex: number;
  engineTimeIndex: number;
  apparentSolarStart: string;
  apparentSolarEnd: string;
  ziSegment: 'early' | 'late' | null;
}

export interface RectificationTimePolicy {
  version: string;
  inputTimeScale: 'civil_time';
  outputTimeScale: 'apparent_solar_time';
  timezoneSource: 'iana_tzdb';
  equationOfTimeAlgorithm: 'noaa-fractional-year';
  longitudeConvention: 'east-positive';
  lateZiPolicy: 'iztro-late-zi-index';
  pre1970TimezonePolicy: 'manual-verification-required';
  steps: string[];
  slots: RectificationTimeSlotDefinition[];
}

export interface RectificationReportedTimeEvidence {
  source: ReportedTimeSource;
  precision: RectificationReportedTimePrecision;
  reportedStartLocal: string | null;
  reportedEndLocal: string | null;
  timezoneId: string | null;
  longitude: number | null;
  latitude: number | null;
  notes: string | null;
}

export type RectificationLocalTimeStatus = 'unique' | 'ambiguous';

export interface RectificationUtcCandidate {
  utcIso: string;
  utcOffsetMinutes: number;
}

/**
 * 民用时间到视太阳时的不可变换算快照。
 * 保存实际使用的历史时区偏移和算法版本，避免 tzdb 更新后静默改变旧会话。
 */
export interface RectificationTimeConversionSnapshot {
  sourceDate: string;
  sourceTime: string;
  timeZoneId: string;
  longitude: number;
  localTimeStatus: RectificationLocalTimeStatus;
  utcCandidates: RectificationUtcCandidate[];
  selectedUtcIso: string;
  selectedUtcOffsetMinutes: number;
  equationOfTimeMinutes: number;
  longitudeCorrectionMinutes: number;
  totalCorrectionMinutes: number;
  apparentSolarDate: string;
  apparentSolarTime: string;
  apparentSolarMinutes: number;
  dayOffset: number;
  slotKey: RectificationTimeSlotKey;
  branchIndex: number;
  engineTimeIndex: number;
  timePolicyVersion: string;
  timezoneDatabaseVersion: string | null;
  warnings: string[];
}

export interface RectificationEventEvidenceInput {
  lifeEventId: string;
  evidenceQuality: RectificationEventEvidenceQuality;
  datePrecision: LifeEventDatePrecision;
  userConfirmed: boolean;
}

export type RectificationEventYearRelationship = 'occurs_in' | 'starts_in' | 'continues_in' | 'ends_in';

export interface RectificationEventSnapshot {
  title: string;
  category: LifeEventCategory;
  customCategory: string | null;
  startDate: string;
  endDate: string | null;
  datePrecision: LifeEventDatePrecision;
  description: string | null;
  impactLevel: 1 | 2 | 3 | 4 | 5;
  source: LifeEventSource;
}

export interface RectificationEventEvidence {
  id: string;
  sessionId: string;
  lifeEventId: string | null;
  deduplicationKey: string;
  snapshot: RectificationEventSnapshot;
  evidenceQuality: RectificationEventEvidenceQuality;
  userConfirmed: boolean;
  scoreEligible: boolean;
  methodologyVersion: string;
  sourceEventUpdatedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface RectificationTopicFact {
  category: LifeEventCategory;
  scoreable: boolean;
  primaryPalaces: PalaceName[];
  secondaryPalaces: PalaceName[];
  decadalMatches: PalaceName[];
  annualFlowMatches: PalaceName[];
  annualKeyPalaceMatches: PalaceName[];
  annualTransformationMatches: Array<{
    palace: PalaceName;
    starName: string;
    type: '禄' | '权' | '科' | '忌';
  }>;
}

export interface RectificationCandidateEventFactSnapshot {
  eventYear: number;
  relationship: RectificationEventYearRelationship;
  annualTransit: AnnualTransitSnapshot;
  topicFact: RectificationTopicFact;
}

export interface RectificationCandidateEventFact {
  id: string;
  sessionEventId: string;
  candidateId: string;
  eventYear: number;
  relationship: RectificationEventYearRelationship;
  candidateChartFingerprint: string;
  transitEngineVersion: string;
  methodologyVersion: string;
  inputFingerprint: string;
  snapshot: RectificationCandidateEventFactSnapshot;
  createdAt: number;
  updatedAt: number;
}

export interface RectificationEventWithFacts extends RectificationEventEvidence {
  facts: RectificationCandidateEventFact[];
}

export interface RectificationEvidenceReadiness {
  totalEvents: number;
  confirmedEligibleEvents: number;
  distinctScoreableCategories: number;
  minimumRequiredEvents: number;
  minimumRequiredCategories: number;
  recommendedEvents: number;
  recommendedCategories: number;
  meetsMinimum: boolean;
  meetsRecommended: boolean;
  warnings: string[];
}

export interface RectificationEventMatrix {
  sessionId: string;
  methodologyVersion: string;
  readiness: RectificationEvidenceReadiness;
  events: RectificationEventWithFacts[];
}

export interface AttachRectificationEventInput {
  lifeEventId?: string;
  event?: LifeEventInput;
  evidenceQuality: RectificationEventEvidenceQuality;
  userConfirmed?: boolean;
}

export interface RectificationTopicMapping {
  category: LifeEventCategory;
  label: string;
  primaryPalaces: PalaceName[];
  secondaryPalaces: PalaceName[];
  scoreable: boolean;
  rationale: string;
}

export interface RectificationRuleDefinition {
  id: string;
  version: 1;
  name: string;
  kind: RectificationRuleKind;
  layer: RectificationRuleLayer;
  outcome: RectificationEvidenceOutcome;
  baseWeight: number;
  priority: number;
  requiredInputs: string[];
  description: string;
  sourceIds: string[];
  enabled: boolean;
}

export interface RectificationScorePolicy {
  status: 'provisional-unvalidated';
  minimumCandidates: number;
  maximumCandidates: number;
  minimumConfirmedEvents: number;
  recommendedConfirmedEvents: number;
  minimumDistinctCategories: number;
  recommendedDistinctCategories: number;
  eventQualityWeights: Record<RectificationEventEvidenceQuality, number>;
  datePrecisionWeights: Record<LifeEventDatePrecision, number>;
  impactMultipliers: Record<1 | 2 | 3 | 4 | 5, number>;
  outcomeScores: Record<RectificationEvidenceOutcome, number>;
  perEventAbsoluteCap: number;
  perCategoryShareCap: number;
  nonDiscriminatingEvidenceWeight: 0;
  displayScale: 100;
  displayLabel: '相对证据指数';
  leaveOneEventOutMinimumEvents: number;
  stableTopCandidateRate: number;
  minimumTopMarginRatio: number;
  principles: string[];
}

export interface RectificationMethodology {
  schemaVersion: 1;
  version: string;
  label: string;
  status: 'provisional';
  chartEngineVersion: string;
  transitEngineVersion: string;
  timePolicy: RectificationTimePolicy;
  scorePolicy: RectificationScorePolicy;
  topicMappings: RectificationTopicMapping[];
  rules: RectificationRuleDefinition[];
  allowedEvidence: string[];
  forbiddenEvidence: string[];
  prohibitedClaims: string[];
  sources: RectificationSourceReference[];
}

export interface RectificationSession {
  id: string;
  sourceConversationId: string | null;
  title: string;
  status: RectificationStatus;
  baseBirthInfo: Omit<BirthInfo, 'hour' | 'unknownTime'>;
  reportedTimeEvidence: RectificationReportedTimeEvidence;
  timeConversion: RectificationTimeConversionSnapshot | null;
  methodologyVersion: string;
  timePolicyVersion: string;
  chartEngineVersion: string;
  transitEngineVersion: string;
  selectedCandidateId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RectificationCandidate {
  id: string;
  sessionId: string;
  slotKey: RectificationTimeSlotKey;
  branchIndex: number;
  engineTimeIndex: number;
  chartDate: string;
  dayOffset: number;
  chartFingerprint: string;
  chartSnapshot: ZiweiChart;
  duplicateOfCandidateId: string | null;
  relativeEvidenceIndex: number | null;
  rank: number | null;
  confidence: RectificationConfidence;
  createdAt: number;
  updatedAt: number;
}

export interface RectificationSessionDetail extends RectificationSession {
  candidates: RectificationCandidate[];
}

export interface RectificationSessionListItem extends RectificationSession {
  candidateCount: number;
}

export interface CreateRectificationSessionInput {
  sourceConversationId?: string | null;
  title?: string;
  baseBirthInfo: Omit<BirthInfo, 'hour' | 'unknownTime'>;
  reportedTimeEvidence?: Partial<RectificationReportedTimeEvidence>;
  candidateSlotKeys?: RectificationTimeSlotKey[];
  preferredUtcOffsetMinutes?: number;
}

export interface RectificationRuleHit {
  id: string;
  sessionId: string;
  candidateId: string;
  lifeEventId: string | null;
  ruleId: string;
  ruleVersion: number;
  outcome: RectificationEvidenceOutcome;
  rawWeight: number;
  adjustedWeight: number;
  discriminating: boolean;
  evidence: Record<string, unknown>;
  methodologyVersion: string;
}

export interface RectificationCandidateEvaluation {
  candidateId: string;
  rank: number;
  rawScore: number;
  relativeEvidenceIndex: number;
  confidence: RectificationConfidence;
  supportCount: number;
  conflictCount: number;
  insufficientCount: number;
  leaveOneEventOutTopRate: number | null;
  ruleHits: RectificationRuleHit[];
}

export interface RectificationEvaluation {
  sessionId: string;
  methodologyVersion: string;
  evaluatedAt: number;
  candidates: RectificationCandidateEvaluation[];
  topMarginRatio: number | null;
  stable: boolean;
  warnings: string[];
  disclaimer: string;
}
