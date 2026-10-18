import type { BaziElement } from './types';
import type { BaziClimateRule, BaziSeason } from './reading-types';
export const BAZI_READING_METHODOLOGY_VERSION = 'bazi-reading-v6-month-intake-review';
export const CLIMATE_SOURCE = 'https://zh.wikisource.org/zh-hans/穷通宝鉴';
export const BAZI_SEASONS: Record<BaziSeason, { label: string; branches: string[] }> = { spring: { label: '春季', branches: ['寅', '卯', '辰'] }, summer: { label: '夏季', branches: ['巳', '午', '未'] }, autumn: { label: '秋季', branches: ['申', '酉', '戌'] }, winter: { label: '冬季', branches: ['亥', '子', '丑'] } };
type Entry = [BaziElement[], BaziElement[], string];
/** 将原典四时五行的一般原则转为复核方向，不包含原文的命运断语，也不是十干十二月精细取用表。 */
const SEASONAL: Record<BaziElement, Record<BaziSeason, Entry>> = {
  木: {
    spring: [['火', '水'], [], '春木需区别初春余寒与春末燥渴，温暖与滋润应结合具体月份及原局分开核对。'],
    summer: [['水'], ['火'], '夏木先核对滋润条件；火的存在只能列为燥热复核入口，不凭数量认定过旺。'],
    autumn: [['水', '火'], [], '秋木需区分初秋余热与深秋转寒，水火分别作为条件入口，不能同时固定取用。'],
    winter: [['火', '土'], ['水'], '冬木观察温暖与培养条件，水的存在须结合根气及全局检查，不能直接定为忌神。'],
  },
  火: {
    spring: [['水'], ['木'], '春火观察水火相济；木生火与木多助炎是两种条件，必须结合生扶证据复核。'],
    summer: [['水'], ['木', '火'], '夏火观察水的制约与滋润入口；木火位置出现不等于已构成过热。'],
    autumn: [['木', '火'], ['水'], '秋火观察木的生扶及同类支持，水的制约是否适当需结合原局承载。'],
    winter: [['木', '火'], ['水'], '冬火优先核对木的生扶与温暖条件，水的作用须结合全局，不能只按寒季机械加水。'],
  },
  土: {
    spring: [['火', '土'], ['木', '水'], '春土观察火的生扶与同类支持；木、水只列待核条件，不凭出现即定为不利。'],
    summer: [['水'], ['火'], '夏土观察滋润入口及火土燥烈条件，是否已燥不能靠五行数量下结论。'],
    autumn: [['火', '土'], ['金', '水'], '秋土关注泄耗与承载的配合，火、土支持和水的滋润需按具体月令再核对。'],
    winter: [['火', '土'], [], '冬土观察温暖与承载条件；寒湿不能由冬月单独定性，仍需检查水火位置。'],
  },
  金: {
    spring: [['火', '土'], ['水'], '春金观察余寒、温暖和生扶；水只提示增寒条件待核，不直接作为忌神。'],
    summer: [['水', '金'], ['土'], '夏金观察滋润与同类支持，土薄扶持与土重埋金的区别须保留人工复核。'],
    autumn: [['水', '火'], ['土', '金'], '秋金观察流通及火的锻炼条件；庚辛有差别，季节层不裁定优先级。'],
    winter: [['火', '土'], ['水'], '冬金观察温养及水土条件；金寒不能直接推成命运结论，庚辛仍需细分。'],
  },
  水: {
    spring: [['火', '土'], ['水'], '春水观察水火相济与堤防条件，不把土或火的出现直接称作最终用神。'],
    summer: [['金', '水'], ['火'], '夏水观察金的生扶与同类支持；火的耗制作用必须结合原局承载。'],
    autumn: [['火', '土'], ['水'], '秋水观察金水流通后的承载和水火配合；土的作用依原局而异。'],
    winter: [['火', '土'], ['水'], '冬水观察温暖与堤防，土过重也可能阻滞，不能把所有土都视为有利。'],
  },
};
export const BAZI_CLIMATE_RULES: BaziClimateRule[] = Object.entries(SEASONAL).flatMap(([element, seasons]) => Object.entries(seasons).map(([season, [elements, attention, rationale]]) => ({ id: `season:${element}:${season}`, label: `${BAZI_SEASONS[season as BaziSeason].label}${element}日主 · 一般原则`, elements, attention, rationale, sourceSection: element === '金' ? '论己土后、论庚金前的金性四时段落' : `论${element}`, scope: 'seasonal_reference' as const })));
/** 按来源粒度记录全部120组；合论与月内条件有独立标识。 */
export { BAZI_MONTHLY_CLIMATE_REFERENCES as BAZI_STEM_MONTH_REFERENCES } from './monthly-climate-rules';
export function seasonForBranch(branch: string): BaziSeason { const entry = Object.entries(BAZI_SEASONS).find(([, v]) => v.branches.includes(branch)); if (!entry) throw new Error('月支不合法'); return entry[0] as BaziSeason; }
