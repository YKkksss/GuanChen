import type { Trigram } from './types';
import type { MeihuaSeasonState } from './reading-types';
import type { MeihuaImageryNodeKey } from './imagery-types';

export const MEIHUA_SCENARIOS = { none: '未指定', planning: '求谋', wealth: '求财', travel: '出行' } as const;
export const MEIHUA_SCENARIO_VERSION = 'meihua-scenario-v1-explicit-body-use';
export type MeihuaScenarioKey = keyof typeof MEIHUA_SCENARIOS;
export type MeihuaRelationship = '体克用' | '用克体' | '用生体' | '体生用' | '比和';
export interface MeihuaScenarioRole {
  nodeKey: MeihuaImageryNodeKey;
  label: string;
  role: string;
  trigram: Trigram;
  sourceBoard: 'primary' | 'changed';
  sourceLinePositions: number[];
  seasonState: MeihuaSeasonState | null;
  imageryEvidenceId: string;
  evidenceId: string;
}
export interface MeihuaScenarioCondition {
  nodeKey: Exclude<MeihuaImageryNodeKey, 'body'>;
  label: string;
  body: Trigram;
  counterpart: Trigram;
  relationship: MeihuaRelationship;
  ruleScope: 'selected_scenario_primary' | 'shared_body_use_reference';
  focus: string;
  observation: string;
  pending: string[];
  bodySeasonState: MeihuaSeasonState | null;
  seasonState: MeihuaSeasonState | null;
  sourceId: string;
  imageryEvidenceId: string;
  evidenceId: string;
}
export interface MeihuaScenario {
  version: string;
  key: MeihuaScenarioKey;
  label: string;
  status: 'selected' | 'unspecified';
  roles: MeihuaScenarioRole[];
  primaryCondition: MeihuaScenarioCondition | null;
  supplements: MeihuaScenarioCondition[];
  checks: string[];
  sources: Array<{ id: string; title: string; url: string; note: string }>;
  boundaries: string[];
}
