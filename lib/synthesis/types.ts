import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import type { BaziCalculationInput, BaziCalculationResult } from '@/lib/bazi/types';
import type { BaziReadingFacts } from '@/lib/bazi/reading-types';
export const SYNTHESIS_TOPICS = { overview: { label: '综合', palaces: ['命宫', '福德宫', '迁移宫'], roles: ['比肩', '劫财', '正印', '偏印', '食神', '伤官', '正财', '偏财', '正官', '七杀'] }, career: { label: '事业', palaces: ['官禄宫', '命宫', '迁移宫'], roles: ['正官', '七杀', '正印', '偏印', '食神', '伤官'] }, relationship: { label: '感情', palaces: ['夫妻宫', '福德宫', '命宫'], roles: ['正财', '偏财', '正官', '七杀', '比肩', '劫财'] }, wealth: { label: '财运', palaces: ['财帛宫', '田宅宫', '福德宫'], roles: ['正财', '偏财', '食神', '伤官', '比肩', '劫财'] }, study: { label: '学习', palaces: ['命宫', '官禄宫', '福德宫'], roles: ['正印', '偏印', '食神', '伤官'] } } as const;
export type SynthesisTopic = keyof typeof SYNTHESIS_TOPICS;
export function isSynthesisTopic(value: unknown): value is SynthesisTopic { return typeof value === 'string' && Object.hasOwn(SYNTHESIS_TOPICS, value); }
export const SYNTHESIS_POLICY_VERSION = 'ziwei-bazi-synthesis-v1-fixed-utc8';
export interface SynthesisInput extends BaziCalculationInput { displayName: string; sourceConversationId?: string }
export interface SynthesisPolicy {
  version: string; timezoneLabel: string; effectiveDate: string; effectiveTime: string;
  ziweiDate: string; ziweiHour: number; ziweiTimeLabel: string; lateZiRollover: boolean;
  timeStandard: BaziCalculationResult['input']['timeStandard']; unknownTime: boolean; warnings: string[];
}
export interface SynthesisCalculated { input: SynthesisInput; ziweiBirth: BirthInfo; ziwei: ZiweiChart; bazi: BaziCalculationResult; policy: SynthesisPolicy }
export interface SynthesisSession { id: string; title: string; input: SynthesisInput; policy: SynthesisPolicy; conversationId: string; baziChartId: string; sourceConversationId: string | null; createdAt: number; updatedAt: number }
export interface SynthesisEvidence { id: string; label: string; details: string; system: 'ziwei' | 'bazi' | 'shared'; sourceUrl?: string }
export interface SynthesisFacts { topic: SynthesisTopic; policy: SynthesisPolicy; ziwei: ZiweiChart; bazi: BaziReadingFacts; evidence: SynthesisEvidence[]; dynamic?: import('./dynamic-types').SynthesisDynamicStage }
export const SYNTHESIS_SECTIONS = { ziwei: '紫微视角', bazi: '八字视角', common: '共同观察', differences: '不同观点与待核条件', action: '行动与复核建议' } as const;
export type SynthesisSection = keyof typeof SYNTHESIS_SECTIONS;
export interface SynthesisContent { summary: string; sections: Array<{ key: SynthesisSection; content: string; evidenceIds: string[] }> }
export interface SynthesisVersion { id: string; topic: SynthesisTopic; version: number; status: 'generating' | 'completed' | 'failed'; factsFingerprint: string; facts: SynthesisFacts; content: SynthesisContent | null; provider: string; model: string; errorCode: string | null; createdAt: number; updatedAt: number }
export interface SynthesisDetail { session: SynthesisSession; facts: SynthesisFacts; versions: SynthesisVersion[]; activeVersionId: string | null }
