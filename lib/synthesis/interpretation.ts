import type { ChatMessage } from '@/lib/ai/deepseek';
import { SYNTHESIS_SECTIONS, SYNTHESIS_TOPICS, type SynthesisContent, type SynthesisFacts, type SynthesisSection } from './types';
import { SYNTHESIS_DYNAMIC_REVIEW_VERSION } from './dynamic-review-types';
export const SYNTHESIS_PROMPT_VERSION = 'ziwei-bazi-synthesis-report-v1';
export const LEGACY_SYNTHESIS_DYNAMIC_PROMPT_VERSION = 'ziwei-bazi-synthesis-dynamic-report-v1';
export const SYNTHESIS_DYNAMIC_PROMPT_VERSION = 'ziwei-bazi-synthesis-dynamic-report-v2-topic-cross-layer';
export function resolveSynthesisPromptVersion(facts: SynthesisFacts): string {
  return facts.dynamic ? facts.dynamic.review?.version === SYNTHESIS_DYNAMIC_REVIEW_VERSION ? SYNTHESIS_DYNAMIC_PROMPT_VERSION : LEGACY_SYNTHESIS_DYNAMIC_PROMPT_VERSION : SYNTHESIS_PROMPT_VERSION;
}
export function buildSynthesisMessages(facts: SynthesisFacts): ChatMessage[] {
  const scope = facts.dynamic ? `本记录含已计算的动态阶段，只按 dynamic.selection 的同一北京时间观察点，对照紫微大限、流年${facts.dynamic.selection.level === 'month' ? '与流月' : ''}和八字大运、流年${facts.dynamic.selection.level === 'month' ? '与节令月' : ''}；本命作为背景。紫微农历年月与八字立春年、十二节月分界不同，不能把一个观察点概括为整年整月的唯一状态，不能按相同干支强行认定同一阶段。只用已提供的阶段事实，不补算其他层级或择日、事件。` : '分析范围仅为本命原局，不能补算大运流年、择日或具体事件。';
  const dynamicRules = facts.dynamic ? `动态专用边界：紫微童限不是正式大限；八字首运之前不是已进入第一运，unavailable必须保留撤回原因，不能补造当前大运；超过已排八步不循环。出生时辰未知时，大运精确归属撤回，紫微子时试排不升级确定性。八字天干十神和支中藏干均相对本命日主，不用流年日主替换；十神与干支位置不能直接认定喜忌、强弱、成败或现实事件。历法与交运边界的时刻为固定UTC+08:00，太阳时出生不二次校正观察时刻。紫微星曜四化不替换成十神，两套体系不构成独立事实互证。紫微节至少引用一条 ziwei:dynamic:，八字节至少一条 bazi:dynamic:，共同、差异及行动三节各须同时引用两侧当前阶段依据，本命依据不能代替动态依据。` : '';
  const reviewRules = resolveSynthesisPromptVersion(facts) === SYNTHESIS_DYNAMIC_PROMPT_VERSION ? `本记录带 dynamic.review 主题复核。逐侧使用保存的复核事实：紫微区分 natal_topic 本命主题坐标与 dynamic_topic 阶段主题坐标，direct/opposite/trine仅是本宫/对宫/三方位置；多条命中不得计票、计强弱或称独立证明，未命中不是相反结论。只含已排年、月四化，不补大限四化、飞化链、流日流时。八字只按所列 nodes 和 relations 解释跨层结构，不把合关系宣告合化、不把同类生克数量定强弱，不把未列本命内部关系说成无关系；topicRoles 是主题索引，表干与藏干分别解释，不替代喜忌或效力。status=birth_time_unconfirmed 时个人作用适用撤回，历法与试排不能宣称已对本人适用；partial_unknown_time保留缺时限制。紫微章节须引用 ziwei:dynamic:review:，八字章节须引用 bazi:dynamic:review:，其余三节各须同时引用这两侧复核依据；只能引用本次事实已有ID，不能以旧动态定位依据代替复核。不同观点应保留 sideBySide 的时间分界、阶段覆盖、出生资料及待核差异，不生成跨体系作用边、不强配同一人物事件。` : '';
  return [{ role: 'system', content: `你是观辰紫微与八字合参的中文解读助手。当前主题：${SYNTHESIS_TOPICS[facts.topic].label}。${scope}
${dynamicRules}
${reviewRules}
先独立解释紫微宫位星曜、四化及三方四正；再独立解释八字月令、根气、十神角色、格局条件、调候及分方法取用。紫微的五行局不能等同八字日主、喜用五行，星曜不能替换成十神。两套规则的年/月分界和时间粒度不同，遵守输入 policy；不改写任一命盘来强行一致。
共同观察只能是两套传统解释在同主题下的观察方向相近，不是独立事实互证或统计证明。可以没有足够共通依据，须明确说明；不同观点要讲各自条件或侧重点，不强行判谁正确，也不把未命中条件编造为相反结论。
时辰未知时：紫微为子时试排，八字缺少时柱，其他柱也有边界不确定性，降低两侧判断。八字的生扶标签不是最终身强身弱，格局候选不是成格，位置不等于效力，调候一般原则不是完整精细取用表。不得宣告最终用神、固定喜忌、必然吉凶、现实经历或百分比。
禁止必定、注定、百分百、必然发生、一定会等绝对表述。财运只讨论资源观察，不提供投资买卖、借贷或改运指令；关系不按性别机械指定伴侣身份；行动应为现实信息核对与可执行的观察安排。
只输出 JSON：{"summary":"80至180字主题摘要","sections":[{"key":"ziwei","content":"紫微独立观察，150至300字","evidenceIds":["实际ziwei:依据ID"]},{"key":"bazi","content":"八字独立观察","evidenceIds":["实际bazi:依据ID"]},{"key":"common","content":"共同观察及是否依据足够","evidenceIds":["实际ziwei:ID","实际bazi:ID"]},{"key":"differences","content":"不同侧重点与待核条件","evidenceIds":["实际ziwei:ID","实际bazi:ID"]},{"key":"action","content":"行动与复核建议","evidenceIds":["实际ziwei:ID","实际bazi:ID"]}]}。
五节完整且正文不重复，每节1至8个实际 evidence.id。紫微节必须有 ziwei: 且禁止 bazi:，八字节相反；共同、差异及行动三节必须同时引用两侧。正文不输出内部ID。` }, { role: 'user', content: JSON.stringify({ topic: facts.topic, policy: facts.policy, ziwei: { birthInfo: facts.ziwei.birthInfo, lunarInfo: facts.ziwei.lunarInfo, mingGongBranch: facts.ziwei.mingGongBranch, shenGongBranch: facts.ziwei.shenGongBranch, wuxingJuName: facts.ziwei.wuxingJuName, palaces: facts.ziwei.palaces.map(({ isCurrentDaXian: _current, ...p }) => p) }, bazi: { chart: facts.bazi.chart, interpretation: facts.bazi.interpretation, patterns: facts.bazi.patterns, climate: facts.bazi.climate, usefulElements: facts.bazi.usefulElements }, ...(facts.dynamic ? { dynamic: facts.dynamic } : {}), evidence: facts.evidence }) }];
}
export function validateSynthesisContent(text: string, facts: SynthesisFacts): SynthesisContent {
  if (text.length > 36_000) throw new Error('合参内容过长');
  const data: unknown = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('合参格式错误');
  const raw = data as Record<string, unknown>, allowed = new Set(facts.evidence.map(e => e.id)), seen = new Set<string>(), texts = new Set<string>();
  const check = (v: unknown, min: number, max: number) => { if (typeof v !== 'string' || v.trim().length < min || v.length > max || /必定|注定|百分百|必然发生|一定会|最终用神(?:是|为)|统计证明|事实互证成立/.test(v)) throw new Error('正文不符合当前边界'); return v.trim(); };
  if (!Array.isArray(raw.sections) || raw.sections.length !== 5) throw new Error('合参章节不完整');
  const sections = raw.sections.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('章节格式错误');
    const s = value as Record<string, unknown>;
    if (typeof s.key !== 'string' || !Object.hasOwn(SYNTHESIS_SECTIONS, s.key) || seen.has(s.key)) throw new Error('章节重复或未知');
    const content = check(s.content, 12, 2200);
    if (texts.has(content)) throw new Error('正文重复');
    if (!Array.isArray(s.evidenceIds) || !s.evidenceIds.length || s.evidenceIds.length > 8 || s.evidenceIds.some(id => typeof id !== 'string' || !allowed.has(id))) throw new Error('引用无效');
    const refs = [...new Set(s.evidenceIds as string[])], z = refs.some(id => id.startsWith('ziwei:')), b = refs.some(id => id.startsWith('bazi:'));
    if (s.key === 'ziwei' ? !z || b : s.key === 'bazi' ? !b || z : !z || !b) throw new Error('章节没有遵守两套体系的引用边界');
    if (facts.dynamic) {
      const zd = refs.some(id => id.startsWith('ziwei:dynamic:')), bd = refs.some(id => id.startsWith('bazi:dynamic:'));
      if (s.key === 'ziwei' ? !zd : s.key === 'bazi' ? !bd : !zd || !bd) throw new Error('动态章节须引用所选阶段的双侧依据');
      if (resolveSynthesisPromptVersion(facts) === SYNTHESIS_DYNAMIC_PROMPT_VERSION) {
        const zr = refs.some(id => id.startsWith('ziwei:dynamic:review:')), br = refs.some(id => id.startsWith('bazi:dynamic:review:'));
        if (s.key === 'ziwei' ? !zr : s.key === 'bazi' ? !br : !zr || !br) throw new Error('深化章节须引用当前主题的双侧复核依据');
      }
    }
    seen.add(s.key); texts.add(content); return { key: s.key as SynthesisSection, content, evidenceIds: refs };
  });
  return { summary: check(raw.summary, 12, 600), sections: Object.keys(SYNTHESIS_SECTIONS).map(k => sections.find(s => s.key === k)!) };
}
