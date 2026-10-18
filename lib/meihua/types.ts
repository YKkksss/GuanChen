export const MEIHUA_METHODS = { numbers:'报数起卦',time:'年月日時起卦',manual:'手动核对卦象',objects:'物数起卦' } as const;
export const MEIHUA_VERSION = 'meihua-v1-single-moving-line';
export const MEIHUA_SOURCE = 'https://zh.wikisource.org/wiki/梅花易數/卷一';
export type Line = 0|1;
export type Element = '金'|'木'|'水'|'火'|'土';
export interface Trigram { number:number;name:string;image:string;element:Element;lines:Line[] }
export type MeihuaInput = { method:keyof typeof MEIHUA_METHODS;mutualPolicy:'middle_lines'|'pure_changed';numbers?:string[];movingRule?:'sum'|'sum_hour';dateTime?:string;upper?:number;lower?:number;movingLine?:number;objectCount?:string;contextDateTime?:string;seasonPolicy?:keyof typeof import('./reading-types').MEIHUA_SEASON_POLICIES;timingTarget?:keyof typeof import('./reading-types').MEIHUA_TIMING_TARGETS;scenario?:import('./scenario-types').MeihuaScenarioKey };
export interface Hexagram { number:number;name:string;fullName:string;upper:Trigram;lower:Trigram;lines:Line[] }
export interface MeihuaEvidence { id:string;label:string;detail:string;sourceUrl:string }
export interface MeihuaResult { version:string;input:MeihuaInput;primary:Hexagram;mutual:Hexagram;changed:Hexagram;movingLine:number;body:{position:'upper'|'lower';trigram:Trigram};use:{position:'upper'|'lower';trigram:Trigram};relations:Array<{id:string;label:string;trigram:Trigram;relationship:string}>;trace:string[];calendar:{lunar:string;yearBranch:string;yearNumber:number;monthNumber:number;dayNumber:number;hourBranch:string;hourNumber:number;leapMonth:boolean}|null;evidence:MeihuaEvidence[];warnings:string[];reading?:import('./reading-types').MeihuaReading }
export interface MeihuaSession { id:string;title:string;question:string;notes:string;result:MeihuaResult;createdAt:number;updatedAt:number }
export interface MeihuaSummary extends Omit<MeihuaSession,'result'> { primaryName:string;changedName:string;method:keyof typeof MEIHUA_METHODS }
export interface MeihuaTurn { id:string;sequence:number;message:string;content:string|null;evidenceIds:string[];status:'generating'|'completed'|'failed'|'canceled';retryOf:string|null;createdAt:number;updatedAt:number }
export interface MeihuaDetail { session:MeihuaSession;turns:MeihuaTurn[];hasOlder:boolean;oldestSequence:number|null }
