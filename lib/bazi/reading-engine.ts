import { buildBaziFineReview } from './fine-reading-engine';
import { buildBaziMethodReview, describeBaziMethodReview, locateBaziMethodElement } from './method-review-engine';
import { METHOD_CONDITION_LABELS } from './method-review-rules';
import { buildBaziNatalEffectReview, reviewBaziNatalPeriod } from './natal-effect-engine';
import { NATAL_COMBINATION_LABELS, NATAL_CONDITION_LABELS, NATAL_STEM_ELEMENT } from './natal-effect-rules';
import { buildBaziMonthCommandReview, baziMonthCommandEvidence, describeBaziMonthCommandReview } from './month-command-engine';
import { buildBaziMonthIntakeReview, baziMonthIntakeEvidence, describeBaziMonthIntakeReview } from './month-intake-engine';
import type { BaziNatalPeriodReview } from './natal-effect-types';
import { BAZI_ELEMENTS, type BaziCalculationResult, type BaziElement, type BaziPillar } from './types';
import type { BaziInterpretationResult } from './interpretation-types';
import type { BaziPatternConditionResult } from './pattern-condition-types';
import { BAZI_CLIMATE_RULES, BAZI_READING_METHODOLOGY_VERSION, BAZI_SEASONS, BAZI_STEM_MONTH_REFERENCES, CLIMATE_SOURCE, seasonForBranch } from './climate-rules';
import type { BaziClimateAnalysis, BaziElementPosition, BaziReadingFacts, BaziUsefulElement } from './reading-types';
export function positions(chart: BaziCalculationResult, element: BaziElement): BaziElementPosition {
  return locateBaziMethodElement(chart, element);
}
export function analyzeBaziClimate(chart: BaziCalculationResult, period = reviewBaziNatalPeriod(chart)): BaziClimateAnalysis {
  const season = seasonForBranch(chart.pillars.month.branch), seasonalRule = BAZI_CLIMATE_RULES.find(r => r.id === `season:${chart.dayMaster.element}:${season}`)!;
  const specific = BAZI_STEM_MONTH_REFERENCES[`${chart.dayMaster.stem}:${chart.pillars.month.branch}`];
  const selected = period.status === 'resolved' ? period.branches.find(b => b.id === period.activeBranchId) : undefined;
  const activeStems = selected ? period.activeStems : specific?.stems ?? [];
  const rule = specific ? { ...seasonalRule, id: `stem-month:${chart.dayMaster.stem}:${chart.pillars.month.branch}${selected ? `:${selected.id}` : ''}`, label: `${chart.dayMaster.stem}日主 · ${chart.pillars.month.branch}月参考${selected ? ` · ${selected.label}` : ''}`, elements: selected ? [...new Set(activeStems.map(s => NATAL_STEM_ELEMENT[s]))] : specific.elements, attention: [], rationale: selected ? `${selected.detail} ${period.detail}` : specific.rationale, sourceSection: specific.section, scope: 'stem_month_reference' as const } : seasonalRule;
  const pillars = Object.values(chart.pillars).filter((p): p is BaziPillar => p !== null);
  return { reference: specific, season, seasonLabel: BAZI_SEASONS[season].label, monthBranch: chart.pillars.month.branch, dayStem: chart.dayMaster.stem, rule, seasonalRule,
    directions: rule.elements.map(element => ({ ...positions(chart, element), purpose: rule.rationale })),
    stemReferences: activeStems.map(stem => { const surface = pillars.filter(p => p.key !== 'day' && p.stem === stem).map(p => `${p.label}${stem}`), hidden = pillars.flatMap(p => p.hiddenStems.filter(s => s.stem === stem).map(() => `${p.label}${p.branch}藏${stem}`)); return { stem, surface, hidden, status: surface.length ? 'surface_present' as const : hidden.length ? 'hidden_only' as const : chart.completeness === 'partial_unknown_time' ? 'unknown_time' as const : 'not_observed' as const }; }),
    conditions: ['季节以已保存排盘的节令月支定位，不用公历月份或农历月份替代。', '天干透出与地支仅藏分别显示；位置存在不等于有效、有力或已引动。', ...(specific ? [specific.basis === 'shared_paragraph' ? '本项来自同干合论，不冒充独立月断。' : specific.basis === 'period_conditional' ? `${period.label}：${period.detail}` : '本项来自对应月份段落；仍不继承原典命运断语。', ...(!selected && specific.periodNote ? [specific.periodNote] : [])] : ['当前匹配五行四时一般原则，未冒充十干十二月精细表。']), ...(chart.completeness === 'partial_unknown_time' ? ['时柱未知，未见元素不能视为全盘缺失；取用候选须降级。'] : []), '寒暖燥湿是传统规则语义，不代表出生地点的实测天气。'],
    boundary: '调候方向与扶抑方向分别复核；候选元素不是最终喜神、忌神或现实行动指令。' };
}

