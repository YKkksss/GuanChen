import type { SiHua, Star, ZiweiChart } from '@/lib/ziwei/types';

export const RELATIONSHIP_TYPES = [
  'romantic',
  'business',
  'parent_child',
  'manager_report',
  'friendship',
  'custom',
] as const;

export type RelationshipType = typeof RELATIONSHIP_TYPES[number];

/** 用户在创建合盘时确认的现实关系背景。 */
export interface HemingRelationshipContext {
  ownerARole: string;
  ownerBRole: string;
  customRelationshipLabel: string | null;
  mainConcern: string | null;
  confirmedFacts: Record<string, string>;
}

export function isRelationshipType(value: unknown): value is RelationshipType {
  return typeof value === 'string' && (RELATIONSHIP_TYPES as readonly string[]).includes(value);
}
export type ChartOwner = 'A' | 'B';
export type EvidenceOwner = ChartOwner | 'interaction';
export const PALACE_NAMES = [
  '命宫', '兄弟宫', '夫妻宫', '子女宫', '财帛宫', '疾厄宫',
  '迁移宫', '交友宫', '官禄宫', '田宅宫', '福德宫', '父母宫',
] as const;
export type PalaceName = typeof PALACE_NAMES[number];
export type HemingResultLevel = 'supportive' | 'mixed' | 'challenging' | 'observe' | 'insufficient';
export type HemingConfidence = 'low' | 'medium' | 'high';
export type HemingEvidenceSource =
  | 'chart_a'
  | 'chart_b'
  | 'rule_engine'
  | 'transit_engine'
  | 'user_confirmed';

export interface RelationshipRoleDefinition {
  owner: ChartOwner;
  label: string;
  description: string;
}

export interface HemingDimensionDefinition {
  id: string;
  label: string;
  description: string;
  ownerAPalaces: PalaceName[];
  ownerBPalaces: PalaceName[];
  includeCurrentDaXian: boolean;
  includeAnnualTransit: boolean;
  requiredContextFields: string[];
}

export interface RelationshipDefinition {
  type: RelationshipType;
  label: string;
  description: string;
  roles: [RelationshipRoleDefinition, RelationshipRoleDefinition];
  dimensions: HemingDimensionDefinition[];
  requiredRealityContext: string[];
}

export interface HemingEvidence {
  id: string;
  owner: EvidenceOwner;
  source: HemingEvidenceSource;
  factType: string;
  label: string;
  palace?: PalaceName;
  branch?: string;
  stars?: string[];
  siHua?: Array<{ star: string; type: SiHua }>;
  value?: unknown;
  confidence: HemingConfidence;
  methodologyVersion: string;
  chartEngineVersion: string;
  ruleId?: string;
  ruleVersion?: number;
}

export interface HemingPalaceFact {
  owner: ChartOwner;
  palace: PalaceName;
  branchIndex: number;
  branch: string;
  stars: Array<Pick<Star, 'name' | 'type' | 'siHua' | 'brightness'>>;
  isEmpty: boolean;
}

export interface HemingStageFact {
  asOfDate?: string;
  ageConvention?: string;
  period?: { startDate: string; endDate: string } | null;
  owner: ChartOwner;
  palace: PalaceName;
  branchIndex: number;
  branch: string;
  startAge: number;
  endAge: number;
}

export interface HemingChartFacts {
  owner: ChartOwner;
  birthTimeKnown: boolean;
  palaces: Record<PalaceName, HemingPalaceFact>;
  currentStage: HemingStageFact | null;
}

export interface HemingFactBundle {
  A: HemingChartFacts;
  B: HemingChartFacts;
}

export interface HemingPalaceRef {
  owner: ChartOwner;
  palace: PalaceName;
}

export type HemingRuleCondition =
  | {
      kind: 'star_overlap';
      left: HemingPalaceRef;
      right: HemingPalaceRef;
      starTypes: Array<'major' | 'minor' | 'lucky' | 'sha'>;
      minCount: number;
    }
  | {
      kind: 'star_category_count';
      target: HemingPalaceRef;
      category: 'major' | 'lucky' | 'sha';
      operator: 'gte' | 'lte' | 'eq';
      value: number;
    }
  | {
      kind: 'natal_sihua_present';
      target: HemingPalaceRef;
      siHua: SiHua;
    }
  | {
      kind: 'palace_empty';
      target: HemingPalaceRef;
      expected: boolean;
    }
  | {
      kind: 'birth_time_known';
      owner: ChartOwner;
      expected: boolean;
    }
  | {
      kind: 'stage_focus_in';
      owner: ChartOwner;
      palaces: PalaceName[];
    }
  | {
      kind: 'confirmed_context_present';
      field: string;
    };

export interface HemingRuleSource {
  basis: 'project_methodology' | 'traditional_interpretation' | 'product_safety';
  references: string[];
  note?: string;
}

export interface HemingRuleDefinition {
  id: string;
  version: 1;
  name: string;
  relationshipTypes: RelationshipType[];
  dimensionId: string;
  priority: number;
  confidence: HemingConfidence;
  effect: HemingResultLevel;
  conditions: HemingRuleCondition[];
  evidenceOwners: EvidenceOwner[];
  conclusionTemplate: string;
  adviceTemplate: string;
  source: HemingRuleSource;
  conflictsWith: string[];
  enabled: boolean;
}

export type HemingResultPhase = 'natal' | 'stage' | 'safety';

export interface HemingRuleResult {
  ruleId: string;
  ruleVersion: number;
  ruleName: string;
  dimensionId: string;
  phase: HemingResultPhase;
  level: HemingResultLevel;
  configuredConfidence: HemingConfidence;
  confidence: HemingConfidence;
  priority: number;
  evidenceIds: string[];
  degradedByRuleIds: string[];
  conclusion: string;
  advice: string;
  source: HemingRuleSource;
}

export interface HemingSuppressedRule {
  ruleId: string;
  suppressedByRuleId: string;
  reason: 'conflict_priority';
}

export interface HemingDimensionResult {
  dimensionId: string;
  label: string;
  description: string;
  requiredContextFields: string[];
  missingContextFields: string[];
  baselineResults: HemingRuleResult[];
  stageResults: HemingRuleResult[];
}

export interface HemingEvaluationInput {
  chartA: ZiweiChart;
  chartB: ZiweiChart;
  relationshipType: RelationshipType;
  relationshipContext?: HemingRelationshipContext | null;
  chartEngineVersion?: string;
}

export interface HemingEvaluationResult {
  observation?: {
    asOfDate: string;
    timeZone: string;
    ageConvention: string;
    ages: { A: number; B: number };
  };
  methodologyVersion: string;
  chartEngineVersion: string;
  relationshipType: RelationshipType;
  roles: { A: string; B: string };
  facts: HemingFactBundle;
  evidence: HemingEvidence[];
  dimensions: HemingDimensionResult[];
  matchedRules: HemingRuleResult[];
  suppressedRules: HemingSuppressedRule[];
  warnings: string[];
}

export interface HemingSchoolPolicy {
  id: string;
  version: 1;
  label: string;
  allowedFacts: string[];
  forbiddenFacts: string[];
  principles: string[];
}

export interface HemingMethodology {
  version: string;
  schoolPolicy: HemingSchoolPolicy;
  relationships: RelationshipDefinition[];
  rules: HemingRuleDefinition[];
  resultLevels: Record<HemingResultLevel, { label: string; description: string }>;
  prohibitedPhrases: string[];
}
