import type { BaziElement } from './types';

export const BAZI_METHOD_REVIEW_VERSION = 'bazi-method-review-v1-separated-premises';
export const METHOD_CONDITION_LABELS = { observed: '线索已见', not_observed: '本项未见', pending: '仍需复核', not_applicable: '本项不适用' } as const;
export const ELEMENT_GENERATES: Record<BaziElement, BaziElement> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
export const ELEMENT_CONTROLS: Record<BaziElement, BaziElement> = { 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' };
export const METHOD_REVIEW_SOURCES = [
  { id: 'use-meaning', label: '《子平真诠评注》论用神', url: 'https://www.mingsage.com/zh/classics/zi-ping-zhen-quan/lun-yong-shen', scope: '区分月令格局用神与扶抑、调候、通关等取用语义；五法归纳见评注层，不冒充沈氏原文篇目。' },
  { id: 'climate-coordinate', label: '《子平真诠评注》论用神配气候得失', url: 'https://www.mingsage.com/zh/classics/zi-ping-zhen-quan/lun-yong-shen-pei-qi-hou-de-shi', scope: '月令与气候互参；同一五行可能承担不同作用，不按方法数量投票。' },
  { id: 'pattern-conditions', label: '《子平真诠评注》论用神成败救应', url: 'https://www.mingsage.com/zh/classics/zi-ping-zhen-quan/lun-yong-shen-cheng-bai-jiu-ying', scope: '复用已保存的逐格支持、风险与救应候选；不自行裁定成格破格。' },
] as const;
