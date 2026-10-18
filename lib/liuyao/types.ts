import type { Element, Hexagram, Line, MeihuaEvidence, MeihuaTurn } from '@/lib/meihua/types';
import type { LiuyaoFocusTarget, LiuyaoReading } from './reading-types';
export type { Element, Hexagram, Line };
export const LIUYAO_VERSION = 'liuyao-v1-jingfang-najia';
export const LIUYAO_METHODS = { lines: '手动录入六爻', coins: '三钱模拟投掷' } as const;
export const KINDS = ['父母', '兄弟', '子孙', '妻财', '官鬼'] as const;
export type Kin = typeof KINDS[number];
export type LineValue = 6 | 7 | 8 | 9;
export const LINE_LABELS: Record<LineValue, string> = { 6: '6 · 老阴（动）', 7: '7 · 少阳（静）', 8: '8 · 少阴（静）', 9: '9 · 老阳（动）' };
export type LiuyaoInput = {
  method: keyof typeof LIUYAO_METHODS; dateTime: string; lateZiPolicy: 'midnight' | 'zi_start';
  focusKind: Kin | 'none'; lineValues?: LineValue[]; coins?: Array<Array<0 | 1>>;
  focusTarget?: LiuyaoFocusTarget; focusPosition?: number;
};
export interface Palace { trigram: number; name: string; element: Element; stage: string; shi: number; ying: number }
export interface AssignedLine { position: number; stem: string; branch: string; element: Element; kin: Kin }
export interface LiuyaoLine extends AssignedLine {
  value: LineValue; yang: boolean; moving: boolean; spirit: string; role: '世' | '应' | '';
  changed: AssignedLine; hidden: AssignedLine | null; tags: string[]; changedTags: string[];
}
export interface LiuyaoResult {
  version: string; input: LiuyaoInput; primary: Hexagram; changed: Hexagram; palace: Palace; changedPalace: Palace;
  movingLines: number[]; lines: LiuyaoLine[]; missingKinds: Kin[];
  calendar: { lunar: string; year: string; month: string; monthBranch: string; day: string; dayStem: string; dayBranch: string; xun: string; emptyBranches: string[] };
  focus: { kind: Kin | 'none'; visible: number[]; hidden: number[] };
  trace: string[]; evidence: MeihuaEvidence[]; warnings: string[];
  reading?: LiuyaoReading;
}
export interface LiuyaoSession { id: string; title: string; question: string; notes: string; result: LiuyaoResult; createdAt: number; updatedAt: number }
export interface LiuyaoSummary extends Omit<LiuyaoSession, 'result'> { primaryName: string; changedName: string; method: LiuyaoInput['method'] }
export type LiuyaoTurn = MeihuaTurn;
export interface LiuyaoDetail { session: LiuyaoSession; turns: LiuyaoTurn[]; hasOlder: boolean; oldestSequence: number | null }
