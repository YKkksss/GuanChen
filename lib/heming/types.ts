import type { SiHua } from '@/lib/ziwei/types';

export const RELATIONSHIP_TYPES = [
  'romantic',
  'business',
  'parent_child',
  'manager_report',
  'friendship',
  'custom',
] as const;

export type RelationshipType = typeof RELATIONSHIP_TYPES[number];
export type ChartOwner = 'A' | 'B';
export type EvidenceOwner = ChartOwner | 'interaction';
export type PalaceName =
  | '命宫' | '兄弟宫' | '夫妻宫' | '子女宫' | '财帛宫' | '疾厄宫'
  | '迁移宫' | '交友宫' | '官禄宫' | '田宅宫' | '福德宫' | '父母宫';
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
