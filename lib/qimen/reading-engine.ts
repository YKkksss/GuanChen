import { BRANCH_PALACES,RING } from './rules';
import { QimenError } from './error';
import { CLASH_PAIRS,CONTROLS,DOOR_ELEMENTS,GENERATES,INSTRUMENT_PUNISHMENTS,OPPOSITE_PALACES,QIMEN_FOCUS_SOURCE,QIMEN_READING_SOURCE,STAR_ELEMENTS,STEM_COMBINES,STEM_PATTERNS,WONDER_TOMBS } from './reading-rules';
import { QIMEN_FOCUS_TARGETS,QIMEN_READING_VERSION,type QimenElementRelation,type QimenFocusItem,type QimenMonthState,type QimenPalaceReview,type QimenReading,type QimenStarMonthState } from './reading-types';
import type { Element,QimenResult } from './types';
import { stemItem } from './focus-engine';
export { resolveQimenStem } from './focus-engine';
import { analyzeQimenScenario, scenarioEvidence } from './scenario-engine';
const BRANCH_ELEMENTS:Record<string,Element>={子:'水',丑:'土',寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水'};

export function elementRelation(source:Element,target:Element):QimenElementRelation {
  if (!Object.hasOwn(GENERATES,source)||!Object.hasOwn(GENERATES,target)) throw new QimenError('五行不正确');
  return source===target?'same':GENERATES[source]===target?'generates':GENERATES[target]===source?'generated_by':CONTROLS[source]===target?'controls':'controlled_by';
}
export function monthState(element:Element,monthElement:Element):QimenMonthState {
  return ({same:'旺',generates:'相',generated_by:'休',controls:'死',controlled_by:'囚'} as const)[elementRelation(monthElement,element)];
}
/** 九星口诀与普通五行月令采用不同关系表，不共用旺相休囚死结果。 */
export function starMonthState(element:Element,monthElement:Element):QimenStarMonthState {
  return ({same:'相',generates:'旺',generated_by:'死',controls:'废',controlled_by:'囚'} as const)[elementRelation(element,monthElement)];
}
const relationLabels=(source:string):Record<QimenElementRelation,string>=>({same:`${source}宫同五行`,generates:`${source}生宫`,generated_by:`宫生${source}`,controls:`${source}克宫`,controlled_by:`宫克${source}`});
export function analyzeQimenReading(result:QimenResult):QimenReading {
  const monthBranch=result.calendar.month[1];
  if (!Object.hasOwn(BRANCH_ELEMENTS,monthBranch)) throw new QimenError('节令月支不正确');
  const monthElement=BRANCH_ELEMENTS[monthBranch],middle=result.palaces.find(p=>p.number===5);
  if (!middle) throw new QimenError('盘面缺少中宫');
  const palaces:QimenPalaceReview[]=result.palaces.map(p=>{
    const center=p.number===5,earthStems=[{stem:p.earthStem,origin:p.number,hosted:false},...(p.number===2?[{stem:middle.earthStem,origin:5,hosted:true}]:[])];
    const patterns:QimenPalaceReview['patterns']=[];
    const stems=center?[]:p.heavenStems.flatMap(heavenStem=>{
      const heavenOrigin=result.palaces.find(x=>x.earthStem===heavenStem)?.number;
      if (!heavenOrigin) throw new QimenError('天盘干来源不正确');
      if (Object.hasOwn(INSTRUMENT_PUNISHMENTS,heavenStem)&&INSTRUMENT_PUNISHMENTS[heavenStem]===p.number) patterns.push({id:`punishment:${heavenStem}`,label:`六仪击刑位置 · ${heavenStem}`,detail:`天盘${heavenStem}落${p.number}宫，命中六甲遁仪击刑位置表；只核对位置，不以地盘同干触发，不直接裁定事情损益。`,sourceUrl:QIMEN_READING_SOURCE,disputed:false});
      if (Object.hasOwn(WONDER_TOMBS,heavenStem)&&WONDER_TOMBS[heavenStem]===p.number) patterns.push({id:`tomb:${heavenStem}`,label:`三奇入墓位置 · ${heavenStem}`,detail:`天盘${heavenStem}落${p.number}宫，按卷一四十格表乙坤二、丙乾六、丁艮八核对。${heavenStem==='丁'?'同书歌诀另有丙丁归乾的异文，本版固定表列口径，不视为唯一通则。':''}位置存在不等于已完成入墓效力或吉凶裁决。`,sourceUrl:QIMEN_READING_SOURCE,disputed:heavenStem==='丁'});
      return earthStems.map(earth=>{
        const pattern=STEM_PATTERNS[heavenStem+earth.stem];
        if (pattern) patterns.push({id:`pair:${heavenStem}${earth.stem}`,label:`${pattern}结构 · ${heavenStem}加${earth.stem}`,detail:`本宫天盘${heavenStem}加地盘${earth.stem}${earth.hosted?'（原中五寄干）':''}，只标对应加临组合，不继承原典确定性断语。`,sourceUrl:QIMEN_READING_SOURCE,disputed:false});
        return {heavenStem,heavenOrigin,heavenCarriedFromCenter:heavenOrigin===5,earthStem:earth.stem,earthOrigin:earth.origin,carriedFromCenter:earth.hosted,sameStem:heavenStem===earth.stem,fiveCombine:heavenStem!==earth.stem&&STEM_COMBINES.some(pair=>pair.includes(heavenStem)&&pair.includes(earth.stem))};
      });
    });
    let door:QimenPalaceReview['door']=null;
    if (!center&&p.door) {
      if (!Object.hasOwn(DOOR_ELEMENTS,p.door)) throw new QimenError('八门名称不正确');
      const element=DOOR_ELEMENTS[p.door],relation=elementRelation(element,p.element);
      door={name:p.door,element,monthState:monthState(element,monthElement),relation,label:relation==='controls'?'门克宫 · 门迫':relation==='controlled_by'?'宫克门 · 宫制门':relationLabels('门')[relation],pressure:relation==='controls',controlled:relation==='controlled_by'};
    }
    const stars=center?[]:p.stars.map(name=>{
      if (!Object.hasOwn(STAR_ELEMENTS,name)) throw new QimenError('九星名称不正确');
      const element=STAR_ELEMENTS[name],relation=elementRelation(element,p.element);
      return {name,element,monthState:starMonthState(element,monthElement),relation,label:relationLabels('星')[relation]};
    });
    return {number:p.number,center,element:p.element,monthState:monthState(p.element,monthElement),branches:Object.entries(BRANCH_PALACES).filter(([,n])=>n===p.number).map(([b])=>b),emptyBranches:[...p.emptyBranches],earthStems,door,stars,stems,patterns};
  });
  const target=result.input.focusTarget??'none',items:QimenFocusItem[]=[];
  if (!Object.hasOwn(QIMEN_FOCUS_TARGETS,target)) throw new QimenError('参考对象不正确');
  if (target==='day_stem'||target==='day_hour') items.push(stemItem(result,result.calendar.day,'day','日干'));
  if (target==='hour_stem'||target==='day_hour') items.push(stemItem(result,result.calendar.hour,'hour','时干'));
  const symbol=target==='opening'?'开门':target==='wealth'?'生门':target==='study'?'天辅':null;
  if (symbol) items.push({key:target,label:QIMEN_FOCUS_TARGETS[target],symbol,matchedSymbol:symbol,palaces:result.palaces.filter(p=>p.number!==5&&(p.door===symbol||p.stars.includes(symbol))).map(p=>p.number),earthOrigin:null,earthHost:null,hiddenJia:false,detail:'只定位用户明确选择的门或星；占类取用各有条件，不从自由占问文本判定用神或替代现实决定。'});
  if (target==='manual_palace') {
    const n=result.input.focusPalace;
    if (typeof n!=='number'||!Number.isInteger(n)||!result.palaces.some(p=>p.number===n)) throw new QimenError('请指定1至9宫作为参考宫位');
    items.push({key:'manual',label:'自行指定宫位',symbol:`${n}宫`,matchedSymbol:`${n}宫`,palaces:[n],earthOrigin:null,earthHost:null,hiddenJia:false,detail:n===5?'用户明确选择中五作地盘参照；本版中五不独布活动星门神。':'宫位由用户明确指定；不代表程序已自动完成全部占类取用。'});
  }
  const focusPalaces=[...new Set(items.flatMap(i=>i.palaces))].sort((a,b)=>a-b),dayPalace=items.find(i=>i.key==='day')?.palaces[0],hourPalace=items.find(i=>i.key==='hour')?.palaces[0];
  let comparison:QimenReading['comparison']=null;
  if (target==='day_hour'&&dayPalace&&hourPalace) {
    const a=palaces.find(p=>p.number===dayPalace)!,b=palaces.find(p=>p.number===hourPalace)!,relation=elementRelation(a.element,b.element);
    const labels:Record<QimenElementRelation,string>={same:dayPalace===hourPalace?'日时干同宫':'日时宫同五行',generates:'日干宫生时干宫',generated_by:'时干宫生日干宫',controls:'日干宫克时干宫',controlled_by:'时干宫克日干宫'};
    comparison={dayPalace,hourPalace,relation,label:labels[relation],detail:'只比较两个已定位天盘宫的五行，不自动把日干、时干固定成所有占类的本人和事情，也不直接判断成败。'};
  }
  const outer=result.palaces.filter(p=>RING.includes(p.number));
  const structures={starFuyin:outer.length===8&&outer.every(p=>p.starSource===p.number),doorFuyin:outer.length===8&&outer.every(p=>p.doorSource===p.number),starFanyin:outer.length===8&&outer.every(p=>p.starSource===OPPOSITE_PALACES[p.number]),doorFanyin:outer.length===8&&outer.every(p=>p.doorSource===OPPOSITE_PALACES[p.number]),detail:'星盘按外八宫星来源同宫或对宫核对，门盘另按门来源核对；只说明各层结构，不把单层成立写成全盘星门都成立。天禽按寄坤随芮，不拿中五强算对宫。'};
  const conditions:QimenReading['timing']['conditions']=focusPalaces.flatMap(n=>{
    const p=palaces.find(p=>p.number===n)!;
    const entries=[{palace:n,label:p.center?'中宫参照':'宫含地支观察',branches:p.branches,detail:p.center?'中宫没有固定地支方位，不能为其补造一个应验支。':'只列本宫对应地支；它们不是程序选出的确定应验日期。'}];
    if (p.emptyBranches.length) {
      entries.push({palace:n,label:'时旬空待核',branches:p.emptyBranches,detail:`原时旬空${p.emptyBranches.join('、')}保留；宫内部分支空不等于整个宫或所有符号都无用。`});
      entries.push({palace:n,label:'逢冲待核',branches:[...new Set(p.emptyBranches.map(b=>[...CLASH_PAIRS.find(pair=>pair.includes(b))!].find(other=>other!==b)!))],detail:'逢冲仅为填实或受冲待核入口，不直接解除旬空、击刑、入墓或门迫。'});
    }
    return entries;
  });
  const reading:QimenReading = {version:QIMEN_READING_VERSION,scope:'日时干定位、明确占类与宫门星仪条件复核，不作全部占类取用、格局效力或精确应期裁决。',month:{branch:monthBranch,element:monthElement,ordinaryPolicy:'宫与门采用普通五行月令关系：同月旺、月生相、生月休、克月囚、月克死；辰戌丑未按土月，不冒充八节门旺或人元司令。',starPolicy:'九星专门口诀：星生月旺、同类相、月生星死、月克星囚、星克月废；与普通五行状态分开展示。'},focus:{target,label:QIMEN_FOCUS_TARGETS[target],items,palaces:focusPalaces,status:target==='none'?'unselected':focusPalaces.length?'located':'unavailable'},comparison,palaces,structures,timing:{status:focusPalaces.length?'conditional':'needs_focus',conditions,note:'只显示明确参考宫位的地支与时旬空条件，不生成确定公历应验日，也不据此给出行动方位保证。'},boundaries:[
    '日干、时干定位使用各自干支柱所属旬遁甲，不混用时旬首；天盘落宫与地盘原宫、中五寄坤分别保留。占类取用仍需用户核对。',
    '中五地盘原干保留参照，按本版寄坤参与二宫地盘加临；天盘中五仪随天禽天芮转动，各天干与有效地干逐组对照，不把寄干覆盖或重复判作活动中宫。',
    '门迫只指门克宫，宫克门另列；月令与星门关系不合成综合分数，不自动判为吉方、凶方或事件成败。',
    '九星口诀的死、囚、废等是传统状态术语，不是现实事件结论；八节门旺、长生十二状态及完整旺衰效力另待校核。',
    '三奇入墓固定采用乙坤二、丙乾六、丁艮八的表列口径；丁的同书异文提示保留，不混成唯一通则。',
    '格局只核对六仪击刑、表列三奇入墓及乙辛、辛乙、癸丁、丁癸四组加临。没有将任意戊加丙冒充原典甲值符龙返首，完整十干克应、暗干、驿马和其他格局尚未纳入。',
    '星伏吟、门伏吟、星反吟、门反吟分层记录；时旬空不自动裁定真空假空、入墓效力或精确应期。置闰、飞盘与其他寄宫流派不在本版。',
  ]};
  reading.scenario=analyzeQimenScenario(result,reading);
  return reading;
}
export function readingEvidence(reading:QimenReading):QimenResult['evidence'] {
  return [
    ...(reading.scenario ? scenarioEvidence(reading.scenario, reading) : []),
    {id:'reading:focus',label:'参考对象定位与原寄宫',detail:`${reading.focus.label}。${reading.focus.items.map(i=>i.detail).join(' ')}${reading.comparison?` ${reading.comparison.label}；${reading.comparison.detail}`:''}`,sourceUrl:QIMEN_FOCUS_SOURCE},
    {id:'reading:month',label:'宫门月令与九星专门口诀',detail:`节令月支${reading.month.branch}${reading.month.element}。${reading.month.ordinaryPolicy} ${reading.month.starPolicy}`,sourceUrl:QIMEN_READING_SOURCE},
    ...reading.palaces.map(p=>({id:`reading:palace:${p.number}`,label:`${p.number}宫门星仪复核`,detail:p.center?'中五只保留地盘原干参照，无独立活动门星神，不补造门迫或天干加临。':`${p.element}宫月令${p.monthState}参考；${p.door?`${p.door.name}${p.door.element}，${p.door.label}，门月令${p.door.monthState}`:'未布门'}；${p.stars.map(s=>`${s.name}${s.element}，${s.label}，九星口诀${s.monthState}`).join('；')}。${p.stems.map(s=>`天${s.heavenStem}${s.heavenCarriedFromCenter?'（原中五随星）':''}加地${s.earthStem}${s.carriedFromCenter?'（中五寄坤）':''}${s.sameStem?'同干':''}${s.fiveCombine?'五合位置，未判化':''}`).join('；')}。时旬空支${p.emptyBranches.join('、')||'无'}，不以标签直接定吉凶。`,sourceUrl:QIMEN_READING_SOURCE})),
    ...reading.palaces.filter(p=>p.patterns.length).map(p=>({id:`reading:patterns:${p.number}`,label:`${p.number}宫格局位置与异文`,detail:p.patterns.map(pattern=>`${pattern.label}：${pattern.detail}`).join(' '),sourceUrl:QIMEN_READING_SOURCE})),
    {id:'reading:structures',label:'星门各层伏吟反吟',detail:`星伏吟${reading.structures.starFuyin?'是':'否'}；门伏吟${reading.structures.doorFuyin?'是':'否'}；星反吟${reading.structures.starFanyin?'是':'否'}；门反吟${reading.structures.doorFanyin?'是':'否'}。${reading.structures.detail}`,sourceUrl:QIMEN_READING_SOURCE},
    {id:'reading:timing',label:'参考宫位的应期条件观察',detail:`${reading.timing.conditions.map(c=>`${c.palace}宫${c.label}（${c.branches.join('、')||'无固定支'}）：${c.detail}`).join(' ')} ${reading.timing.note}`,sourceUrl:QIMEN_READING_SOURCE},
  ];
}
