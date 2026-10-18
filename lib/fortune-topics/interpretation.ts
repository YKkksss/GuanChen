import type { ChatMessage } from '@/lib/ai/deepseek';
import { BRANCHES } from '@/lib/ziwei/constants';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { FORTUNE_SECTIONS, FORTUNE_TOPICS, sectionKeys, type FortuneContent, type FortuneFacts, type FortuneStage, type FortuneTopic } from './types';
export const FORTUNE_PROMPT_VERSION = 'fortune-topics-v1';
export function buildFortuneFacts(chart: ZiweiChart, topic: FortuneTopic, a: FortuneStage, b: FortuneStage | null): FortuneFacts {
  const evidence: FortuneFacts['evidence'] = chart.palaces.map(p => ({ id: `natal:${p.branch}`, label: `本命${p.name}`, details: `${BRANCHES[p.branch]}宫：${p.stars.map(s => `${s.name}${s.siHua ? `化${s.siHua}` : ''}${s.brightness ? `（${s.brightness}）` : ''}`).join('、') || '无记录星曜'}${p.isEmpty ? `；空宫借${p.borrowedFromName ?? '对宫'}，${p.borrowedStars?.join('、') || '未记录'}` : ''}。` }));
  for (const [prefix, stage] of [['a', a], ['b', b]] as const) {
    if (!stage) continue;
    const { snapshot: s, period: p } = stage, level = s.level === 'year' ? '流年' : '流月';
    evidence.push({ id: `${prefix}:scope`, label: `${prefix.toUpperCase()} · 分析范围`, details: `${p.label}，公历 ${p.startDate} 至 ${p.endDate}；完整历法范围 ${p.fullStartDate} 至 ${p.fullEndDate}；代表日 ${s.representativeDate}，${s.lunarDate}。` },
      { id: `${prefix}:decadal`, label: `${prefix.toUpperCase()} · 所在大限`, details: `${s.nominalAge} 虚岁；${s.decadal.periodKind === 'childhood' ? '童限，尚未进入首个大限' : s.decadal.periodKind === 'unavailable' ? '超出已排大限，不据此推断大限结构' : `${s.decadal.startAge}–${s.decadal.endAge} 岁，本命${s.decadal.nativePalaceName}`} ${s.decadal.palaceBranch >= 0 ? `（${BRANCHES[s.decadal.palaceBranch]}）` : ''}。` },
      { id: `${prefix}:flow`, label: `${prefix.toUpperCase()} · ${level}命宫`, details: `${s.year.ganZhi}年；流年命宫在本命${s.flowYear.nativePalaceName}${s.level === 'month' ? `；${s.flowMonth.ganZhi}流月命宫在本命${s.flowMonth.nativePalaceName}` : ''}。` },
      { id: `${prefix}:related`, label: `${prefix.toUpperCase()} · 三方四正`, details: `${level}命宫及对宫、两个三合宫：${s.relatedPalaceBranches.map(branch => `本命${chart.palaces.find(palace => palace.branch === branch)?.name ?? '未知宫位'}（${BRANCHES[branch]}）`).join('、')}。` });
    s.transformations.forEach((t, i) => evidence.push({ id: `${prefix}:transform:${i}`, label: `${prefix.toUpperCase()} · ${level}${t.starName}化${t.type}`, details: `落本命${t.natalPalaceName ?? '未定位宫位'}。` }));
    if (s.level === 'month') s.yearlyTransformations.forEach((t, i) => evidence.push({ id: `${prefix}:year-transform:${i}`, label: `${prefix.toUpperCase()} · 流年${t.starName}化${t.type}`, details: `落本命${t.natalPalaceName ?? '未定位宫位'}。` }));
    s.palaceMappings.forEach(m => evidence.push({ id: `${prefix}:mapping:${m.branch}`, label: `${prefix.toUpperCase()} · ${level}${m.transitPalaceName}`, details: `落本命${m.nativePalaceName}（${BRANCHES[m.branch]}）；流曜 ${m.transitStars.join('、') || '无记录'}。` }));
    for (const name of FORTUNE_TOPICS[topic].palaces) {
      const mapping = s.palaceMappings.find(m => m.transitPalaceName.replace(/宫$/, '') === name.replace(/宫$/, ''));
      if (!mapping) continue;
      const related = [mapping.branch, (mapping.branch + 6) % 12, (mapping.branch + 4) % 12, (mapping.branch + 8) % 12];
      evidence.push({ id: `${prefix}:topic:${name}`, label: `${prefix.toUpperCase()} · ${level}${name}三方四正`, details: `主题宫落本命${mapping.nativePalaceName}（${BRANCHES[mapping.branch]}），连同对宫和两个三合宫：${related.map(branch => `本命${chart.palaces.find(p => p.branch === branch)?.name ?? '未知宫位'}（${BRANCHES[branch]}）`).join('、')}。星曜以相应本命宫依据为准。` });
    }
  }
  const changes: string[] = [];
  if (b) {
    const da = a.snapshot.decadal, db = b.snapshot.decadal;
    const decadalLabel = (d: typeof da) => d.periodKind === 'childhood' ? '童限' : d.periodKind === 'unavailable' ? '超出已排大限' : `本命${d.nativePalaceName}`;
    changes.push(`大限：A ${decadalLabel(da)}，B ${decadalLabel(db)}${da.periodKind !== 'decadal' || db.periodKind !== 'decadal' ? '（童限或缺少大限，不作跨大限判断）' : da.palaceBranch === db.palaceBranch ? '（同一大限）' : '（跨大限）'}。`);
    for (const name of FORTUNE_TOPICS[topic].palaces) {
      const am = a.snapshot.palaceMappings.find(m => m.transitPalaceName.replace(/宫$/, '') === name.replace(/宫$/, '')), bm = b.snapshot.palaceMappings.find(m => m.transitPalaceName.replace(/宫$/, '') === name.replace(/宫$/, ''));
      if (am && bm) changes.push(`${name}映射：A 本命${am.nativePalaceName}（${BRANCHES[am.branch]}），B 本命${bm.nativePalaceName}（${BRANCHES[bm.branch]}）。`);
    }
    changes.push(`四化：A ${a.snapshot.transformations.map(t => `${t.starName}化${t.type}→${t.natalPalaceName ?? '未定位'}`).join('、')}；B ${b.snapshot.transformations.map(t => `${t.starName}化${t.type}→${t.natalPalaceName ?? '未定位'}`).join('、')}。`);
  }
  return { topic, unknownTime: Boolean(chart.birthInfo.unknownTime), a, b, changes, evidence };
}
export function buildFortuneMessages(facts: FortuneFacts): ChatMessage[] {
  const keys = sectionKeys(Boolean(facts.b));
  return [{ role: 'system', content: `你是观辰紫微运势专题的中文分析助手。主题：${FORTUNE_TOPICS[facts.topic].label}，关注宫位：${FORTUNE_TOPICS[facts.topic].palaces.join('、')}。
只解释输入的本命、代表日大限、流年或流月事实，不自行起盘，不编造星曜四化、现实经历或概率。年度是春节至下一个春节之前的农历流年，月份是包含闰月的真实农历月。分析仅覆盖各阶段 startDate 至 endDate，代表日不等于全年或每一天都相同。月度依据区分流年与流月；年/月分析不推断流日、具体时辰。先看本命与大限，再解释专题宫位、四化和三方四正。
未知时辰需明确为子时试排，降低判断确定性。童限不能冒充成年大限，超出已排大限时说明缺少大限依据，不补造大限范围。分析用条件、观察方向和具体行动表达，禁止必定、注定、百分百、必然发生、一定会。不输出吉凶分数，不提供具体金融买卖指令。命理解释是传统文化参考，不能作为现实事件结论。
${facts.b ? '对比保持输入 A、B 顺序，说明延续与变化、各自适合关注的条件，不硬排优劣。对比章节必须引用两阶段的实际依据。' : '只有阶段 A，不得编写阶段 B 或比较结论。'}
仅返回 JSON 对象：{"summary":"80至180字摘要","sections":[{"key":"章节键","content":"150至300字、可包含 Markdown 的中文正文","evidenceIds":["输入实际存在的ID"]}]}。
章节必须且只包含 ${keys.map(k => `${k}（${FORTUNE_SECTIONS[k]}）`).join('、')}。每节引用1至8条依据；background 至少引用本命和 A 的大限；a_ 开头章节至少引用 a:，b_ 开头至少引用 b:；comparison 同时引用 a: 和 b:。每节内容不同，依据ID仅放在 evidenceIds，不放正文。` }, { role: 'user', content: JSON.stringify(facts) }];
}
export function validateFortuneContent(text: string, facts: FortuneFacts): FortuneContent {
  if (text.length > 40_000) throw new Error('内容过长');
  const parsed: unknown = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('内容格式错误');
  const raw = parsed as Record<string, unknown>, keys = sectionKeys(Boolean(facts.b)), allowed = new Set(facts.evidence.map(e => e.id));
  const checkText = (v: unknown, min: number, max: number) => { if (typeof v !== 'string' || v.trim().length < min || v.length > max || /必定|注定|百分百|必然发生|一定会/.test(v)) throw new Error('正文不符合要求'); return v.trim(); };
  if (!Array.isArray(raw.sections) || raw.sections.length !== keys.length) throw new Error('章节不完整');
  const seen = new Set<string>(), contents = new Set<string>();
  const sections = raw.sections.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('章节格式错误');
    const s = value as Record<string, unknown>;
    if (typeof s.key !== 'string' || !keys.includes(s.key as typeof keys[number]) || seen.has(s.key)) throw new Error('章节重复或未知');
    const content = checkText(s.content, 12, 2400);
    if (contents.has(content)) throw new Error('正文重复');
    if (!Array.isArray(s.evidenceIds) || s.evidenceIds.length < 1 || s.evidenceIds.length > 8 || s.evidenceIds.some(id => typeof id !== 'string' || !allowed.has(id))) throw new Error('依据无效');
    const refs = [...new Set(s.evidenceIds as string[])], has = (prefix: string) => refs.some(id => id.startsWith(prefix));
    if ((s.key.startsWith('a_') && (!has('a:') || has('b:'))) || (s.key.startsWith('b_') && (!has('b:') || has('a:'))) || (s.key === 'comparison' && (!has('a:') || !has('b:'))) || (s.key === 'background' && (!has('natal:') || !refs.includes('a:decadal')))) throw new Error('章节依据与阶段不匹配');
    seen.add(s.key); contents.add(content);
    return { key: s.key as typeof keys[number], content, evidenceIds: refs };
  });
  return { summary: checkText(raw.summary, 12, 600), sections: keys.map(k => sections.find(s => s.key === k)!) };
}
