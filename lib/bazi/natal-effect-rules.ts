import type { BaziElement } from './types';
import type { BaziNatalPeriodReview, NatalCombinationStatus } from './natal-effect-types';

export const BAZI_NATAL_EFFECT_VERSION = 'bazi-natal-effect-v1-period-contact-review';
export const NATAL_CONDITION_LABELS = { matched: '本项条件满足', not_matched: '本项条件不满足', pending: '仍待复核' } as const;
export const NATAL_COMBINATION_LABELS: Record<NatalCombinationStatus, string> = {
  adjacent_clear: '近合入口通过', adjacent_unknown: '近邻已见，缺时待核', adjacent_competing: '近邻争合待核',
  remote_restricted: '年时远隔受限', control_between: '克隔条件待核', separated_pending: '隔位合意待核',
};
export const NATAL_PERIOD_LABELS: Record<BaziNatalPeriodReview['status'], string> = {
  not_applicable: '本组合无月内分支', resolved: '节气分支已定位', source_ambiguous: '半月口径待核',
  uncertain_time: '交界日缺时待核', unsupported_clock: '时间口径待校准', inconsistent_month: '月支与时间待核',
};
export const NATAL_EFFECT_SOURCES = [
  { id: 'period', label: '《穷通宝鉴》乙木、壬水与癸水分月段落', url: 'https://zh.wikisource.org/w/index.php?title=穷通宝鉴&oldid=2294674', scope: '仅采用月内取用的条件讨论；明确秋分、谷雨与未明确分界的上下半月分开处理。' },
  { id: 'contact', label: '《子平真诠》论十干合而不合', url: 'https://www.mingsage.com/zh/classics/zi-ping-zhen-quan/lun-shi-gan-he-er-bu-he', scope: '核对该页古籍原句中的隔位、克隔、本身之合和隔位不争；不采用现代解注或人物断语。' },
  { id: 'root', label: '《子平真诠》论十干得时不旺失时不弱', url: 'https://www.mingsage.com/zh/classics/zi-ping-zhen-quan/lun-shi-gan-de-shi-bu-wang', scope: '通根须核实际藏干，不能仅凭月份或十二长生名目断根气有效。' },
  { id: 'clash', label: '《子平真诠》论刑冲会合解法', url: 'https://www.mingsage.com/zh/classics/zi-ping-zhen-quan/lun-xing-chong-hui-he-jie-fa', scope: '记录六冲与六合、完整三合的并见条件；不将单一解法推广为全局自动解冲。' },
] as const;
export const NATAL_STEM_ELEMENT: Record<string, BaziElement> = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
export const NATAL_STEM_PARTNER: Record<string, string> = { 甲: '己', 己: '甲', 乙: '庚', 庚: '乙', 丙: '辛', 辛: '丙', 丁: '壬', 壬: '丁', 戊: '癸', 癸: '戊' };
export const NATAL_CONTROLS: Record<BaziElement, BaziElement> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
export const NATAL_BRANCH_CLASH: Record<string, string> = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };
export const NATAL_BRANCH_PARTNER: Record<string, string> = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' };
export const NATAL_TRIADS = [['申', '子', '辰'], ['亥', '卯', '未'], ['寅', '午', '戌'], ['巳', '酉', '丑']];

type PeriodBranch = Omit<BaziNatalPeriodReview['branches'][number], 'status'>;
export const NATAL_PERIOD_RULES: Record<string, { term: '秋分' | '谷雨' | null; branches: [PeriodBranch, PeriodBranch] }> = {
  '乙:酉': { term: '秋分', branches: [
    { id: 'before', label: '白露后、秋分前', primary: ['癸'], support: [], detail: '本段先核癸的滋润入口；不把后一段丙为先的次序提前套用。' },
    { id: 'after', label: '秋分起、寒露前', primary: ['丙'], support: ['癸'], detail: '本段先核丙，再核癸的配合；只是章节参考次序，不是最终喜用。' },
  ] },
  '癸:辰': { term: '谷雨', branches: [
    { id: 'before', label: '清明后、谷雨前', primary: ['丙'], support: [], detail: '本段核丙；辛甲属于后一段酌用参考，不能不分时段一并取用。' },
    { id: 'after', label: '谷雨起、立夏前', primary: ['丙'], support: ['辛', '甲'], detail: '本段仍核丙，辛甲仅作酌用配合，还需原局结构复核。' },
  ] },
  '乙:午': { term: null, branches: [
    { id: 'before', label: '原文上半月', primary: ['癸'], support: [], detail: '保留上半月癸的参考；原文未给出本项目可直接采用的秒级分界。' },
    { id: 'after', label: '原文下半月', primary: ['癸', '丙'], support: [], detail: '保留下半月丙癸并用及金水条件；不擅自用夏至或公历十五日代替分界。' },
  ] },
  '壬:丑': { term: null, branches: [
    { id: 'before', label: '原文上半月', primary: ['丙'], support: [], detail: '保留本段癸辛主事的原文条件，不据此自动判日主旺。' },
    { id: 'after', label: '原文下半月', primary: ['丙'], support: ['甲'], detail: '保留本段己土主事、甲作配合的条件，不把其他司令表静默接入本段。' },
  ] },
  '癸:未': { term: null, branches: [
    { id: 'before', label: '原文上半月', primary: ['庚', '辛'], support: ['壬', '癸'], detail: '本段金与比劫配合分开核对；癸日主本身不能重复当作额外癸比助。' },
    { id: 'after', label: '原文下半月', primary: ['庚', '辛'], support: [], detail: '本段保留金及丁的条件，不能仅凭下半月标签判金已有效。' },
  ] },
};
