import type { AssignedLine, Element, Kin } from './types';
import type { LiuyaoInfluenceReview } from './influence-types';
export const LEGACY_LIUYAO_READING_VERSION = 'liuyao-reading-v1-focus-month-day-change';
export const LIUYAO_READING_VERSION = 'liuyao-reading-v2-candidate-influence-conditions';
export const LIUYAO_FOCUS_TARGETS = { manual:'自行选择六亲',self:'自占本人（以世爻为用）',parents:'父母长辈（父母）',documents:'文书证件（父母）',siblings:'兄弟同辈（兄弟）',children:'子女晚辈（子孙）',wealth:'求财财物（妻财）',career:'功名职务（官鬼）' } as const;
export type LiuyaoFocusTarget = keyof typeof LIUYAO_FOCUS_TARGETS;
export const LIUYAO_TARGET_KIN: Partial<Record<LiuyaoFocusTarget,Kin>> = {parents:'父母',documents:'父母',siblings:'兄弟',children:'子孙',wealth:'妻财',career:'官鬼'};
export type LiuyaoElementRelation = 'same'|'generates'|'generated_by'|'controls'|'controlled_by';
export interface LiuyaoLineContext {
  branch:string; element:Element; monthState:'旺'|'相'|'休囚'; monthRelation:string; dayRelation:string;
  empty:boolean;monthClash:boolean;dayClash:boolean;monthCombine:boolean;dayCombine:boolean;
  supports:string[];constraints:string[];
}
export interface LiuyaoFocusCandidate extends AssignedLine { hidden:boolean; selected:boolean; context:LiuyaoLineContext;moving:boolean;role:string }
export interface LiuyaoLineReview {
  position:number;context:LiuyaoLineContext;hidden:LiuyaoLineContext|null;
  activation:{status:'none'|'moving_day_clash'|'hidden_movement_candidate'|'day_break_candidate'|'conflicting';label:string;reasons:string[]};
  change:null|{from:string;to:string;relation:LiuyaoElementRelation;label:string;progression:'advance'|'retreat'|'none';progressionDetail:string;clash:boolean;combine:boolean;context:LiuyaoLineContext};
  flyingHidden:null|{label:string;detail:string};
}
export interface LiuyaoRoleReference {position:number;hidden:boolean;branch:string;element:Element;kin:Kin;moving:boolean;role:'用神同类'|'元神'|'忌神'|'仇神'|'其他';detail:string}
export interface LiuyaoReading {
  version:string;scope:string;
  influence?: LiuyaoInfluenceReview;
  focus:{target:LiuyaoFocusTarget;label:string;kind:Kin|'none';status:'unselected'|'multiple'|'selected'|'missing';selected:{position:number;hidden:boolean;method:'self'|'single'|'manual'}|null;candidates:LiuyaoFocusCandidate[]};
  lines:LiuyaoLineReview[];roles:LiuyaoRoleReference[];
  timing:{status:'needs_selection'|'conditional';conditions:Array<{label:string;branches:string[];detail:string}>;note:string};
  boundaries:string[];
}
