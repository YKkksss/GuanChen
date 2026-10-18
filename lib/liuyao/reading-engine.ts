import { BRANCH_ELEMENTS } from './rules';
import { LiuyaoError } from './error';
import { ADVANCE_PAIRS, CLASH_PAIRS, COMBINE_PAIRS, CONTROLS, GENERATES, READING_SOURCES } from './reading-rules';
import { LIUYAO_FOCUS_TARGETS, LIUYAO_READING_VERSION, LIUYAO_TARGET_KIN, type LiuyaoElementRelation, type LiuyaoFocusCandidate, type LiuyaoLineContext, type LiuyaoLineReview, type LiuyaoReading, type LiuyaoRoleReference } from './reading-types';
import type { Element, LiuyaoResult } from './types';
import { analyzeLiuyaoInfluence, influenceEvidence } from './influence-engine';

export function elementRelation(source: Element, target: Element): LiuyaoElementRelation {
  return source === target ? 'same' : GENERATES[source] === target ? 'generates' : GENERATES[target] === source ? 'generated_by' : CONTROLS[source] === target ? 'controls' : 'controlled_by';
}
function matches(table:string[],a:string,b:string) {return a!==b && table.some(pair => pair.includes(a) && pair.includes(b));}
function opposite(branch:string) {return [...CLASH_PAIRS.find(p => p.includes(branch))!].find(b => b!==branch)!;}
function partner(branch:string) {return [...COMBINE_PAIRS.find(p => p.includes(branch))!].find(b => b!==branch)!;}
export function progressionFor(from:string,to:string): 'advance'|'retreat'|'none' {
  return ADVANCE_PAIRS.includes(from+to) ? 'advance' : ADVANCE_PAIRS.includes(to+from) ? 'retreat' : 'none';
}
export function lineContext(branch:string, calendar:LiuyaoResult['calendar']): LiuyaoLineContext {
  if (![branch,calendar.monthBranch,calendar.dayBranch].every(b => Object.hasOwn(BRANCH_ELEMENTS,b))) throw new LiuyaoError('月日或爻支不正确');
  const element=BRANCH_ELEMENTS[branch], monthElement=BRANCH_ELEMENTS[calendar.monthBranch], dayElement=BRANCH_ELEMENTS[calendar.dayBranch];
  if (!element || !monthElement || !dayElement) throw new LiuyaoError('月日或爻支不正确');
  const month=elementRelation(monthElement,element), day=elementRelation(dayElement,element);
  const labels=(name:string):Record<LiuyaoElementRelation,string> => ({same:`${name}与爻同五行`,generates:`${name}生爻`,generated_by:`爻生${name}`,controls:`${name}克爻`,controlled_by:`爻克${name}`});
  const empty=calendar.emptyBranches.includes(branch),monthClash=matches(CLASH_PAIRS,branch,calendar.monthBranch),dayClash=matches(CLASH_PAIRS,branch,calendar.dayBranch);
  const supports:string[]=[],constraints:string[]=[];
  if (month==='same'||month==='generates') supports.push(`${calendar.monthBranch}${monthElement}：${labels('月')[month]}，保留月令生扶入口。`);
  if (day==='same'||day==='generates') supports.push(`${calendar.dayBranch}${dayElement}：${labels('日')[day]}，保留日辰生扶入口。`);
  if (empty) constraints.push(`爻支${branch}在起卦${calendar.xun}旬空内；不凭动旺或逢冲直接擦除旬空。`);
  if (monthClash) constraints.push(`${calendar.monthBranch}${branch}月破关系；临日、生扶或发动另列，不直接判永久无用。`);
  if (month==='controls') constraints.push(`月支${calendar.monthBranch}${monthElement}克爻${branch}${element}。`);
  if (day==='controls') constraints.push(`日支${calendar.dayBranch}${dayElement}克爻${branch}${element}。`);
  return {branch,element,monthState:month==='same'?'旺':month==='generates'?'相':'休囚',monthRelation:labels('月')[month],dayRelation:labels('日')[day],empty,monthClash,dayClash,monthCombine:matches(COMBINE_PAIRS,branch,calendar.monthBranch),dayCombine:matches(COMBINE_PAIRS,branch,calendar.dayBranch),supports,constraints};
}
function activation(line:LiuyaoResult['lines'][number],context:LiuyaoLineContext,result:LiuyaoResult): LiuyaoLineReview['activation'] {
  if (!context.dayClash) return {status:'none',label:'未遇日支正冲',reasons:[]};
  if (line.moving) return {status:'moving_day_clash',label:'动爻日冲 · 动散待核',reasons:['原爻已经发动，不能再次命名为暗动；日冲是否动散仍须核对全局旺衰、生扶及变爻。']};
  if (context.empty || context.monthClash) return {status:'conflicting',label:'静爻日冲 · 空破待核',reasons:[...context.constraints,'旬空或月破并见，不在本阶段直接裁定暗动、冲实或日破。']};
  if (context.supports.length) return {status:'hidden_movement_candidate',label:'暗动候选',reasons:['静爻被日支正冲，已实现的日月条件中存在生扶入口。',...context.supports,...context.constraints,'这是暗动复核候选，须继续核对其他动爻、制约与所占事项，不改写原始动爻记录。']};
  const movingSupport=result.lines.filter(l => l.position!==line.position && l.moving && ['same','generates'].includes(elementRelation(l.element,line.element)));
  if (movingSupport.length) return {status:'conflicting',label:'静爻日冲 · 动扶待核',reasons:[`第${movingSupport.map(l=>l.position).join('、')}爻有同类或生扶关系，是否有效尚须核对其空破及动变；不因月令休囚直接判日破。`,...context.constraints]};
  return {status:'day_break_candidate',label:'日破候选',reasons:['静爻日冲，月令为休囚参考，当前日月与其他本卦明动爻中未识别生扶入口。',...context.constraints,'这是已实现条件下的受损候选，未完成全局有效性裁决，不代表事情结果。']};
}
function changedReview(line:LiuyaoResult['lines'][number],calendar:LiuyaoResult['calendar']): LiuyaoLineReview['change'] {
  if (!line.moving) return null;
  const changed=line.changed,relation=elementRelation(changed.element,line.element), progression=progressionFor(line.branch,changed.branch);
  const labels:Record<LiuyaoElementRelation,string>={same:'变爻与原爻比和',generates:'回头生',controls:'回头克',generated_by:'原爻生变爻（泄）',controlled_by:'原爻克变爻（耗）'};
  return {from:line.branch,to:changed.branch,relation,label:labels[relation],progression,progressionDetail:progression==='none'?'不在本版七组进退神支对中。':`${line.branch}→${changed.branch}为${progression==='advance'?'进神':'退神'}支对；仍须结合日月、空破与动变条件，不直接裁定效力。`,clash:matches(CLASH_PAIRS,line.branch,changed.branch),combine:matches(COMBINE_PAIRS,line.branch,changed.branch),context:lineContext(changed.branch,calendar)};
}
function roleFor(source:Element,target:Element): LiuyaoRoleReference['role'] {
  const relation=elementRelation(source,target);
  return relation==='same'?'用神同类':relation==='generates'?'元神':relation==='controls'?'忌神':relation==='controlled_by'?'仇神':'其他';
}
export function analyzeLiuyaoReading(result:LiuyaoResult): LiuyaoReading {
  const target=result.input.focusTarget??'manual',self=result.lines.find(l=>l.position===result.palace.shi)!,kind=target==='self'?self.kin:LIUYAO_TARGET_KIN[target]??result.focus.kind;
  const lines=result.lines.map(line => {
    const context=lineContext(line.branch,result.calendar), hidden=line.hidden?lineContext(line.hidden.branch,result.calendar):null;
    const relation=line.hidden?elementRelation(line.element,line.hidden.element):null;
    const flyingLabels:Record<LiuyaoElementRelation,string>={same:'飞伏同五行',generates:'飞生伏',controls:'飞克伏',generated_by:'伏生飞',controlled_by:'伏克飞'};
    return {position:line.position,context,hidden,activation:activation(line,context,result),change:changedReview(line,result.calendar),flyingHidden:relation?{label:flyingLabels[relation],detail:`飞爻${line.branch}${line.element}与伏神${line.hidden!.branch}${line.hidden!.element}的五行关系；伏神未作为实际动爻，未裁定出伏或有用无用。`}:null};
  });
  const candidates:LiuyaoFocusCandidate[]=result.lines.flatMap(line => {
    if (target==='self') return line.position===self.position?[{position:line.position,stem:line.stem,branch:line.branch,element:line.element,kin:line.kin,hidden:false,selected:false,context:lines[line.position-1].context,moving:line.moving,role:line.role}]:[];
    const visible=line.kin===kind?[{position:line.position,stem:line.stem,branch:line.branch,element:line.element,kin:line.kin,hidden:false,selected:false,context:lines[line.position-1].context,moving:line.moving,role:line.role}]:[];
    return [...visible,...(line.hidden?.kin===kind?[{...line.hidden,hidden:true,selected:false,context:lines[line.position-1].hidden!,moving:false,role:'伏神'}]:[])];
  });
  const requested=result.input.focusPosition;
  if (requested!==undefined && !candidates.some(c=>c.position===requested)) throw new LiuyaoError('所选爻位不属于当前用神候选，请核对六亲、明伏与世爻');
  const selectedCandidate=requested!==undefined?candidates.find(c=>c.position===requested)!:candidates.length===1?candidates[0]:null;
  if (selectedCandidate) selectedCandidate.selected=true;
  const selected=selectedCandidate?{position:selectedCandidate.position,hidden:selectedCandidate.hidden,method:target==='self'?'self' as const:requested!==undefined?'manual' as const:'single' as const}:null;
  const status=selected?'selected' as const:kind==='none'?'unselected' as const:candidates.length?'multiple' as const:'missing' as const;
  const targetElement=candidates[0]?.element;
  const roles:LiuyaoRoleReference[]=targetElement?result.lines.flatMap(line=>[
    {position:line.position,hidden:false,branch:line.branch,element:line.element,kin:line.kin,moving:line.moving,role:roleFor(line.element,targetElement),detail:`本卦${line.moving?'明动':'静爻'}的五行分类；是否能作用用神，另核日月、空破与动变，不凭类别直接判有力。`},
    ...(line.hidden?[{position:line.position,hidden:true,branch:line.hidden.branch,element:line.hidden.element,kin:line.hidden.kin,moving:false,role:roleFor(line.hidden.element,targetElement),detail:'缺亲伏神的五行分类；未判出伏、发动或生克有效性。'}]:[]),
  ]):[];
  const conditions:LiuyaoReading['timing']['conditions']=[];
  if (selectedCandidate) {
    const c=selectedCandidate.context,b=selectedCandidate.branch;
    conditions.push({label:c.empty?'值支／填实观察':'值支观察',branches:[b],detail:'遇同支仅是日辰观察入口，不说明事件会在该日发生，也不据此解除所有空破条件。'});
    if (c.empty) {
      conditions.push({label:'出旬观察',branches:[],detail:`核对是否离开起卦${result.calendar.xun}旬；旬空是原起卦事实，出旬不直接判为有效。`});
      conditions.push({label:'逢冲／冲空待核',branches:[opposite(b)],detail:'正冲可能涉及冲实或受损，须结合旺衰动静，不能把逢冲直接当作解空。'});
    }
    if (c.monthClash) conditions.push({label:'出月与填破待核',branches:[b,partner(b)],detail:'出月按实际节令月交界核对，值支或逢合也只是条件；不能月破即判无用或逢合即复原。'});
    conditions.push({label:c.monthCombine||c.dayCombine?'合绊与逢冲待核':'逢合观察',branches:c.monthCombine||c.dayCombine?[opposite(b)]:[partner(b)],detail:'合是关系位置，不先认定合起、合绊或化局；逢合、逢冲的实际效力需要进一步复核。'});
  }
  const reading: LiuyaoReading = {version:LIUYAO_READING_VERSION,scope:'用神定位、月日动变与作用路径条件复核，不包含完整效力、吉凶或精确应期裁决。',focus:{target,label:LIUYAO_FOCUS_TARGETS[target],kind,status,selected,candidates},lines,roles,timing:{status:selected?'conditional':'needs_selection',conditions,note:'只列已选用神的待核地支与条件，不输出确定公历应验日期；多现尚未定位时不混合各爻的应期。'},boundaries:[
    '对象模板只按用户明确选择映射六亲或世爻，不从自由占问文本猜测对象；多现不按旺衰、动静或空破自动择一。',
    '月令按月支五行给旺、相、休囚参考，辰戌丑未按土月；不细分人元司令，不与日辰生克折算为总分。',
    '暗动、日破、动散只提供已实现条件下的候选与反证，不改动原始四象、明动爻及本变卦。',
    '进退、回头生克只看实际动爻与本位变出爻；变爻不跨位作用其他爻，静爻的整卦装配不作实际变化。',
    '元神、忌神、仇神是相对用神五行的类别，不等同有力、发动或现实吉凶；伏神不自动出伏。',
    '旬空、月破保留为起卦事实，与生扶并列；三合、墓绝、反伏吟及完整效力裁决树尚未纳入本版。',
  ]};
  reading.influence = analyzeLiuyaoInfluence(result, reading);
  return reading;
}
export function readingEvidence(reading:LiuyaoReading): LiuyaoResult['evidence'] {
  const f=reading.focus;
  return [
    {id:'reading:focus',label:'用神定位与多现复核',detail:`${f.label}；六亲${f.kind}；候选${f.candidates.map(c=>`${c.position}爻${c.hidden?'伏神':'本爻'}${c.branch}`).join('、')||'暂无'}；${f.selected?`定位第${f.selected.position}爻${f.selected.hidden?'伏神':'本爻'}（${f.selected.method==='manual'?'用户指定':f.selected.method==='self'?'自占取世':'唯一候选'}）`:'尚未唯一定位，不自动取舍'}。`,sourceUrl:READING_SOURCES.multiple},
    {id:'reading:month-policy',label:'月令旺相休囚口径',detail:'以实际节令月支五行为基准，同五行作旺参考，月所生作相参考，其余为休囚参考；辰戌丑未按土月。不细分人元司令，月令与日辰生克分开，不折算强弱总分。',sourceUrl:READING_SOURCES.month},
    ...reading.lines.map(l=>({id:`reading:line:${l.position}`,label:`第${l.position}爻月日与日冲复核`,detail:`${l.context.branch}${l.context.element}，月令${l.context.monthState}参考；${l.context.monthRelation}、${l.context.dayRelation}；${l.activation.label}。${[...l.context.supports,...l.context.constraints,...l.activation.reasons].join(' ')}`,sourceUrl:READING_SOURCES.day})),
    ...reading.lines.filter(l=>l.change).map(l=>({id:`reading:change:${l.position}`,label:`第${l.position}爻实际动变复核`,detail:`${l.change!.from}→${l.change!.to}；${l.change!.label}。${l.change!.context.constraints.join(' ')}变爻只作用本位原动爻。`,sourceUrl:READING_SOURCES.change})),
    ...reading.lines.filter(l=>l.change && l.change.progression!=='none').map(l=>({id:`reading:progression:${l.position}`,label:`第${l.position}爻进退神支对`,detail:l.change!.progressionDetail,sourceUrl:READING_SOURCES.progression})),
    ...reading.lines.filter(l=>l.flyingHidden).map(l=>({id:`reading:hidden:${l.position}`,label:`第${l.position}爻飞伏关系`,detail:`${l.flyingHidden!.label}：${l.flyingHidden!.detail}`,sourceUrl:READING_SOURCES.effectiveness})),
    {id:'reading:roles',label:'元神忌神仇神类别',detail:reading.roles.length?`${reading.roles.map(r=>`${r.position}爻${r.hidden?'伏神':''}${r.branch}${r.element}：${r.role}${r.moving?'（明动）':''}`).join('；')}。类别不代表发动或生克有效，不把变爻跨位加入。`:'尚未指定用神类别，不自动补定元忌仇。',sourceUrl:READING_SOURCES.roles},
    {id:'reading:timing',label:'应期条件观察',detail:`${reading.timing.conditions.map(c=>`${c.label}（${c.branches.join('、')||'无固定支'}）：${c.detail}`).join(' ')} ${reading.timing.note}`,sourceUrl:READING_SOURCES.empty},
    ...(reading.influence ? influenceEvidence(reading.influence) : []),
  ];
}
