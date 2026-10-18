import { BAZI_MONTHLY_CLIMATE_REFERENCES, MONTHLY_CLIMATE_SOURCE, type ClimateCondition } from './monthly-climate-rules';
import type { BaziClimateStemCheck, BaziFineReview, BaziSpecialPatternReview } from './fine-reading-types';
import type { BaziCalculationResult, BaziElement, BaziPillar } from './types';
const STEM_ELEMENT:Record<string,BaziElement>={甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水'};
const PARTNER:Record<string,string>={甲:'己',己:'甲',乙:'庚',庚:'乙',丙:'辛',辛:'丙',丁:'壬',壬:'丁',戊:'癸',癸:'戊'};
const CLASH:Record<string,string>={子:'午',午:'子',丑:'未',未:'丑',寅:'申',申:'寅',卯:'酉',酉:'卯',辰:'戌',戌:'辰',巳:'亥',亥:'巳'};
const GENERATES:Record<BaziElement,BaziElement>={木:'火',火:'土',土:'金',金:'水',水:'木'};
const CONTROLS:Record<BaziElement,BaziElement>={木:'土',土:'水',水:'火',火:'金',金:'木'};
const TRANSFORM:Record<string,BaziElement>={甲:'土',己:'土',乙:'金',庚:'金',丙:'水',辛:'水',丁:'木',壬:'木',戊:'火',癸:'火'};
const conditionElements:Partial<Record<ClimateCondition,BaziElement>>={earth_present:'土',water_present:'水',wood_present:'木',fire_present:'火',metal_present:'金'};
export function buildBaziFineReview(chart:BaziCalculationResult):BaziFineReview {
  const reference=BAZI_MONTHLY_CLIMATE_REFERENCES[`${chart.dayMaster.stem}:${chart.pillars.month.branch}`];
  if(!reference)throw new Error('日干月令参考不存在');
  const pillars=Object.values(chart.pillars).filter((p):p is BaziPillar=>p!==null),unknown=chart.completeness==='partial_unknown_time';
  const stemChecks:BaziClimateStemCheck[]=reference.stems.map(stem=>{
    const clause=reference.conditional.find(c=>c.stem===stem),surface=pillars.filter(p=>p.key!=='day'&&p.stem===stem).map(p=>`${p.label}${stem}`),hidden=pillars.flatMap(p=>p.hiddenStems.filter(s=>s.stem===stem).map(()=>`${p.label}${p.branch}藏${stem}`));
    const roots=pillars.filter(p=>p.hiddenStems.some(s=>s.stem===stem)),sameElementRoots=pillars.flatMap(p=>p.hiddenStems.filter(s=>s.stem!==stem&&s.element===STEM_ELEMENT[stem]).map(s=>`${p.label}${p.branch}藏${s.stem}`));
    const combinations=surface.flatMap(location=>pillars.filter(p=>p.stem===PARTNER[stem]).map(p=>`${location}与${p.label}${p.stem}有五合位置，未判合绊或化气`));
    const rootClashes=roots.flatMap(root=>pillars.filter(p=>p.branch===CLASH[root.branch]).map(p=>`${root.label}${root.branch}藏${stem}遇${p.label}${p.branch}相冲，未判拔根或冲开`));
    const expected=clause?conditionElements[clause.when]:undefined,observed=expected?pillars.some(p=>(p.key!=='day'&&p.stemElement===expected)||p.hiddenStems.some(s=>s.element===expected)):false;
    const condition=clause?(clause.when==='period_review'?'manual_review':observed?'position_observed':unknown?'unknown_time':'not_observed'):'reference';
    return{stem,role:clause?'conditional':reference.coreStems.indexOf(stem)===0?'primary':'support',purpose:clause?.detail??reference.rationale,surface,hidden,exactRoots:roots.map(p=>`${p.label}${p.branch}藏${stem}`),sameElementRoots,status:surface.length?'surface_present':hidden.length?'hidden_only':unknown?'unknown_time':'not_observed',condition,combinations,rootClashes,cautions:[...(surface.length&&!roots.length?['本干透出但未找到同干藏根；同五行藏干另列，不直接当作本干有根。']:[]),...(!surface.length&&hidden.length?['仅藏未透，不能按天干已经发挥作用。']:[]),...(clause?['出现相关五行只打开条件复核入口，不证明土厚、水泛或制化已经成立。']:[]),...(reference.periodNote?[reference.periodNote]:[]),...(unknown?['缺少时柱，未见本干或藏根不等于完整原局缺失。']:[])]};
  });
  const refs=Object.values(BAZI_MONTHLY_CLIMATE_REFERENCES);
  return{version:'bazi-fine-review-v1',reference,coverage:{total:refs.length,monthParagraphs:refs.filter(r=>r.basis==='month_paragraph').length,sharedParagraphs:refs.filter(r=>r.basis==='shared_paragraph').length,periodConditional:refs.filter(r=>r.basis==='period_conditional').length},stemChecks,specialPatterns:reviewSpecialPatterns(chart),methodReview:reference.elements.map(element=>({element,reason:reference.periodNote?'月内条件尚待复核，不能把本月列出的所有天干同时当作无条件取用。':'具体干的透藏、同干根、五合及根支相冲分别检查；结构出现不等于调候已经有效。'})),boundary:'这是版本化参考与条件复核，不输出最终强弱、成格破格、从化成立或唯一喜忌；合论和月内分支保留来源粒度。'};
}

/** 特殊格局只筛查结构入口和反证，不把单一五行数量或缺项作为成立条件。 */
export function reviewSpecialPatterns(chart:BaziCalculationResult):BaziSpecialPatternReview[]{
  const pillars=Object.values(chart.pillars).filter((p):p is BaziPillar=>p!==null),surfaces=pillars.filter(p=>p.key!=='day'),unknown=chart.completeness==='partial_unknown_time';
  const branches=pillars.map(p=>p.branch),dm=chart.dayMaster.element;
  const definitions:Array<[BaziElement,string,string[],string[]]>=[['木','曲直格',['寅','卯','辰'],['亥','卯','未']],['火','炎上格',['巳','午','未'],['寅','午','戌']],['土','稼穑格',['辰','戌','丑','未'],[]],['金','从革格',['申','酉','戌'],['巳','酉','丑']],['水','润下格',['亥','子','丑'],['申','子','辰']]];
  const results:BaziSpecialPatternReview[]=definitions.map(([element,label,meeting,harmony])=>{
    const matched=element===dm,group=element==='土'?meeting.filter(b=>branches.includes(b)).length>=3:meeting.every(b=>branches.includes(b))||harmony.every(b=>branches.includes(b));
    const counter=matched?pillars.flatMap(p=>[...(p.key!=='day'&&CONTROLS[p.stemElement]===element?[`${p.label}${p.stem}为克日主元素的表层位置`]:[]),...p.hiddenStems.filter(s=>CONTROLS[s.element]===element).map(s=>`${p.label}${p.branch}藏${s.stem}为逆向条件，未判是否破局`)]):[];
    return{id:`exclusive:${element}`,label,status:!matched?'not_observed':unknown?'unknown_time':!group?'not_observed':counter.length?'counterevidence':'entry_observed',conditions:[`日主为${element}`,element==='土'?'三种以上库土支仅作稼穑复核入口，未判土势专旺':'见对应三会或三合支的完整位置组合，未判合化'],observations:matched?[`日主${chart.dayMaster.stem}${element}`,group?'对应地支结构入口已见':'未见本清单要求的完整支结构']:['日主不属于该入口'],objections:counter,pending:['月令是否支持、气势是否专一、泄秀及逆势干支作用仍需逐项复核。','结构清单不是该格的完整必要充分条件，未通过不能据此否定其他流派。'],sourceUrl:MONTHLY_CLIMATE_SOURCE};
  });
  const resource=Object.keys(GENERATES).find(e=>GENERATES[e as BaziElement]===dm) as BaziElement;
  for(const [id,label,target] of [['follow-wealth','从财格',CONTROLS[dm]],['follow-kill','从杀格',Object.keys(CONTROLS).find(e=>CONTROLS[e as BaziElement]===dm) as BaziElement]] as const){
    const targets=surfaces.filter(p=>p.stemElement===target).map(p=>`${p.label}${p.stem}`),opposing=pillars.flatMap(p=>[...(p.key!=='day'&&(p.stemElement===dm||p.stemElement===resource)?[`${p.label}${p.stem}见比劫或印星方向`]:[]),...p.hiddenStems.filter(s=>s.element===dm||s.element===resource).map(s=>`${p.label}${p.branch}藏${s.stem}见根气或印比条件`)]);
    results.push({id,label,status:unknown?'unknown_time':!targets.length?'not_observed':opposing.length?'counterevidence':'entry_observed',conditions:['日干之外见相应财／官杀五行表层位置','复核印比与日主根气，不能只按数量多或五行缺失称从格'],observations:targets.length?targets:['相应表层入口未见'],objections:opposing,pending:['目标五行是否得令成势、藏根是否有效、真从假从及全局制化仍未裁决。',label==='从杀格'?'此处仅筛查官杀五行入口，不把正官自动改称七杀。':'原典不同月份有不取从财的限制，需结合实际章节复核。'],sourceUrl:MONTHLY_CLIMATE_SOURCE});
  }
  const partner=PARTNER[chart.dayMaster.stem],adjacent=[chart.pillars.month,chart.pillars.time].filter((p):p is BaziPillar=>p!==null).filter(p=>p.stem===partner),remote=chart.pillars.year.stem===partner,target=TRANSFORM[chart.dayMaster.stem];
  results.push({id:'transformation',label:'日干五合化气',status:unknown?'unknown_time':adjacent.length?'entry_observed':'not_observed',conditions:['只将月干或时干与日干五合的位置列为近邻入口','年干远合单列，不自动视为近邻合化'],observations:[...adjacent.map(p=>`${p.label}${partner}与日干${chart.dayMaster.stem}近邻五合，化神参考为${target}`),...(remote?[`年干${partner}仅为远隔位置`]:[]),...(!adjacent.length&&!remote?['未见日干五合对象表层位置']:[])],objections:[],pending:['五合存在不等于合绊或化气，月令、化神根气、争合、妒合及逆势支干仍需完整复核。'],sourceUrl:MONTHLY_CLIMATE_SOURCE});
  return results;
}
