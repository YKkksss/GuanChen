import type { Element, MeihuaEvidence, MeihuaTurn } from '@/lib/meihua/types';
import type { QimenFocusTarget, QimenReading } from './reading-types';
import type { QimenScenarioKey } from './scenario-types';
export type { Element };
export const QIMEN_VERSION = 'qimen-v1-hour-turning-chaibu-kun';
export const QIMEN_METHODS = { chaibu:'按时间拆补定局', manual:'手动局数核对' } as const;
export type Dun = 'yang' | 'yin';
export type QimenInput = { method:keyof typeof QIMEN_METHODS;dateTime:string;lateZiPolicy:'midnight'|'zi_start';manualDun?:Dun;manualJu?:number;focusTarget?:QimenFocusTarget;focusPalace?:number;scenario?:QimenScenarioKey };
export interface QimenPalace {
  number:number;name:string;direction:string;element:Element;earthStem:string;heavenStems:string[];stars:string[];door:string|null;god:string|null;
  starSource:number|null;doorSource:number|null;emptyBranches:string[];markers:string[];
}
export interface QimenBoard {
  palaces:QimenPalace[];
  chief:{xun:string;hiddenStem:string;origin:number;originHost:number;star:string;door:string;starPalace:number;doorPalace:number;doorRawPalace:number;timeStemRawPalace:number};
  starSteps:number;doorSteps:number;hourOffset:number;emptyBranches:string[];trace:string[];
}
export interface QimenResult extends QimenBoard {
  version:string;input:QimenInput;
  ju:{label:string;dun:Dun;number:number;method:keyof typeof QIMEN_METHODS;yuan:'上元'|'中元'|'下元';fuTou:string;term:string;termAt:string;automaticDun:Dun;automaticNumber:number};
  calendar:{lunar:string;year:string;month:string;day:string;hour:string};evidence:MeihuaEvidence[];warnings:string[];
  reading?:QimenReading;
}
export interface QimenSession { id:string;title:string;question:string;notes:string;result:QimenResult;createdAt:number;updatedAt:number }
export interface QimenSummary extends Omit<QimenSession,'result'> { label:string;dateTime:string;method:QimenInput['method'];chiefStar:string;chiefDoor:string }
export type QimenTurn = MeihuaTurn;
export interface QimenDetail {session:QimenSession;turns:QimenTurn[];hasOlder:boolean;oldestSequence:number|null}
