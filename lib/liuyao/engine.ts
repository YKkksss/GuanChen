import { Solar } from 'lunar-javascript';
import { hexagram, hexagramFromLines, meihuaDateTime, beijingDateTime } from '@/lib/meihua/engine';
import { BRANCHES } from '@/lib/ziwei/constants';
import { assignLines, palaceFor, sixSpirits, LIUYAO_SOURCES } from './rules';
import { KINDS, LINE_LABELS, LIUYAO_METHODS, LIUYAO_VERSION, type LiuyaoInput, type LiuyaoResult, type Line, type LineValue } from './types';
import { LIUYAO_FOCUS_TARGETS, LIUYAO_TARGET_KIN, type LiuyaoFocusTarget } from './reading-types';
import { analyzeLiuyaoReading, readingEvidence } from './reading-engine';
import { LiuyaoError } from './error';
export { beijingDateTime };
export { LiuyaoError } from './error';
export function normalizeLiuyaoInput(raw: unknown): LiuyaoInput {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new LiuyaoError('请提交有效的起卦条件');
  const v=raw as Record<string,unknown>;
  if(typeof v.method!=='string'||!Object.hasOwn(LIUYAO_METHODS,v.method))throw new LiuyaoError('起卦方式不正确');
  let dateTime:string;try{dateTime=meihuaDateTime(v.dateTime);}catch(e){throw new LiuyaoError(e instanceof Error?e.message:'起卦时间不正确');}
  const lateZiPolicy=v.lateZiPolicy??'midnight';let focusKind=v.focusKind??'none';
  if(lateZiPolicy!=='midnight'&&lateZiPolicy!=='zi_start')throw new LiuyaoError('换日口径不正确');
  if(focusKind!=='none'&&!KINDS.includes(focusKind as typeof KINDS[number]))throw new LiuyaoError('用神类别不正确');
  if (v.focusTarget!==undefined && (typeof v.focusTarget!=='string'||!Object.hasOwn(LIUYAO_FOCUS_TARGETS,v.focusTarget))) throw new LiuyaoError('用神对象模板不正确');
  const target=(v.focusTarget??'manual') as LiuyaoFocusTarget;
  if (target==='self') focusKind='none'; else if (LIUYAO_TARGET_KIN[target]) focusKind=LIUYAO_TARGET_KIN[target]!;
  if (v.focusPosition!==undefined && (typeof v.focusPosition!=='number'||!Number.isInteger(v.focusPosition)||v.focusPosition<1||v.focusPosition>6)) throw new LiuyaoError('具体用神爻位需为1至6，或暂不指定');
  const common={dateTime,lateZiPolicy,focusKind,...(v.focusTarget===undefined?{}:{focusTarget:target}),...(v.focusPosition===undefined?{}:{focusPosition:v.focusPosition})} as Pick<LiuyaoInput,'dateTime'|'lateZiPolicy'|'focusKind'|'focusTarget'|'focusPosition'>;
  if(v.method==='lines') {
    if(!Array.isArray(v.lineValues)||v.lineValues.length!==6||v.lineValues.some(n=>typeof n!=='number'||!Object.hasOwn(LINE_LABELS,n)))throw new LiuyaoError('请按初爻至上爻填写六个6、7、8或9');
    return {method:'lines',...common,lineValues:[...v.lineValues] as LineValue[]};
  }
  if(!Array.isArray(v.coins)||v.coins.length!==6||v.coins.some(row=>!Array.isArray(row)||row.length!==3||row.some(n=>n!==0&&n!==1)))throw new LiuyaoError('请完成六次三钱投掷，字面为0、背面为1');
  return {method:'coins',...common,coins:v.coins.map(row=>[...row]) as Array<Array<0|1>>};
}
// 字面记2、背面记3，与两背为少阴、两字为少阳的三钱记录一致。
export function coinValue(coins: Array<0|1>): LineValue {if(coins.length!==3||coins.some(n=>n!==0&&n!==1))throw new LiuyaoError('三钱记录不正确');return (6+coins.reduce<number>((sum,n)=>sum+n,0)) as LineValue;}
export function xunFor(day: string) {
  const stems=['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'],stem=stems.indexOf(day[0]),branch=BRANCHES.indexOf(day[1]);
  const index=Array.from({length:60},(_,i)=>i).find(i=>i%10===stem&&i%12===branch);
  if(index===undefined)throw new LiuyaoError('日干支不正确');
  const first=Math.floor(index/10)*10;return {xun:`甲${BRANCHES[first%12]}`,emptyBranches:[BRANCHES[(first+10)%12],BRANCHES[(first+11)%12]]};
}
function calendarFor(input:LiuyaoInput): LiuyaoResult['calendar'] {
  const [y,m,d]=input.dateTime.slice(0,10).split('-').map(Number),[h,min,s]=input.dateTime.slice(11).split(':').map(Number),lunar=Solar.fromYmdHms(y,m,d,h,min,s).getLunar();
  const ec=lunar.getEightChar() as unknown as {setSect(n:number):void;getYear():string;getMonth():string;getDay():string};
  ec.setSect(input.lateZiPolicy==='midnight'?2:1);
  const day=ec.getDay(),month=ec.getMonth();
  return {lunar:`${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,year:ec.getYear(),month,monthBranch:month[1],day,dayStem:day[0],dayBranch:day[1],...xunFor(day)};
}
function tagsFor(branch:string,c:LiuyaoResult['calendar']) {
  const i=BRANCHES.indexOf(branch),month=BRANCHES.indexOf(c.monthBranch),day=BRANCHES.indexOf(c.dayBranch),tags:string[]=[];
  if(c.emptyBranches.includes(branch))tags.push('旬空');
  if(i===month)tags.push('临月建');if((i+6)%12===month)tags.push('月支冲');
  if(i===day)tags.push('临日辰');if((i+6)%12===day)tags.push('日支冲');
  return tags;
}
export function calculateLiuyao(raw:unknown):LiuyaoResult {
  const input=normalizeLiuyaoInput(raw),values=input.method==='lines'?input.lineValues!:input.coins!.map(coinValue);
  const bits:Line[]=values.map(n=>n%2 as Line),changedBits:Line[]=values.map((n,i)=>n===6||n===9?(bits[i]===1?0:1):bits[i]);
  const primary=hexagramFromLines(bits),changed=hexagramFromLines(changedBits),palace=palaceFor(primary),changedPalace=palaceFor(changed),calendar=calendarFor(input),spirits=sixSpirits(calendar.dayStem);
  const assigned=assignLines(primary,palace.element),changedAssigned=assignLines(changed,palace.element),pure=assignLines(hexagram(palace.trigram,palace.trigram),palace.element);
  const missingKinds=KINDS.filter(k=>!assigned.some(l=>l.kin===k));
  const lines=assigned.map((l,i)=>({...l,value:values[i],yang:bits[i]===1,moving:values[i]===6||values[i]===9,spirit:spirits[i],role:(l.position===palace.shi?'世':l.position===palace.ying?'应':'') as '世'|'应'|'',changed:changedAssigned[i],hidden:missingKinds.includes(pure[i].kin)?pure[i]:null,tags:tagsFor(l.branch,calendar),changedTags:tagsFor(changedAssigned[i].branch,calendar)}));
  const self=lines.find(l=>l.position===palace.shi)!;
  const focusKind=input.focusTarget==='self'?self.kin:input.focusKind;
  const movingLines=lines.filter(l=>l.moving).map(l=>l.position),focus={kind:focusKind,visible:input.focusTarget==='self'?[self.position]:lines.filter(l=>l.kin===focusKind).map(l=>l.position),hidden:input.focusTarget==='self'?[]:lines.filter(l=>l.hidden?.kin===focusKind).map(l=>l.position)};
  const trace=[`六次记录按初爻到上爻为${values.join('、')}；6老阴、9老阳为动爻，7少阳、8少阴为静爻。`,...(input.method==='coins'?[`三钱字面记2、背面记3；每次三枚相加，原始正反面记录保留。`]:[]),`本卦${primary.fullName}，${palace.name}宫${palace.element}，${palace.stage}；世在${palace.shi}爻，应在${palace.ying}爻。`,`${movingLines.length?`第${movingLines.join('、')}爻翻转`:'六爻均静，本卦不变'}，之卦为${changed.fullName}。`,`上下卦分别纳甲；六亲均按本卦${palace.name}宫${palace.element}判定，变爻不改用之卦宫五行。`,`本卦缺少${missingKinds.length?missingKinds.join('、'):'的六亲为无'}；仅缺少六亲从本宫纯卦同位取伏神，不判其是否有用。`,`六神以${calendar.dayStem}日起初爻向上排列；页面玄武对应古籍元武。`,`年按立春、月按十二节的实际交节时刻；${calendar.month}月、${calendar.day}日，${calendar.xun}旬，${calendar.emptyBranches.join('')}空；北京时间标准时，${input.lateZiPolicy==='midnight'?'公历午夜换日':'23点子初换日'}。`];
  const evidence:LiuyaoResult['evidence']=[
    {id:'method:input',label:'原始起卦记录',detail:trace[0]+(input.method==='coins'?JSON.stringify(input.coins):''),sourceUrl:LIUYAO_SOURCES.coins},
    {id:'gua:primary',label:'本卦八宫与世应',detail:trace[1+(input.method==='coins'?1:0)],sourceUrl:LIUYAO_SOURCES.palace},
    {id:'gua:changed',label:'动爻与之卦',detail:`${movingLines.length?`第${movingLines.join('、')}爻动`:'静卦'}；${primary.fullName}之${changed.fullName}。六亲沿用本卦宫五行；静爻的之卦装配仅作整卦核对，不作实际变出爻。`,sourceUrl:LIUYAO_SOURCES.changed},
    {id:'calendar:day',label:'月建日辰与旬空',detail:`北京时间${input.dateTime}，年${calendar.year}、月${calendar.month}、日${calendar.day}；${calendar.xun}旬，${calendar.emptyBranches.join('')}空；月界按实际交节，${input.lateZiPolicy==='midnight'?'午夜换日':'子初换日'}。`,sourceUrl:LIUYAO_SOURCES.empty},
    ...lines.map(l=>({id:`line:${l.position}`,label:`第${l.position}爻装配`,detail:`${l.spirit}，${l.kin}${l.stem}${l.branch}${l.element}${l.role?`，${l.role}爻`:''}，${l.moving?'动':'静'}；${l.tags.join('、')||'未标记日月空冲'}。${l.moving?`变出${l.changed.kin}${l.changed.stem}${l.changed.branch}${l.changed.element}（以原宫定六亲）。`:''}${l.hidden?`伏神${l.hidden.kin}${l.hidden.stem}${l.hidden.branch}${l.hidden.element}，不判有用无用。`:''}`,sourceUrl:l.hidden?LIUYAO_SOURCES.spirits:LIUYAO_SOURCES.najia})),
    {id:'focus:user',label:'用户选择的用神类别',detail:input.focusTarget==='self'?`用户明确选择自占本人，以第${self.position}爻世爻${self.kin}${self.branch}${self.element}为用；不从占问文字猜测对象。`:focusKind==='none'?'未指定用神，保留类别选择；程序不根据占问自动裁定。':`用户选择${focusKind}，本卦出现于${focus.visible.join('、')||'无'}爻，缺亲伏于${focus.hidden.join('、')||'无'}爻；多现时不自动取舍。`,sourceUrl:LIUYAO_SOURCES.coins},
  ];
  const result:LiuyaoResult={version:LIUYAO_VERSION,input,primary,changed,palace,changedPalace,movingLines,lines,missingKinds,calendar,focus,trace,evidence,warnings:['传统结构用于学习与观察，不能直接保证现实结果。本阶段不作强弱总分、完整生克效力或确定性吉凶、精确应期裁决。','旬空与月破保留原起卦关系；暗动、日破及动散只列候选与反证，不直接判真空假空或用神有效性。','伏神仅在本卦缺少相应六亲时从本宫纯卦同位取；飞伏关系不等同已判出伏或有用无用。','之卦完整装配用于对照，只有原动爻位置是实际变出爻；本卦世应不因之卦宫变化而改动。','日期采用北京时间标准时，支持1900–2100年，不做真太阳时校正。三钱模拟是随机记录，不等同真实硬币或精确预测。']};
  result.reading=analyzeLiuyaoReading(result);
  result.evidence.push(...readingEvidence(result.reading));
  return result;
}
