import type { BaziElementPosition } from './reading-types';
import type { BaziElement } from './types';
import type { BaziPatternCandidateConditionAudit } from './pattern-condition-types';

export type BaziMethodConditionStatus = 'observed' | 'not_observed' | 'pending' | 'not_applicable';
export interface BaziMethodCondition {
  id: string;
  label: string;
  status: BaziMethodConditionStatus;
  detail: string;
}
export interface BaziMethodPatternPath {
  id: string;
  label: string;
  archetype: BaziPatternCandidateConditionAudit['archetype'];
  sourceStem: string;
  sourceElement: BaziElement;
  meaning: 'month_command_reference' | 'peer_month_separate_selection';
  conditions: BaziMethodCondition[];
  support: BaziMethodCondition[];
  risks: BaziMethodCondition[];
  rescues: BaziMethodCondition[];
  pending: string[];
}
export interface BaziMethodReview {
  version: string;
  unknownTime: boolean;
  strength: { label: string; conditions: BaziMethodCondition[]; counterevidence: string[]; pending: string[] };
  patterns: BaziMethodPatternPath[];
  balancing: { label: string; direction: 'support' | 'drain_control' | 'undetermined'; elements: BaziElement[]; conditions: BaziMethodCondition[]; pending: string[] };
  climate: {
    label: string;
    conditions: BaziMethodCondition[];
    stems: Array<{ stem: string; element: BaziElement; role: string; position: string; observations: string[]; pending: string[] }>;
    pending: string[];
  };
  flow: Array<{ id: string; label: string; opposing: [BaziElement, BaziElement]; bridge: BaziElement; positions: BaziElementPosition[]; conditions: BaziMethodCondition[] }>;
  coordination: Array<{ element: BaziElement; patternReferences: string[]; balancing: boolean; climateStems: string[]; note: string }>;
  sources: Array<{ id: string; label: string; url: string; scope: string }>;
  boundary: string;
}
