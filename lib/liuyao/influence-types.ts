import type { LiuyaoElementRelation, LiuyaoLineContext, LiuyaoLineReview, LiuyaoRoleReference } from './reading-types';
import type { Element, Kin } from './types';

export const LIUYAO_INFLUENCE_VERSION = 'liuyao-influence-v1-candidate-source-conditions';

/** 节点仅保留本卦明爻和实际伏神；变爻只放在本位节点内。 */
export interface LiuyaoInfluenceNode {
  id: string;
  position: number;
  hidden: boolean;
  branch: string;
  element: Element;
  kin: Kin;
  moving: boolean;
  role: string;
  context: LiuyaoLineContext;
  activation: LiuyaoLineReview['activation'] | null;
  change: LiuyaoLineReview['change'];
  flyingHidden: LiuyaoLineReview['flyingHidden'];
  supportFacts: string[];
  constraintFacts: string[];
  pending: string[];
}

export interface LiuyaoInfluencePath {
  id: string;
  from: string;
  to: string;
  role: LiuyaoRoleReference['role'];
  relation: LiuyaoElementRelation;
  label: string;
  mode: 'moving' | 'static' | 'hidden';
  detail: string;
}

export interface LiuyaoJointAction {
  id: string;
  target: string;
  nodes: string[];
  kind: 'ji_yuan' | 'chou_ji';
  label: string;
  segments: Array<{ from: string; to: string; relation: 'generates' | 'controls'; label: string }>;
  detail: string;
  pending: string[];
}

export interface LiuyaoInfluenceReview {
  version: string;
  scope: string;
  selection: { status: 'unselected' | 'multiple' | 'selected' | 'missing'; selectedId: string | null; note: string };
  nodes: LiuyaoInfluenceNode[];
  candidates: Array<{ nodeId: string; selected: boolean }>;
  paths: LiuyaoInfluencePath[];
  jointActions: LiuyaoJointAction[];
  sources: Array<{ id: string; label: string; url: string; detail: string }>;
  boundaries: string[];
}