/** 连续问答消费同一份调候规则，避免总览有结果而聊天仍只使用旧的季节占位。 */
export function buildBaziReadingChatSnapshot(chart: BaziCalculationResult, question?: string, context?: { interpretation: BaziInterpretationResult; patterns: BaziPatternConditionResult }): string {
  const natal=buildBaziNatalEffectReview(chart),climate=analyzeBaziClimate(chart,natal.period),fine=buildBaziFineReview(chart);
  const commandFocused = question === undefined || /司令|司事|人元|分日|节气深浅|月令分日/.test(question);
  const commandSnapshot = commandFocused ? describeBaziMonthCommandReview(buildBaziMonthCommandReview(chart, context?.patterns, natal.period)) : '';
  const intakeFocused = question === undefined || /取用|透干|透出|会支|三合|三会|杂气|去留|合化|本气/.test(question) || /月令|格局/.test(question) && !/大运|流年|流月|流日|岁运/.test(question);
  const intakeSnapshot = intakeFocused ? describeBaziMonthIntakeReview(buildBaziMonthIntakeReview(chart, context?.patterns)) : '';
  const focused=question===undefined||/调候|寒暖|燥湿|用神|喜忌|用干|月令参考|特殊格局|从财|从杀|专旺|化气|原局|近合|争合|隔位|合绊|拔根|根气|秋分|谷雨|上下半月|作用复核/.test(question);
  const methodFocused = question === undefined || /扶抑|取用|用神|喜忌|通关|病药|旺衰|身强|身弱|格局|成格|破格|救应|建禄|月劫|阳刃|方法协调/.test(question) && (!/大运|流年|流月|流日|岁运/.test(question) || /原局|扶抑|取用|用神|喜忌|通关|病药/.test(question));
  const methodSnapshot = methodFocused && context ? describeBaziMethodReview(buildBaziMethodReview({ chart, interpretation: context.interpretation, patterns: context.patterns, climate, fine, natal })) : '';
  const activeBranch=natal.period.status==='resolved'?natal.period.branches.find(b=>b.id===natal.period.activeBranchId):undefined;
  const checks=fine.stemChecks.map(s=>`${s.stem}(${activeBranch?(activeBranch.primary.includes(s.stem)?'当前分支主要参考':activeBranch.support.includes(s.stem)?'当前分支配合参考':'其他分支参考，当前未启用'):s.role==='conditional'?'条件支线':'章节参考'})：表层${s.surface.join('、')||'未见'}；同干根${s.exactRoots.join('、')||'未见'}；同五行其他根${s.sameElementRoots.join('、')||'未见'}；${[...s.combinations,...s.rootClashes,...s.cautions].join('；')}`).join('。');
  const specials=fine.specialPatterns.filter(p=>p.status!=='not_observed').map(p=>`${p.label}：${p.status==='unknown_time'?'缺时柱待核':p.status==='counterevidence'?'已有反证':'结构入口已见'}；${p.observations.join('、')}；反证${p.objections.slice(0,3).join('、')||'本清单未见'}；仍未裁定成立`).join('。');
  return `${commandSnapshot}${commandSnapshot ? '\n\n' : ''}${intakeSnapshot}${intakeSnapshot ? '\n\n' : ''}${methodSnapshot}${methodSnapshot ? '\n\n' : ''}【新增原局调候参考】
规则版本：${BAZI_READING_METHODOLOGY_VERSION}；${climate.dayStem}日主、节令${climate.monthBranch}月；${fine.reference.section}。
来源粒度：${fine.reference.basis==='shared_paragraph'?'同干合论':fine.reference.basis==='period_conditional'?`月内条件分支，${natal.period.label}`:'对应月份段落'}；${climate.rule.rationale}
${focused?`具体用干复核：${checks}
特殊格局复核：${specials||'未见本清单入口，不否定其他流派'}。
【原局作用复核】${natal.version}；月内分支：${describeNatalPeriod(natal.period)}
五合近邻复核：${natal.combinations.map(c=>`${c.label}：${NATAL_COMBINATION_LABELS[c.status]}；${c.conditions.map(t=>`${t.label}=${NATAL_CONDITION_LABELS[t.status]}（${t.detail}）`).join('；')}`).join('。')||'已知柱未见五合，缺时柱时不能断全盘无合'}
根气复核：${natal.roots.map(r=>`${r.stem}${r.isDayMaster?'（日主）':''}：${r.conditions.map(c=>`${c.label}=${NATAL_CONDITION_LABELS[c.status]}，${c.detail}`).join('；')}`).join('。')}
合冲并见：${natal.branchClashes.map(c=>`${c.label}；${c.concurrentRelations.join('、')||'本清单未见六合或完整三合'}；${c.detail}`).join('。')||'已知柱未见六冲，不证明全局无阻碍'}。${natal.boundary}`:'本问题非调候／特殊格局重点，仅保留月令参考；详细条件按需带入，不挤占岁运证据。'}
边界：${chart.completeness==='partial_unknown_time'?'缺时柱不能判缺失。':''}同干根与同五行根分开，五合不判化气，相冲不判拔根，条件支线不自动成为喜用。${climate.boundary}`;
}
export function describeNatalPeriod(period: BaziNatalPeriodReview): string {
  return `${period.label}；${period.detail}${period.boundary?`；${period.boundary.name}交接${period.boundary.at} ${period.boundary.timeZone}`:''}${period.activeBranchId?`；适用参考干${period.activeStems.join('、')}（先后及主辅见分支）`:''}`;
}
export function buildBaziReadingFacts(chart: BaziCalculationResult, interpretation: BaziInterpretationResult, patterns: BaziPatternConditionResult, chartFingerprint: string): BaziReadingFacts {
  const natalReview=buildBaziNatalEffectReview(chart), climate = analyzeBaziClimate(chart,natalReview.period), fineReview = buildBaziFineReview(chart);
  const methodReview = buildBaziMethodReview({ chart, interpretation, patterns, climate, fine: fineReview, natal: natalReview });
  const monthCommandReview = buildBaziMonthCommandReview(chart, patterns, natalReview.period);
  const monthIntake = buildBaziMonthIntakeReview(chart, patterns);
  const evidence: BaziReadingFacts['evidence'] = [
    { id: 'chart:policy', label: '四柱与排盘口径', details: `${Object.values(chart.pillars).map(p => p?.ganZhi ?? '时柱未知').join(' · ')}；日主${chart.dayMaster.stem}${chart.dayMaster.element}；${chart.effectiveTime.date} ${chart.effectiveTime.time}，${chart.input.timeZoneId}，时间标准 ${chart.input.timeStandard === 'civil_time' ? '民用时' : '真太阳时'}，晚子时${chart.input.lateZiPolicy === 'next_day' ? '次日' : '当日'}口径。`, family: 'chart' },
    ...interpretation.strength.evidence.map(e => ({ id: `strength:${e.id}`, label: e.label, details: e.detail, family: 'strength' as const })),
    { id: 'strength:assessment', label: '旺衰证据总览', details: `${interpretation.strength.label}；${interpretation.strength.rationale.join('；')}。${interpretation.strength.boundary}`, family: 'strength' },
    { id: 'pattern:overview', label: '月令格局入口', details: `月支${interpretation.pattern.monthBranch}；${interpretation.pattern.candidates.map(p => `${p.label}，${p.sourceStem}，${p.transparentAt.join('、') || '未透出'}`).join('；') || '无候选'}。候选不等于成格。`, family: 'pattern' },
    { id: 'climate:rule', label: climate.rule.label, details: `${climate.rule.rationale}；来源：${climate.rule.sourceSection}。${climate.boundary}`, family: 'climate', sourceUrl: climate.reference?.sourceUrl ?? CLIMATE_SOURCE },
    { id: 'climate:conditions', label: '调候适用条件', details: climate.conditions.join('；'), family: 'climate' },
  ];
  for (const candidate of patterns.candidates) for (const [name, items] of [['支持条件', candidate.formationSupport], ['风险条件', candidate.breakingRisks], ['救应候选', candidate.rescueCandidates]] as const) items.forEach((item, index) => evidence.push({ id: `pattern:${candidate.id}:${name}:${index}`, label: `${candidate.label} · ${item.label}`, details: `${item.statusLabel}；${item.detail}；${item.evidence.map(e => e.detail).join('；')}。${item.boundary}`, family: 'pattern' }));
  for (const d of climate.directions) evidence.push({ id: `climate:position:${d.element}`, label: `${d.element}的原局位置`, details: `表层：${d.surface.join('、') || '未见'}；藏干：${d.hidden.join('、') || '未见'}${d.status === 'unknown_time' ? '；缺少时柱，不能断为缺失' : ''}。日干只作参照，不重复充当候选取用。`, family: 'climate' });
  for (const r of climate.stemReferences) evidence.push({ id: `climate:stem:${r.stem}`, label: `${r.stem}的原局位置`, details: `表层：${r.surface.join('、') || '未见'}；藏干：${r.hidden.join('、') || '未见'}；位置不等于效力。`, family: 'climate' });
  for (const s of fineReview.stemChecks) evidence.push({id:`climate:check:${s.stem}`,label:`${s.stem}的透藏、根与条件`,details:`角色${s.role}；${s.purpose}；表层${s.surface.join('、')||'未见'}；同干藏根${s.exactRoots.join('、')||'未见'}；同元素其他藏干${s.sameElementRoots.join('、')||'未见'}；${[...s.combinations,...s.rootClashes,...s.cautions].join('；')}`,family:'climate',sourceUrl:fineReview.reference.sourceUrl});
  for (const p of fineReview.specialPatterns) evidence.push({id:`pattern:special:${p.id}`,label:`${p.label}结构复核`,details:`${p.status}；条件：${p.conditions.join('；')}；观察：${p.observations.join('；')}；反证：${p.objections.join('；')||'当前清单未见，不等于成立'}；待核：${p.pending.join('；')}`,family:'pattern',sourceUrl:p.sourceUrl});
  evidence.push({id:'climate:natal-period',label:'月内分支适用复核',details:describeNatalPeriod(natalReview.period),family:'climate',sourceUrl:natalReview.period.sourceUrl});
  for(const c of natalReview.combinations) evidence.push({id:`pattern:natal-contact:${c.id}`,label:`${c.label}近合条件`,details:`${NATAL_COMBINATION_LABELS[c.status]}；${c.conditions.map(t=>`${t.label}：${NATAL_CONDITION_LABELS[t.status]}；${t.detail}`).join('；')}；${[...c.observations,...c.pending].join('；')}`,family:'pattern',sourceUrl:natalReview.sources.find(s=>s.id==='contact')!.url});
  for(const r of natalReview.roots) evidence.push({id:`strength:natal-root:${r.stem}`,label:`${r.stem}${r.isDayMaster?'日主':''}藏根与受冲复核`,details:`${r.conditions.map(t=>`${t.label}：${NATAL_CONDITION_LABELS[t.status]}；${t.detail}`).join('；')}；${r.roots.map(t=>`${t.location}（${t.kind==='same_stem'?'同干根':'同五行支持'}），相冲${t.clashes.join('、')||'未见'}；会合${t.concurrentRelations.join('、')||'未见'}`).join('；')}`,family:'strength',sourceUrl:natalReview.sources.find(s=>s.id==='root')!.url});
  for(const c of natalReview.branchClashes) evidence.push({id:`pattern:natal-clash:${c.id}`,label:c.label,details:`${c.adjacent?'近邻':'隔位'}；${c.concurrentRelations.join('；')||'未见本清单会合'}；${c.detail}`,family:'pattern',sourceUrl:natalReview.sources.find(s=>s.id==='clash')!.url});
  const describeConditions = (items: typeof methodReview.strength.conditions) => items.map(c => `${c.label}：${METHOD_CONDITION_LABELS[c.status]}；${c.detail}`).join('；');
  evidence.push({ id: 'strength:method-premises', label: '旺衰与承载的必要前提', details: `${describeConditions(methodReview.strength.conditions)}；反向及阻碍：${methodReview.strength.counterevidence.join('；') || '本清单未见'}；${methodReview.strength.pending.join('；')}`, family: 'strength', sourceUrl: methodReview.sources[0].url });
  for (const p of methodReview.patterns) evidence.push({ id: `pattern:method:${p.id}`, label: `${p.label}的分方法复核`, details: `来源${p.sourceStem}；${p.meaning === 'peer_month_separate_selection' ? '禄劫刃另查财官食杀，不以月令同气直接作喜用' : '月令格局语义，不等于扶抑喜用'}；${describeConditions(p.conditions)}；支持${describeConditions(p.support)}；风险${describeConditions(p.risks)}；救应${describeConditions(p.rescues)}；待核${p.pending.join('；')}`, family: 'pattern', sourceUrl: methodReview.sources[2].url });
  evidence.push({ id: 'useful:method-balancing', label: '扶抑法的方向与前提', details: `${methodReview.balancing.label}；条件候选${methodReview.balancing.elements.join('、') || '暂不列'}；${describeConditions(methodReview.balancing.conditions)}；${methodReview.balancing.pending.join('；')}`, family: 'useful', sourceUrl: methodReview.sources[0].url });
  evidence.push({ id: 'climate:method-premises', label: '调候法的适用与效力前提', details: `${describeConditions(methodReview.climate.conditions)}；${methodReview.climate.stems.map(s => `${s.stem}（${s.role}）：${s.position}；${s.pending.join('；')}`).join('；')}`, family: 'climate', sourceUrl: climate.reference?.sourceUrl ?? CLIMATE_SOURCE });
  for (const f of methodReview.flow) evidence.push({ id: `useful:method-${f.id}`, label: f.label, details: describeConditions(f.conditions), family: 'useful', sourceUrl: methodReview.sources[0].url });
  evidence.push(...baziMonthCommandEvidence(monthCommandReview));
  evidence.push(...baziMonthIntakeEvidence(monthIntake));
  const usefulElements: BaziUsefulElement[] = BAZI_ELEMENTS.map(element => {
    const coordination = methodReview.coordination.find(c => c.element === element)!;
    const suggestedBy = [...(coordination.balancing ? ['扶抑法（承载待核）'] : []), ...(coordination.climateStems.length ? ['调候法（效力待核）'] : [])];
    const attentionBy = climate.rule.attention.includes(element) ? ['调候条件复核'] : [];
    const status = chart.completeness === 'partial_unknown_time' ? 'undetermined' : suggestedBy.length ? 'conditions_pending' : attentionBy.length ? 'attention' : 'undetermined';
    const label = status === 'conditions_pending' ? climate.reference?.basis === 'period_conditional' && natalReview.period.status !== 'resolved' && coordination.climateStems.length ? '月内条件待核' : '取用前提待核' : status === 'attention' ? '谨慎复核' : '暂不裁定';
    const rationale = `${chart.completeness === 'partial_unknown_time' ? '时柱缺失，保留入口，不裁定喜忌。' : ''}${coordination.note}${coordination.patternReferences.length ? `格局来源另见${coordination.patternReferences.join('、')}；不混入喜用候选。` : ''}`;
    return { element, position: positions(chart, element), suggestedBy, attentionBy, status, label, rationale, evidenceIds: [`useful:${element}`, 'useful:method-balancing', 'climate:method-premises'] };
  });
  for (const e of usefulElements) evidence.push({ id: `useful:${e.element}`, label: `${e.element} · ${e.label}`, details: `${e.suggestedBy.join('、') || '无候选方法'}；${e.attentionBy.join('、') || '无开放谨慎条件'}；${e.rationale}`, family: 'useful' });
  return { methodologyVersion: BAZI_READING_METHODOLOGY_VERSION, chartFingerprint, chart, interpretation, patterns, climate, usefulElements, fineReview, natalReview, methodReview, monthCommandReview, monthIntake, reviewQuestions: [...(chart.completeness === 'partial_unknown_time' ? ['能否补充准确出生时间？'] : []), ...(patterns.monthCommand.isStorageMonth ? ['杂气月的多个格局入口应如何分别核对？'] : []), ...(interpretation.pattern.interactions.some(i => i.involvesMonthBranch) ? ['月支关系是否改变格局条件，需要哪些额外依据？'] : []), '调候与扶抑的语义不同，应先验证哪些承载和配合条件？', '本气、透干与会支入口应如何并列核对而不排名？', '缺字组合、六合与月支相冲为何不能算作完整会支？', '哪些条件仅藏未透，不能按表层发挥作用？', '近合入口通过后，还有哪些条件尚未裁定？', '当前用神候选需要哪些条件才能进一步成立？'], evidence };
}
