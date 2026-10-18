import type { BaziElement } from './types';

export const MONTH_COMMAND_SOURCES = [
  { id: 'sanming-main', title: '《三命通会》卷二·论人元司事主段', url: 'https://zh.wikisource.org/wiki/三命通會/卷二#論人元司事', note: '采用此段十二月各三十日的原文次序。艮土、坤土及已土保留原字，不擅改为具体天干；辰壬、未甲、戌丙、丑庚不替换成常用藏干表。' },
  { id: 'sanming-siku-comparison', title: '《三命通会》四库本·论人元司事及异说', url: 'https://zh.wikisource.org/wiki/三命通會_(四庫全書本)/卷02#論人元司事', note: '同章另列玉井异表，并保留醉醒子对机械限日的不同意见。本版不混用异表，不宣称主段分日为唯一或已证实的断法。已土在四库转录中作巳土，具体天干仍待核。' },
];
export interface MonthCommandRuleEntry { sourceText: string; stem: string | null; element: BaziElement; days: number; note: string }
const entry = (sourceText: string, stem: string | null, element: BaziElement, days: number): MonthCommandRuleEntry => ({ sourceText, stem, element, days, note: stem ? '按主段原字建立独立司事对象；是否存在于已保存命盘须另查。' : '原文未明确为可直接采用的天干，保留原字；不指定十神，不造透干、藏干或格局连接。' });
/** 主段原文表；不以现代常用藏干表校改司事干，也不混入后列玉井表。 */
export const MONTH_COMMAND_TABLE: Record<string, MonthCommandRuleEntry[]> = {
  寅: [entry('艮土', null, '土', 5), entry('丙火', '丙', '火', 5), entry('甲木', '甲', '木', 20)],
  卯: [entry('甲木', '甲', '木', 7), entry('乙木', '乙', '木', 23)],
  辰: [entry('乙木', '乙', '木', 7), entry('壬水', '壬', '水', 5), entry('戊土', '戊', '土', 18)],
  巳: [entry('戊土', '戊', '土', 7), entry('庚金', '庚', '金', 5), entry('丙火', '丙', '火', 18)],
  午: [entry('丙火', '丙', '火', 7), entry('丁火', '丁', '火', 23)],
  未: [entry('丁火', '丁', '火', 7), entry('甲木', '甲', '木', 5), entry('已土', null, '土', 18)],
  申: [entry('坤土', null, '土', 5), entry('壬水', '壬', '水', 5), entry('庚金', '庚', '金', 20)],
  酉: [entry('庚金', '庚', '金', 7), entry('辛金', '辛', '金', 23)],
  戌: [entry('辛金', '辛', '金', 7), entry('丙火', '丙', '火', 5), entry('戊土', '戊', '土', 18)],
  亥: [entry('戊土', '戊', '土', 5), entry('甲木', '甲', '木', 5), entry('壬水', '壬', '水', 20)],
  子: [entry('壬水', '壬', '水', 7), entry('癸水', '癸', '水', 23)],
  丑: [entry('癸水', '癸', '水', 7), entry('庚金', '庚', '金', 5), entry('已土', null, '土', 18)],
};
export const MONTH_COMMAND_TERMS = ['小寒', '立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪'] as const;
export const MONTH_COMMAND_BRANCHES = ['丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子'] as const;
