import type { BaziElement } from './types';
import type { BaziMonthIntakeMeetingType, BaziMonthIntakeSource } from './month-intake-types';

/**
 * 本阶段只校勘《子平真诠》两条窄条目：论用神变化、论杂气如何取用。
 * 原书章节文字以通行本为准，这里只保存与本层直接相关的节录，不扩展为完整取用裁决。
 */
export const MONTH_INTAKE_SOURCE_TEXTS = {
  usefulGodChange: '用神既主月令矣，然月令所藏不一，而用神有变化。',
  mixedQi: '以其所藏者多，用神不一，故谓之杂气也。',
  mixedQiUse: '须透干会支，取以为用。',
} as const;

const ZIPING_URL = 'https://www.vr-d.com/pdf-file/%E5%91%BD%E7%90%86/%E5%AD%90%E5%B9%B3%E7%9C%9F%E8%AF%A0%E5%8E%9F%E6%9C%AC.pdf';

export const MONTH_INTAKE_SOURCES: BaziMonthIntakeSource[] = [
  {
    id: 'ziping-zhenquan-useful-god-change',
    title: '《子平真诠》·论用神变化（节录）',
    url: ZIPING_URL,
    note: `只取“月令所藏不一、用神随之变化”这一窄条，用于并列本气与他藏入口；不据此裁定孰为最终用神。原句节录：“${MONTH_INTAKE_SOURCE_TEXTS.usefulGodChange}”`,
  },
  {
    id: 'ziping-zhenquan-mixed-qi',
    title: '《子平真诠》·论杂气如何取用（节录）',
    url: ZIPING_URL,
    note: `只取杂气须透干会支方可取用这一窄条，用于把完整三合、三会列入入口；六合、缺字与相反条件单列待核。原句节录：“${MONTH_INTAKE_SOURCE_TEXTS.mixedQi}”“${MONTH_INTAKE_SOURCE_TEXTS.mixedQiUse}”`,
  },
];

/** 月支本气，沿用项目保存的藏干表口径，仅用于识别哪一藏干是本气。 */
export const MONTH_INTAKE_MAIN_QI: Record<string, string> = {
  子: '癸', 丑: '己', 寅: '甲', 卯: '乙', 辰: '戊', 巳: '丙',
  午: '丁', 未: '己', 申: '庚', 酉: '辛', 戌: '戊', 亥: '壬',
};

export interface MonthIntakeGroup {
  id: string;
  type: BaziMonthIntakeMeetingType;
  branches: [string, string, string];
  element: BaziElement;
  label: string;
}

export const MONTH_INTAKE_GROUPS: MonthIntakeGroup[] = [
  { id: 'sanhe-shen-zi-chen', type: 'three_harmony', branches: ['申', '子', '辰'], element: '水', label: '申子辰三合水局' },
  { id: 'sanhe-hai-mao-wei', type: 'three_harmony', branches: ['亥', '卯', '未'], element: '木', label: '亥卯未三合木局' },
  { id: 'sanhe-yin-wu-xu', type: 'three_harmony', branches: ['寅', '午', '戌'], element: '火', label: '寅午戌三合火局' },
  { id: 'sanhe-si-you-chou', type: 'three_harmony', branches: ['巳', '酉', '丑'], element: '金', label: '巳酉丑三合金局' },
  { id: 'sanhui-hai-zi-chou', type: 'three_meeting', branches: ['亥', '子', '丑'], element: '水', label: '亥子丑三会水方' },
  { id: 'sanhui-yin-mao-chen', type: 'three_meeting', branches: ['寅', '卯', '辰'], element: '木', label: '寅卯辰三会木方' },
  { id: 'sanhui-si-wu-wei', type: 'three_meeting', branches: ['巳', '午', '未'], element: '火', label: '巳午未三会火方' },
  { id: 'sanhui-shen-you-xu', type: 'three_meeting', branches: ['申', '酉', '戌'], element: '金', label: '申酉戌三会金方' },
];

export const MONTH_INTAKE_SIX_COMBINES: Array<{ id: string; branches: [string, string] }> = [
  { id: 'liuhe-zi-chou', branches: ['子', '丑'] },
  { id: 'liuhe-yin-hai', branches: ['寅', '亥'] },
  { id: 'liuhe-mao-xu', branches: ['卯', '戌'] },
  { id: 'liuhe-chen-you', branches: ['辰', '酉'] },
  { id: 'liuhe-si-shen', branches: ['巳', '申'] },
  { id: 'liuhe-wu-wei', branches: ['午', '未'] },
];

export const MONTH_INTAKE_CLASHES: Array<{ id: string; branches: [string, string] }> = [
  { id: 'liuchong-zi-wu', branches: ['子', '午'] },
  { id: 'liuchong-chou-wei', branches: ['丑', '未'] },
  { id: 'liuchong-yin-shen', branches: ['寅', '申'] },
  { id: 'liuchong-mao-you', branches: ['卯', '酉'] },
  { id: 'liuchong-chen-xu', branches: ['辰', '戌'] },
  { id: 'liuchong-si-hai', branches: ['巳', '亥'] },
];

/** 天干五合只作条件并列，不裁决合去、合化或解除。 */
export const MONTH_INTAKE_STEM_COMBINES: Array<[string, string]> = [
  ['甲', '己'], ['乙', '庚'], ['丙', '辛'], ['丁', '壬'], ['戊', '癸'],
];

export const MONTH_INTAKE_GENERATES: Record<BaziElement, BaziElement> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
export const MONTH_INTAKE_CONTROLS: Record<BaziElement, BaziElement> = { 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' };

export const SOURCE_QI_LABELS = { main_qi: '本气', secondary_qi: '中气', residual_qi: '余气' } as const;
export const ENTRY_LABELS = { main_qi_entry: '本气入口', transparency_entry: '透干入口', hidden_candidate: '仅藏候选' } as const;
export const TRANSPARENCY_LABELS = { not_transparent: '未透', single_transparent: '单透', multiple_transparent: '多透' } as const;
