import type { MeihuaSymbolEntry } from './imagery-types';

/** 卷一“八卦万物属类”中少量中性候选；不收录病症、身份或确定性断语。 */
export const MEIHUA_SYMBOL_CATALOG: Record<number, MeihuaSymbolEntry> = {
  1: { trigramNumber: 1, nature: ['天'], objects: ['金属', '玉石', '镜子'], forms: ['圆形', '刚硬之物'], sourceId: 'neutral-symbols' },
  2: { trigramNumber: 2, nature: ['泽'], objects: ['有口的器皿', '金属器物'], forms: ['缺损之物'], sourceId: 'neutral-symbols' },
  3: { trigramNumber: 3, nature: ['火', '日', '电光'], objects: ['文书', '炉具'], forms: ['有壳之物', '干燥之物'], sourceId: 'neutral-symbols' },
  4: { trigramNumber: 4, nature: ['雷', '草木'], objects: ['竹', '乐器', '柴木'], forms: [], sourceId: 'neutral-symbols' },
  5: { trigramNumber: 5, nature: ['风', '枝叶'], objects: ['绳索', '帆', '扇'], forms: ['直形之物'], sourceId: 'neutral-symbols' },
  6: { trigramNumber: 6, nature: ['水', '雨', '雪'], objects: ['沟渠', '弓轮'], forms: ['有核之物'], sourceId: 'neutral-symbols' },
  7: { trigramNumber: 7, nature: ['山', '土'], objects: ['门', '路径', '果蔬'], forms: [], sourceId: 'neutral-symbols' },
  8: { trigramNumber: 8, nature: ['地', '土'], objects: ['布帛', '瓦器', '谷物'], forms: ['方形之物'], sourceId: 'neutral-symbols' },
};
