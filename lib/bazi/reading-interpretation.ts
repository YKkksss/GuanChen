import type { ChatMessage } from '@/lib/ai/deepseek';
import { findBaziNatalOutputViolations } from './natal-effect-output';
import { findBaziMethodOutputViolations } from './method-review-output';
import { baziMonthCommandAssertionText, findBaziMonthCommandOutputViolations } from './month-command-output';
import { findBaziMonthIntakeOutputViolations } from './month-intake-output';
import { BAZI_MONTH_COMMAND_POLICY, BAZI_MONTH_COMMAND_VERSION } from './month-command-types';
import { BAZI_MONTH_INTAKE_POLICY, BAZI_MONTH_INTAKE_VERSION } from './month-intake-types';
import { BAZI_READING_SECTIONS, type BaziReadingContent, type BaziReadingFacts, type BaziReadingSection } from './reading-types';
export const BAZI_BASE_READING_PROMPT_VERSION = 'bazi-reading-report-v1';
export const BAZI_FINE_READING_PROMPT_VERSION = 'bazi-reading-report-v2-monthly-conditions';
export const BAZI_NATAL_READING_PROMPT_VERSION = 'bazi-reading-report-v3-natal-period-contact';
export const BAZI_METHOD_READING_PROMPT_VERSION = 'bazi-reading-report-v4-method-premises';
export const BAZI_READING_PROMPT_VERSION = 'bazi-reading-report-v5-month-command';
export const BAZI_INTAKE_READING_PROMPT_VERSION = 'bazi-reading-report-v6-month-intake';

export function resolveBaziReadingPromptVersion(facts: BaziReadingFacts): string {
  const review = facts.monthCommandReview, intake = facts.monthIntake;
  const monthCommandSupported = review?.version === BAZI_MONTH_COMMAND_VERSION && review.policy === BAZI_MONTH_COMMAND_POLICY;
  const intakeSupported = intake?.version === BAZI_MONTH_INTAKE_VERSION && intake.policy === BAZI_MONTH_INTAKE_POLICY;
  if (intakeSupported && monthCommandSupported) return BAZI_INTAKE_READING_PROMPT_VERSION;
  if (monthCommandSupported) return BAZI_READING_PROMPT_VERSION;
  if (facts.methodReview) return BAZI_METHOD_READING_PROMPT_VERSION;
  if (facts.natalReview) return BAZI_NATAL_READING_PROMPT_VERSION;
  if (facts.fineReview) return BAZI_FINE_READING_PROMPT_VERSION;
  return BAZI_BASE_READING_PROMPT_VERSION;
}

/** 不支持的入口层只从本次消息与可引用集合撤回；旧报告及调用者快照保留原文。 */
function supportedFacts(facts: BaziReadingFacts): BaziReadingFacts {
  const version = resolveBaziReadingPromptVersion(facts);
  if (version === BAZI_INTAKE_READING_PROMPT_VERSION) return facts;
  const { monthIntake: _unsupportedIntake, ...withoutIntake } = facts;
  const intakeFiltered = { ...withoutIntake, evidence: withoutIntake.evidence.filter(item => !item.id.includes(':month-intake:')) };
  if (version === BAZI_READING_PROMPT_VERSION) return intakeFiltered;
  const { monthCommandReview: _unsupportedMonthCommand, ...previous } = intakeFiltered;
  return { ...previous, evidence: intakeFiltered.evidence.filter(item => !item.id.includes(':month-command:')) };
}

