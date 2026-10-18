import type { Element } from './types';
import type { QimenScenarioReview } from './scenario-types';
export const LEGACY_QIMEN_READING_VERSION='qimen-reading-v1-focus-palace-door-star';
export const QIMEN_READING_VERSION='qimen-reading-v2-scenario-role-conditions';
export const QIMEN_FOCUS_TARGETS={none:'暂不指定，先核对盘面',day_stem:'日干落宫参考',hour_stem:'时干落宫参考',day_hour:'日时干宫位对照',opening:'开门参考',wealth:'生门参考',study:'天辅星参考',manual_palace:'自行指定宫位'} as const;
export type QimenFocusTarget=keyof typeof QIMEN_FOCUS_TARGETS;
export type QimenElementRelation='same'|'generates'|'generated_by'|'controls'|'controlled_by';
export type QimenMonthState='旺'|'相'|'休'|'囚'|'死';
export type QimenStarMonthState='旺'|'相'|'死'|'囚'|'废';
export interface QimenFocusItem {key:string;label:string;symbol:string;matchedSymbol:string;palaces:number[];earthOrigin:number|null;earthHost:number|null;hiddenJia:boolean;detail:string}
export interface QimenPattern {id:string;label:string;detail:string;sourceUrl:string;disputed:boolean}
export interface QimenPalaceReview {
  number:number;center:boolean;element:Element;monthState:QimenMonthState;branches:string[];emptyBranches:string[];
  earthStems:Array<{stem:string;origin:number;hosted:boolean}>;
  door:null|{name:string;element:Element;monthState:QimenMonthState;relation:QimenElementRelation;label:string;pressure:boolean;controlled:boolean};
  stars:Array<{name:string;element:Element;monthState:QimenStarMonthState;relation:QimenElementRelation;label:string}>;
  stems:Array<{heavenStem:string;heavenOrigin:number;heavenCarriedFromCenter:boolean;earthStem:string;earthOrigin:number;carriedFromCenter:boolean;sameStem:boolean;fiveCombine:boolean}>;
  patterns:QimenPattern[];
}
export interface QimenReading {
  version:string;scope:string;month:{branch:string;element:Element;ordinaryPolicy:string;starPolicy:string};
  scenario?:QimenScenarioReview;
  focus:{target:QimenFocusTarget;label:string;items:QimenFocusItem[];palaces:number[];status:'unselected'|'located'|'unavailable'};
  comparison:null|{dayPalace:number;hourPalace:number;relation:QimenElementRelation;label:string;detail:string};
  palaces:QimenPalaceReview[];
  structures:{starFuyin:boolean;doorFuyin:boolean;starFanyin:boolean;doorFanyin:boolean;detail:string};
  timing:{status:'needs_focus'|'conditional';conditions:Array<{palace:number;label:string;branches:string[];detail:string}>;note:string};
  boundaries:string[];
}
