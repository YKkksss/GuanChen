import { Solar } from 'lunar-javascript';
import { meihuaDateTime,beijingDateTime } from '@/lib/meihua/engine';
import { STEMS,BRANCHES,BRANCH_PALACES,GODS,INSTRUMENTS,PALACE_INFO,RING,TERM_JU,QIMEN_SOURCES,host,mod } from './rules';
import { QIMEN_METHODS,QIMEN_VERSION,type Dun,type QimenBoard,type QimenInput,type QimenPalace,type QimenResult } from './types';
import { QIMEN_FOCUS_TARGETS,type QimenFocusTarget } from './reading-types';
import { analyzeQimenReading,readingEvidence } from './reading-engine';
import { QimenError } from './error';
import { QIMEN_SCENARIOS, type QimenScenarioKey } from './scenario-types';
export {beijingDateTime};
export {QimenError} from './error';
export function normalizeQimenInput(raw:unknown):QimenInput{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new QimenError('请提交有效起盘资料');const v=raw as Record<string,unknown>;
  if(typeof v.method!=='string'||!Object.hasOwn(QIMEN_METHODS,v.method))throw new QimenError('定局方式不正确');
  let dateTime:string;try{dateTime=meihuaDateTime(v.dateTime);}catch(e){throw new QimenError(e instanceof Error?e.message:'起盘时间不正确');}
  const lateZiPolicy=v.lateZiPolicy??'midnight';if(lateZiPolicy!=='midnight'&&lateZiPolicy!=='zi_start')throw new QimenError('换日口径不正确');
  if(v.scenario!==undefined&&(typeof v.scenario!=='string'||!Object.hasOwn(QIMEN_SCENARIOS,v.scenario)))throw new QimenError('占类场景不正确');
  if(v.focusTarget!==undefined&&(typeof v.focusTarget!=='string'||!Object.hasOwn(QIMEN_FOCUS_TARGETS,v.focusTarget)))throw new QimenError('参考对象不正确');
  const target=(v.focusTarget??'none') as QimenFocusTarget;
  if(target==='manual_palace'&&(typeof v.focusPalace!=='number'||!Number.isInteger(v.focusPalace)||v.focusPalace<1||v.focusPalace>9))throw new QimenError('请明确选择1至9宫作为参考宫位');
  if(target!=='manual_palace'&&v.focusPalace!==undefined)throw new QimenError('只有自行指定宫位时才能提交参考宫位');
  const focus:Pick<QimenInput,'focusTarget'|'focusPalace'|'scenario'>={...(v.focusTarget===undefined?{}:{focusTarget:target}),...(target==='manual_palace'?{focusPalace:v.focusPalace as number}:{}),...(v.scenario===undefined||v.scenario==='none'?{}:{scenario:v.scenario as QimenScenarioKey})};
  if(v.method==='chaibu')return{method:'chaibu',dateTime,lateZiPolicy,...focus};
  if(v.manualDun!=='yang'&&v.manualDun!=='yin')throw new QimenError('请选择阴遁或阳遁');
  if(typeof v.manualJu!=='number'||!Number.isInteger(v.manualJu)||v.manualJu<1||v.manualJu>9)throw new QimenError('局数需为1–9整数');
  return{method:'manual',dateTime,lateZiPolicy,manualDun:v.manualDun,manualJu:v.manualJu,...focus};
}
export function ganZhiIndex(gz:string){if(typeof gz!=='string'||gz.length!==2)throw new QimenError('干支不正确');const n=Array.from({length:60},(_,i)=>i).find(i=>STEMS[i%10]===gz[0]&&BRANCHES[i%12]===gz[1]);if(n===undefined)throw new QimenError('干支不正确');return n;}
export function yuanFor(day:string){const index=ganZhiIndex(day),first=Math.floor(index/5)*5,branch=BRANCHES[first%12],yuanIndex=['子','午','卯','酉'].includes(branch)?0:['寅','申','巳','亥'].includes(branch)?1:2;return{fuTou:STEMS[first%10]+branch,yuanIndex,yuan:(['上元','中元','下元'] as const)[yuanIndex]};}
export function buildQimenBoard(dun:Dun,number:number,hour:string):QimenBoard{
  if((dun!=='yang'&&dun!=='yin')||!Number.isInteger(number)||number<1||number>9)throw new QimenError('阴阳局数不正确');
  const hourIndex=ganZhiIndex(hour),xunIndex=Math.floor(hourIndex/10),xunStart=xunIndex*10,hiddenStem=INSTRUMENTS[xunIndex],xun='甲'+BRANCHES[xunStart%12],hourOffset=hourIndex-xunStart,sign=dun==='yang'?1:-1;
  const earth=new Map<number,string>();INSTRUMENTS.forEach((stem,i)=>earth.set(mod(number-1+sign*i,9)+1,stem));
  const find=(stem:string)=>[...earth.entries()].find(([,s])=>s===stem)![0];
  const origin=find(hiddenStem),originHost=host(origin),timeStemRawPalace=find(hour[0]==='甲'?hiddenStem:hour[0]),starPalace=host(timeStemRawPalace);
  const starSteps=mod(RING.indexOf(starPalace)-RING.indexOf(originHost),8);
  // 值使从旬首的原始九宫起数，不能先把5映成2再累计时辰；到位之后才寄坤。
  const doorRawPalace=mod(origin-1+sign*hourOffset,9)+1,doorPalace=host(doorRawPalace),doorSteps=mod(RING.indexOf(doorPalace)-RING.indexOf(originHost),8);
  const emptyBranches=[BRANCHES[(xunStart+10)%12],BRANCHES[(xunStart+11)%12]];
  const palaces:QimenPalace[]=Array.from({length:9},(_,i)=>{const n=i+1,p=PALACE_INFO[n];return{number:n,name:p.name,direction:p.direction,element:p.element,earthStem:earth.get(n)!,heavenStems:[],stars:[],door:null,god:null,starSource:null,doorSource:null,emptyBranches:emptyBranches.filter(b=>BRANCH_PALACES[b]===n),markers:[]};});
  for(let i=0;i<8;i++){
    const source=RING[i],starTarget=RING[mod(i+starSteps,8)],doorTarget=RING[mod(i+doorSteps,8)],s=palaces[starTarget-1],d=palaces[doorTarget-1];
    s.stars=[PALACE_INFO[source].star,...(source===2?['天禽']:[])];s.heavenStems=[earth.get(source)!,...(source===2?[earth.get(5)!]:[])];s.starSource=source;
    d.door=PALACE_INFO[source].door;d.doorSource=source;
  }
  GODS.forEach((god,i)=>{palaces[RING[mod(RING.indexOf(starPalace)+sign*i,8)]-1].god=god;});
  palaces[starPalace-1].markers.push('值符落宫');palaces[doorPalace-1].markers.push('值使落宫');
  for(const p of palaces)if(p.emptyBranches.length)p.markers.push('时旬空');
  palaces[4].markers.push('地盘中五寄坤');
  const chief={xun,hiddenStem,origin,originHost,star:PALACE_INFO[origin].star,door:PALACE_INFO[originHost].door!,starPalace,doorPalace,doorRawPalace,timeStemRawPalace};
  const trace=[`${dun==='yang'?'阳':'阴'}遁${number}局，地盘戊从${number}宫起，${sign===1?'顺':'逆'}九宫数序布戊己庚辛壬癸丁丙乙。`,`${hour}时属于${xun}旬，六甲隐于${hiddenStem}；旬首仪在原${origin}宫${origin===5?'，中五寄坤二宫':''}。`,`值符星为${chief.star}，值使门为${chief.door}；时干${hour[0]==='甲'?`甲用旬首仪${hiddenStem}定位`:hour[0]}在地盘原${timeStemRawPalace}宫，值符随时干到${starPalace}宫。`,`天盘与九星在外八宫环整体转${starSteps}格；天禽及中五仪随天芮一起转动，中央不另布活动星门神。`,`从旬首原${origin}宫起${sign===1?'顺':'逆'}九宫数序计${hourOffset}个时辰，到原${doorRawPalace}宫${doorRawPalace===5?'后寄坤二宫':''}，值使${chief.door}落${doorPalace}宫；八门在外环整体转${doorSteps}格。`,`八神从值符落${starPalace}宫起，${sign===1?'顺':'逆'}外八宫环排值符、螣蛇、太阴、六合、白虎、玄武、九地、九天。`,`${xun}旬缺${emptyBranches.join('')}，仅按时旬空映射相应方位宫，不裁定真空假空。`];
  return{palaces,chief,starSteps,doorSteps,hourOffset,emptyBranches,trace};
}
export function calculateQimen(raw:unknown):QimenResult{
  const input=normalizeQimenInput(raw),[y,m,d]=input.dateTime.slice(0,10).split('-').map(Number),[h,min,s]=input.dateTime.slice(11).split(':').map(Number),lunar=Solar.fromYmdHms(y,m,d,h,min,s).getLunar();
  const calendarApi=lunar as unknown as {getPrevJieQi(wholeDay:boolean):{getName():string;getSolar():{toYmdHms():string}}};
  const ec=lunar.getEightChar() as unknown as {setSect(n:number):void;getDay():string;getYear():string;getMonth():string};ec.setSect(input.lateZiPolicy==='midnight'?2:1);
  const day=ec.getDay(),dayStemIndex=STEMS.indexOf(day[0]),hourBranchIndex=Math.floor((h+1)/2)%12,hour=STEMS[(2*(dayStemIndex%5)+hourBranchIndex)%10]+BRANCHES[hourBranchIndex];
  const termInfo=calendarApi.getPrevJieQi(false),term=termInfo.getName(),termAt=termInfo.getSolar().toYmdHms().replace(' ','T'),termRule=TERM_JU[term];if(!termRule)throw new QimenError('节气暂无法定局，请核对资料',422);
  const yuan=yuanFor(day),automaticNumber=termRule.numbers[yuan.yuanIndex],dun=input.method==='manual'?input.manualDun!:termRule.dun,number=input.method==='manual'?input.manualJu!:automaticNumber;
  const board=buildQimenBoard(dun,number,hour),label=`${dun==='yang'?'阳':'阴'}遁${number}局`,ju={label,dun,number,method:input.method,yuan:yuan.yuan,fuTou:yuan.fuTou,term,termAt,automaticDun:termRule.dun,automaticNumber};
  const calendar={lunar:`${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,year:ec.getYear(),month:ec.getMonth(),day,hour};
  const trace=[`北京时间${input.dateTime}；${input.lateZiPolicy==='midnight'?'公历午夜':'23点子初'}换日，时干由所选日干按五鼠遁计算。`,`${term}于北京时间${termAt}交节；日${day}的五日符头为${yuan.fuTou}，属${yuan.yuan}，拆补参考为${termRule.dun==='yang'?'阳':'阴'}遁${automaticNumber}局。`,...(input.method==='manual'?[`本次为手动核对，用户指定${label}；保留拆补参考，但不冒充自动局或其他流派算法。`]:[]),...board.trace];
  const evidence:QimenResult['evidence']=[
    {id:'calendar:time',label:'起盘时间与干支',detail:`北京时间${input.dateTime}，${calendar.year}年、${calendar.month}月、${day}日、${hour}时；${input.lateZiPolicy==='midnight'?'午夜':'子初'}换日，时干随所选日干五鼠遁，未校正真太阳时。`,sourceUrl:QIMEN_SOURCES.ju},
    {id:'ju:method',label:'节气三元与定局',detail:trace.slice(1,input.method==='manual'?3:2).join(' '),sourceUrl:QIMEN_SOURCES.ju},
    {id:'chief:placement',label:'旬首、值符与值使',detail:board.trace.slice(1,5).join(' '),sourceUrl:QIMEN_SOURCES.ju},
    {id:'board:policy',label:'转盘与中宫寄宫口径',detail:'时家转盘，阴阳均寄坤，天禽及中五仪随天芮；九星天盘和八门沿外环整体转动，八神阳顺阴逆。值使从旬首原始九宫数序计时，到位后才处理寄宫；不先将起点5映成2。白虎、玄武对应古籍勾陈、朱雀下神名称。',sourceUrl:QIMEN_SOURCES.basic},
    ...board.palaces.map(p=>({id:`palace:${p.number}`,label:`${p.name}${p.number}宫依据`,detail:`${p.direction}${p.element}，地盘${p.earthStem}；${p.number===5?'中五仪寄坤并随天禽转动，中央没有独立八门八神。':`天盘${p.heavenStems.join('、')}，星${p.stars.join('、')}，门${p.door}，神${p.god}；原星盘来自${p.starSource}宫，原门来自${p.doorSource}宫。`}${p.markers.join('、')}${p.emptyBranches.length?`（${p.emptyBranches.join('')}）`:''}；标签不是吉凶判定。`,sourceUrl:QIMEN_SOURCES.basic})),
  ];
  const result:QimenResult={...board,version:QIMEN_VERSION,input,ju,calendar,trace,evidence,warnings:['采用时家转盘拆补法，阴阳俱寄坤；不混用置闰、茅山、飞盘或年日月家奇门。','手动局数只用于核对，不代表程序已经实现其他定局流派；时间干支与拆补参考仍保留。','九宫方位南上北下；天禽及中五仪随天芮，原中五地盘仪保留可查，不重复布门神。','本阶段作日时干定位、明确占类及宫门星仪条件复核；不作全部占类自动取用、格局效力、吉凶评分或精确应期裁决。','传统结构用于文化学习与观察，不保证现实结果；未内置完整格局断语或伪造原典原文。','时间为北京时间标准时，1900–2100年；实际交节采用项目现有历法计算，精度继承该库，不做真太阳时校正。']};
  result.reading=analyzeQimenReading(result);result.evidence.push(...readingEvidence(result.reading));return result;
}