export function buildBaziReadingMessages(facts: BaziReadingFacts): ChatMessage[] {
  const version = resolveBaziReadingPromptVersion(facts);
  facts = supportedFacts(facts);
  const monthCommandScope = version === BAZI_READING_PROMPT_VERSION || version === BAZI_INTAKE_READING_PROMPT_VERSION
    ? '本报告含monthCommandReview人元司令与月令分日复核。只解释保存的version和policy：采用《三命通会》正文三十日固定分日表，每日为86400秒，从实际交节起累计，不按实际月长缩放，也不把末段自动补到下次交节。实际节令月超过三十日的尾段是未覆盖，不推定司令；短月只能保留交节前实际交集。sourceText是原文字，“艮土”“坤土”“已土”“巳土”等未明确具体天干时stem和tenGod为null，不擅改成戊、己或十神。resolved只说明此口径下位置已定位，uncertain_time只列候选；unsupported_clock、inconsistent_chart或uncovered_tail不得补确定司令。月支藏干、字面司令表段、穷通调候月内分支分别保留，不能用本表替换穷通上下半月。表干、同干根、同五行支持及月令格局候选只逐项连接，不以司令单判身强身弱、根气强弱、成格破格、最终或唯一喜用，不扩展到动态岁运或事件。strength节必须至少引用一条strength:month-command:依据，pattern节必须至少引用一条pattern:month-command:依据；未能定位也引用其保存边界，不伪造确定结论。'
    : '本报告没有已支持的人元司令分日层，不能从出生日期、月支或其他资料补算司令，也不能引用已撤回的司令依据。';
  const intakeScope = version === BAZI_INTAKE_READING_PROMPT_VERSION
    ? '本报告含monthIntake月令取用入口复核，来源仅限《子平真诠》用神变化与杂气取用的窄条目。本气入口、他藏未透候选、单透与多透只按实际年、月、时天干位置并列；日主同干只作参照，不计为新增透出；多透、多个入口和会支组数都不排名、不加权、不选唯一用神。含月支的完整三合、三会只记录组合所指向的五行，不指定阴阳天干，不称已经合化、成局、化气或变格；缺字组、六合、月支六冲、天干五合及五行相克只作条件单列，不裁去留、解冲、破局或优先级。未知时辰不得补时柱、补透干，也不得把未见位置判为全盘缺失。pattern节必须至少引用一条pattern:month-intake:依据，并与month-command依据分别保留；不得由入口直接宣告身强身弱、格局成败、唯一喜忌或现实事件。'
    : '本报告没有已支持的月令取用入口层，不能从四柱重新推导本气、透干或会支入口，也不能引用已撤回的入口依据。';
  return [{ role: 'system', content: `你是观辰八字论命总览的中文解读助手。只解释输入已计算四柱、旺衰证据、格局条件、调候参考与分方法取用，不自行排盘或补写现实经历。
本次提示策略为${version}；只使用消息中实际保留的层。${monthCommandScope}${intakeScope}
先讲月令、根气、透干与生扶/泄耗制证据，再讲格局支持、风险和救应候选，再解释调候和方法协调。时柱未知时明确说明缺少时柱并降低判断确定性；未见某元素不等于全盘缺失。不给旺衰分数、成功率或吉凶概率。
生扶/泄耗制标签不是最终身强身弱；条件出现不是成格、破格、合化或救应完成；藏干出现不等于有效、有力、透出或发动。调候按节令月支，一般四时原则不冒充十干十二月精细规则，具体参考只解释实际命中项。输入含120组索引的覆盖统计，不表示120条独立月断：shared_paragraph为合论，period_conditional是否已定位须读取natalReview.period，未定位的保留待核。fineReview列出具体天干、同干藏根、同元素其他藏干、五合与根支相冲；不得把同元素根直接叫本干根，不得把五合说成化气或相冲说成拔根。conditional角色只作为条件支线，不自动并入喜用。特殊格局清单只是入口和反证，entry_observed不等于从格、专旺或化气成立，counterevidence也不等于最终破格。寒暖燥湿不是现实天气。
若有 natalReview，以它定位月内分支与原局近合条件。period.resolved 仅表示明确节气分支定位成功，当前调候入口以 climate 为准；fineReview 是章节参考全集，不能把未适用分支的干混入当前取用。source_ambiguous 不得用公历十五日、中气或其他司令表自动分段。matched/not_matched 只针对逐项条件，近合入口通过不等于实际合绊、合去或化气；隔位重复不是直接争合，日干本身之合不能自动称财官被合去。藏根与受冲同时保留，无冲不等于强根，合冲并见不直接解冲。未知时辰不得把中午试排当准确出生时间，不得扩展本阶段结果到动态岁运。
月令格局用神、扶抑、调候和通关病药不能混为一个喜用五行。候选只是方法入口，谨慎方向不是固定忌神。方法不一致时解释待核条件，不强行排名，不说最终用神、确定喜神、确定忌神。禁止“必定”“注定”“百分百”“一定会”“必然发生”，禁止缺什么补什么、颜色/配饰改运、投资买卖、疾病诊断及命运事件断语。不混入紫微宫位、星曜或四化。
若有 methodReview，以它作为当前分方法复核。patterns 逐一保留全部月令候选，建禄、月劫、阳刃须另查财官食杀，不把来源五行直接作为补偏喜用。支持、风险、救应同时解释，不用救应入口删除风险。扶抑方向仍以最终旺衰和承载待核为前提；不同方法出现同一五行不叠加置信度，调候方向未在扶抑中也不等于冲突或忌神。flow 只是五条五行桥接结构；必须保留“两方对峙且势均”和桥接效力的 pending，不宣告通关成立或病药生效。
每节须引用1至8条真实 evidence.id；strength 至少引 strength:，pattern 至少引 pattern:，climate 至少引 climate:，useful 至少引 useful:。不知道的保留问题与边界。正文不展示内部ID。
只输出JSON：{"summary":"80至180字摘要","sections":[{"key":"strength","content":"旺衰条件解释，150至300字","evidenceIds":["strength:assessment"]},{"key":"pattern","content":"格局条件解释","evidenceIds":["pattern:overview"]},{"key":"climate","content":"调候参考及限制","evidenceIds":["climate:rule"]},{"key":"useful","content":"不同方法的取用方向与条件","evidenceIds":["实际useful依据ID"]},{"key":"action","content":"观察记录、待核问题和行动安排","evidenceIds":["实际ID"]}]}。五节完整且内容不重复；示例ID只是格式说明，仍须服从本次各章节引用要求。` }, { role: 'user', content: JSON.stringify({ methodologyVersion: facts.methodologyVersion, chart: facts.chart, strength: facts.interpretation.strength, patterns: facts.patterns, climate: facts.climate, usefulElements: facts.usefulElements, fineReview: facts.fineReview, natalReview: facts.natalReview, methodReview: facts.methodReview, monthCommandReview: facts.monthCommandReview, monthIntake: facts.monthIntake, reviewQuestions: facts.reviewQuestions, evidence: facts.evidence }) }];
}
export function validateBaziReadingContent(text: string, facts: BaziReadingFacts): BaziReadingContent {
  const version = resolveBaziReadingPromptVersion(facts);
  facts = supportedFacts(facts);
  if (text.length > 36_000) throw new Error('正文过长');
  const data: unknown = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('正文格式错误');
  const raw = data as Record<string, unknown>, allowed = new Set(facts.evidence.map(e => e.id)), seen = new Set<string>(), texts = new Set<string>();
  const check = (value: unknown, min: number, max: number) => {
    if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw new Error('正文不符合当前规则边界');
    const assertionText = baziMonthCommandAssertionText(value);
    if (/必定|注定|百分百|一定会|必然发生|缺什么补什么|最终用神(?:为|是)|确定(?:喜神|忌神)(?:为|是)/.test(assertionText) || findBaziNatalOutputViolations(value).length || findBaziMethodOutputViolations(assertionText).length || findBaziMonthCommandOutputViolations(value).length || findBaziMonthIntakeOutputViolations(value).length) throw new Error('正文不符合当前规则边界');
    return value.trim();
  };
  if (!Array.isArray(raw.sections) || raw.sections.length !== 5) throw new Error('章节不完整');
  const sections = raw.sections.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('章节格式错误');
    const v = value as Record<string, unknown>;
    if (typeof v.key !== 'string' || !Object.hasOwn(BAZI_READING_SECTIONS, v.key) || seen.has(v.key)) throw new Error('章节重复或未知');
    const content = check(v.content, 12, 2200);
    if (texts.has(content)) throw new Error('章节正文重复');
    if (!Array.isArray(v.evidenceIds) || !v.evidenceIds.length || v.evidenceIds.length > 8 || v.evidenceIds.some(id => typeof id !== 'string' || !allowed.has(id))) throw new Error('章节依据无效');
    const refs = [...new Set(v.evidenceIds as string[])];
    if (v.key !== 'action' && !refs.some(id => id.startsWith(`${v.key}:`))) throw new Error('章节与依据方法不匹配');
    if ((version === BAZI_READING_PROMPT_VERSION || version === BAZI_INTAKE_READING_PROMPT_VERSION) && (v.key === 'strength' || v.key === 'pattern') && !refs.some(id => id.startsWith(`${v.key}:month-command:`))) throw new Error('司令复核章节须引用已保存的本方法依据');
    if (version === BAZI_INTAKE_READING_PROMPT_VERSION && v.key === 'pattern' && !refs.some(id => id.startsWith('pattern:month-intake:'))) throw new Error('取用入口章节须引用已保存的入口依据');
    seen.add(v.key); texts.add(content); return { key: v.key as BaziReadingSection, content, evidenceIds: refs };
  });
  return { summary: check(raw.summary, 12, 600), sections: Object.keys(BAZI_READING_SECTIONS).map(key => sections.find(s => s.key === key)!) };
}
