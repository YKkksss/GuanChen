import type { AnnualTransitSnapshot, MonthlyTransitSnapshot } from '@/lib/transits/types';
export const FORTUNE_TOPICS = {
  career: { label: '事业', palaces: ['官禄宫', '命宫', '迁移宫'] },
  relationship: { label: '感情', palaces: ['夫妻宫', '福德宫', '命宫'] },
  wealth: { label: '财运', palaces: ['财帛宫', '田宅宫', '福德宫'] },
  study: { label: '学习', palaces: ['命宫', '官禄宫', '福德宫'] },
} as const;
export type FortuneTopic = keyof typeof FORTUNE_TOPICS;
export function isFortuneTopic(value: unknown): value is FortuneTopic { return typeof value === 'string' && Object.hasOwn(FORTUNE_TOPICS, value); }
export interface FortunePeriod { key: string; level: 'year' | 'month'; year: number; label: string; startDate: string; endDate: string; fullStartDate: string; fullEndDate: string }
export interface FortuneEvidence { id: string; label: string; details: string }
export interface FortuneStage { period: FortunePeriod; snapshot: AnnualTransitSnapshot | MonthlyTransitSnapshot }
export interface FortuneFacts { topic: FortuneTopic; unknownTime: boolean; a: FortuneStage; b: FortuneStage | null; changes: string[]; evidence: FortuneEvidence[] }
export const FORTUNE_SECTIONS = { background: '本命与大限背景', a_focus: '阶段 A · 主题观察', a_attention: '阶段 A · 条件与提醒', b_focus: '阶段 B · 主题观察', b_attention: '阶段 B · 条件与提醒', comparison: '两个阶段的异同', actions: '行动安排' } as const;
export type FortuneSection = keyof typeof FORTUNE_SECTIONS;
export function sectionKeys(compare: boolean): FortuneSection[] { return compare ? ['background', 'a_focus', 'a_attention', 'b_focus', 'b_attention', 'comparison', 'actions'] : ['background', 'a_focus', 'a_attention', 'actions']; }
export interface FortuneContent { summary: string; sections: Array<{ key: FortuneSection; content: string; evidenceIds: string[] }> }
export interface FortuneVersion { id: string; version: number; status: 'generating' | 'completed' | 'failed'; facts: FortuneFacts; content: FortuneContent | null; provider: string; model: string; createdAt: number; updatedAt: number; errorCode: string | null }
export interface FortuneReport { id: string; conversationId: string; topic: FortuneTopic; periodKey: string; comparisonKey: string; title: string; activeVersionId: string | null; createdAt: number; updatedAt: number }
export interface FortuneDetail { report: FortuneReport; versions: FortuneVersion[] }
export interface FortuneSummary extends FortuneReport { status: FortuneVersion['status']; versionCount: number; summary: string | null }
export interface FortuneOptions { title: string; years: number[]; year: number; periods: FortunePeriod[]; defaultPeriod: string; history: FortuneSummary[] }
