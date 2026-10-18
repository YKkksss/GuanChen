import { Solar } from 'lunar-javascript';
import { validateCalendarDate } from '@/lib/fortune-calendar/dates';
import { BRANCHES } from '@/lib/ziwei/constants';
import { MEIHUA_METHODS, MEIHUA_SOURCE, MEIHUA_VERSION, type Element,type Hexagram,type Line,type MeihuaInput,type MeihuaResult,type Trigram } from './types';
import { MeihuaError } from './error';
export { MeihuaError } from './error';
import { analyzeMeihuaReading, meihuaReadingEvidence } from './reading-engine';
import { MEIHUA_SEASON_POLICIES, MEIHUA_TIMING_TARGETS } from './reading-types';
import { MEIHUA_SCENARIOS } from './scenario-types';
import {TRIGRAMS} from './trigrams';
export {TRIGRAMS} from './trigrams';
// 行为上卦、列为下卦，顺序均为先天卦数；卦画内部统一从初爻到上爻。
const NUMBERS = [[1,10,13,25,44,6,33,12],[43,58,49,17,28,47,31,45],[14,38,30,21,50,64,56,35],[34,54,55,51,32,40,62,16],[9,61,37,42,57,59,53,20],[5,60,63,3,48,29,39,8],[26,41,22,27,18,4,52,23],[11,19,36,24,46,7,15,2]];
const NAMES = ['乾','坤','屯','蒙','需','讼','师','比','小畜','履','泰','否','同人','大有','谦','豫','随','蛊','临','观','噬嗑','贲','剥','复','无妄','大畜','颐','大过','坎','离','咸','恒','遯','大壮','晋','明夷','家人','睽','蹇','解','损','益','夬','姤','萃','升','困','井','革','鼎','震','艮','渐','归妹','丰','旅','巽','兑','涣','节','中孚','小过','既济','未济'];
function integer(raw:unknown,min:number,max:number,label:string) { if (typeof raw !== 'number' || !Number.isInteger(raw) || raw<min || raw>max) throw new MeihuaError(`${label}应为${min}–${max}之间的整数`); return raw; }
function bigNumber(raw:unknown) { if (typeof raw !== 'string' || !/^\d{1,30}$/.test(raw) || BigInt(raw) <= BigInt(0)) throw new MeihuaError('报数需为1–30位的正整数字符串'); return BigInt(raw).toString(); }
export function meihuaDateTime(raw:unknown) { if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(raw)) throw new MeihuaError('时间需使用北京时间 YYYY-MM-DDTHH:mm:ss'); const date=raw.slice(0,10); try { validateCalendarDate(date); } catch { throw new MeihuaError('起卦日期不存在'); } if (date<'1900-01-01'||date>'2100-12-31') throw new MeihuaError('起卦日期需在1900–2100年内'); const time=raw.slice(11).split(':').map(Number); if (time[0]>23||time[1]>59||(time[2]??0)>59) throw new MeihuaError('起卦时刻不正确'); return `${date}T${raw.slice(11,16)}:${String(time[2]??0).padStart(2,'0')}`; }
export function normalizeMeihuaInput(raw:unknown):MeihuaInput {
  if (!raw||typeof raw!=='object'||Array.isArray(raw)) throw new MeihuaError('请提交有效的起卦条件'); const v=raw as Record<string,unknown>;
  if (typeof v.method!=='string'||!Object.hasOwn(MEIHUA_METHODS,v.method)) throw new MeihuaError('起卦方式不正确');
  const mutualPolicy=v.mutualPolicy??'pure_changed'; if (mutualPolicy!=='middle_lines'&&mutualPolicy!=='pure_changed') throw new MeihuaError('互卦口径不正确');
  let input: MeihuaInput;
  if (v.method==='manual') input={method:'manual',mutualPolicy,upper:integer(v.upper,1,8,'上卦数'),lower:integer(v.lower,1,8,'下卦数'),movingLine:integer(v.movingLine,1,6,'动爻')};
  else if (v.method==='time') input={method:'time',mutualPolicy,dateTime:meihuaDateTime(v.dateTime)};
  else if (v.method==='objects') input={method:'objects',mutualPolicy,objectCount:bigNumber(v.objectCount),dateTime:meihuaDateTime(v.dateTime)};
  else {
    if (!Array.isArray(v.numbers)||v.numbers.length!==2) throw new MeihuaError('请提交两个报数'); const movingRule=v.movingRule??'sum'; if (movingRule!=='sum'&&movingRule!=='sum_hour') throw new MeihuaError('报数动爻口径不正确');
    input={method:'numbers',mutualPolicy,numbers:v.numbers.map(bigNumber),movingRule,...(movingRule==='sum_hour'?{dateTime:meihuaDateTime(v.dateTime)}:{})};
  }
  if (v.contextDateTime!==undefined) {
    if (input.dateTime) throw new MeihuaError('有起卦时刻时直接使用该时刻，不另混入季节参考时间');
    input.contextDateTime=meihuaDateTime(v.contextDateTime);
  }
  if (v.seasonPolicy!==undefined) {
    if (typeof v.seasonPolicy!=='string'||!Object.hasOwn(MEIHUA_SEASON_POLICIES,v.seasonPolicy)) throw new MeihuaError('季节月界口径不正确');
    input.seasonPolicy=v.seasonPolicy as MeihuaInput['seasonPolicy'];
  }
  if (v.timingTarget!==undefined) {
    if (typeof v.timingTarget!=='string'||!Object.hasOwn(MEIHUA_TIMING_TARGETS,v.timingTarget)) throw new MeihuaError('应期参考卦不正确');
    input.timingTarget=v.timingTarget as MeihuaInput['timingTarget'];
  }
  // 显式选择默认值与省略默认值采用同一份规范输入，避免重复保存同条件占问。
  input.seasonPolicy??='jie_month';input.timingTarget??='body';
  if (v.scenario !== undefined) {
    if (typeof v.scenario !== 'string' || !Object.hasOwn(MEIHUA_SCENARIOS, v.scenario)) throw new MeihuaError('占类选择不正确');
    // 未指定与省略采用同一规范输入；不从自由文本猜测占类。
    if (v.scenario !== 'none') input.scenario = v.scenario as MeihuaInput['scenario'];
  }
  return input;
}
export function remainder(value:bigint,mod:8|6) { const rem=Number(value%BigInt(mod)); return rem===0?mod:rem; }
export function hexagram(upper:number,lower:number):Hexagram { integer(upper,1,8,'上卦数');integer(lower,1,8,'下卦数'); const u=TRIGRAMS[upper-1],l=TRIGRAMS[lower-1],number=NUMBERS[upper-1][lower-1],name=NAMES[number-1]; return {number,name,fullName:upper===lower?`${u.name}为${u.image}`:`${u.image}${l.image}${name}`,upper:{...u,lines:[...u.lines]},lower:{...l,lines:[...l.lines]},lines:[...l.lines,...u.lines]}; }
export function hexagramFromLines(lines:Line[]) { if (lines.length!==6||lines.some(n=>n!==0&&n!==1)) throw new MeihuaError('六爻卦画格式不正确'); const upper=TRIGRAMS.find(t=>t.lines.join()===lines.slice(3).join())!,lower=TRIGRAMS.find(t=>t.lines.join()===lines.slice(0,3).join())!; return hexagram(upper.number,lower.number); }
export function elementRelationship(body:Element,use:Element) { const generating:Record<Element,Element>={金:'水',水:'木',木:'火',火:'土',土:'金'},controlling:Record<Element,Element>={金:'木',木:'土',土:'水',水:'火',火:'金'}; return body===use?'比和':generating[use]===body?'用生体':generating[body]===use?'体生用':controlling[use]===body?'用克体':'体克用'; }
export function calculateMeihua(raw:unknown):MeihuaResult {
  const input=normalizeMeihuaInput(raw),trace:string[]=[];let upper:number,lower:number,movingLine:number,calendar:MeihuaResult['calendar']=null;
  if (input.dateTime) { const [y,m,d]=input.dateTime.slice(0,10).split('-').map(Number),[h,min,sec]=input.dateTime.slice(11).split(':').map(Number),lunar=Solar.fromYmdHms(y,m,d,h,min,sec).getLunar(),branch=Math.floor((h+1)/2)%12;calendar={lunar:`${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,yearBranch:lunar.getYearZhi(),yearNumber:BRANCHES.indexOf(lunar.getYearZhi())+1,monthNumber:Math.abs(lunar.getMonth()),dayNumber:lunar.getDay(),hourBranch:BRANCHES[branch],hourNumber:branch+1,leapMonth:lunar.getMonth()<0}; }
  if (input.method==='manual') {upper=input.upper!;lower=input.lower!;movingLine=input.movingLine!;trace.push(`手动选择上卦${upper}、下卦${lower}，第${movingLine}爻动。`);}
  else if (input.method==='objects') {const count=BigInt(input.objectCount!),hour=BigInt(calendar!.hourNumber);upper=remainder(count,8);lower=remainder(hour,8);movingLine=remainder(count+hour,6);trace.push(`物数${count}除8取上卦${upper}；${calendar!.hourBranch}时数${hour}除8取下卦${lower}。`,`原始物数${count}+原时数${hour}=${count+hour}，除6得第${movingLine}爻动；不以取余后的上下卦数替代原数。`);}
  else if (input.method==='numbers') { const a=BigInt(input.numbers![0]),b=BigInt(input.numbers![1]),sum=a+b+(input.movingRule==='sum_hour'?BigInt(calendar!.hourNumber):BigInt(0));upper=remainder(a,8);lower=remainder(b,8);movingLine=remainder(sum,6);trace.push(`${a}除8取上卦${upper}；${b}除8取下卦${lower}。`,`${a}+${b}${input.movingRule==='sum_hour'?`+${calendar!.hourNumber}（${calendar!.hourBranch}时数）`:''}=${sum}，除6得第${movingLine}爻动。`); }
  else {const c=calendar!,sum=c.yearNumber+c.monthNumber+c.dayNumber,total=sum+c.hourNumber;upper=remainder(BigInt(sum),8);lower=remainder(BigInt(total),8);movingLine=remainder(BigInt(total),6);trace.push(`农历${c.lunar}：${c.yearBranch}年数${c.yearNumber}，月数${c.monthNumber}，日数${c.dayNumber}；${c.hourBranch}时数${c.hourNumber}。`,`${c.yearNumber}+${c.monthNumber}+${c.dayNumber}=${sum}，除8取上卦${upper}。`,`${sum}+${c.hourNumber}=${total}，除8取下卦${lower}，除6取第${movingLine}动爻。`);}
  const primary=hexagram(upper,lower),changedLines=[...primary.lines];changedLines[movingLine-1]=changedLines[movingLine-1]===1?0:1;const changed=hexagramFromLines(changedLines),pureChanged=input.mutualPolicy==='pure_changed'&&(primary.number===1||primary.number===2),mutualLines=pureChanged?changed.lines:primary.lines;
  const mutual=hexagramFromLines([...mutualLines.slice(1,4),...mutualLines.slice(2,5)]),bodyPosition=movingLine<=3?'upper':'lower',usePosition=bodyPosition==='upper'?'lower':'upper',body=primary[bodyPosition],use=primary[usePosition];
  trace.push('六爻从下向上编号；本卦只翻转所选动爻得到变卦。',`${pureChanged?'纯乾坤采用变卦':'采用本卦'}第2、3、4爻为下互，第3、4、5爻为上互。`,`${usePosition==='lower'?'下':'上'}卦含动爻为用，${bodyPosition==='upper'?'上':'下'}卦不动为体；变卦仍与本卦的固定体比较。`);
  const relations=[{id:'relation:primary',label:'本卦用与体',trigram:use,relationship:elementRelationship(body.element,use.element)},{id:'relation:mutual_lower',label:'下互与体',trigram:mutual.lower,relationship:elementRelationship(body.element,mutual.lower.element)},{id:'relation:mutual_upper',label:'上互与体',trigram:mutual.upper,relationship:elementRelationship(body.element,mutual.upper.element)},{id:'relation:changed',label:'变卦用与原体',trigram:changed[usePosition],relationship:elementRelationship(body.element,changed[usePosition].element)}];
  const evidence:MeihuaResult['evidence']=[{id:'method:input',label:'起卦计算过程',detail:trace.join(' '),sourceUrl:MEIHUA_SOURCE},{id:'gua:primary',label:'本卦与动爻',detail:`${primary.fullName}（第${primary.number}卦），上${primary.upper.name}、下${primary.lower.name}；第${movingLine}爻动，阴阳从下向上为${primary.lines.map(n=>n?'阳':'阴').join('、')}。`,sourceUrl:'https://zh.wikisource.org/wiki/周易'},{id:'gua:mutual',label:'互卦依据',detail:`${mutual.fullName}；${pureChanged?'纯乾坤取变卦中爻':'本卦中爻'}，下互取234、上互取345。`,sourceUrl:MEIHUA_SOURCE+'#互卦起例'},{id:'gua:changed',label:'变卦依据',detail:`仅翻转第${movingLine}爻得到${changed.fullName}，其余五爻保持。`,sourceUrl:MEIHUA_SOURCE+'#爻以六除'},...relations.map(r=>({id:r.id,label:r.label,detail:`原体为${body.name}${body.element}，比较${r.trigram.name}${r.trigram.element}，关系为${r.relationship}。五行关系不是事件的确定结果。`,sourceUrl:'https://zh.wikisource.org/wiki/梅花易數/卷二'}))];
  if(input.method==='objects') evidence.push({id:'method:objects',label:'物数配时起卦口径',detail:'以原始物数除八作上卦、原时数除八作下卦，以原始物数加原时数除六取单动爻。本版明确原数加时口径，不与物象方位的后天端法混同。',sourceUrl:MEIHUA_SOURCE+'#物數占例'});
  const result:MeihuaResult={version:MEIHUA_VERSION,input,primary,mutual,changed,movingLine,body:{position:bodyPosition,trigram:body},use:{position:usePosition,trigram:use},relations,trace,calendar,evidence,warnings:['卦象和五行关系属于传统文化观察，不保证现实结果；本版只列季节与条件应期参考，不裁定完整效力、精确日期或吉凶分数。','报数合数取爻与加时取爻是明确分开的口径；前者为公开简化法，不宣称是原书唯一规则。','互卦可选本卦中爻通用法，或纯乾坤取变卦中爻异例；这里保留六十四卦名称辅助对照。',...(calendar?['时间按北京时间标准时、公历午夜换日；23点仍属当日子时，年数按农历年支，月日按实际农历日期。',...(calendar.leapMonth?['本次为闰月，月数使用同名农历月数，不额外加一；其他闰月流派需要另行核对。']:[])]:[])]};
  result.reading=analyzeMeihuaReading(result);result.evidence.push(...meihuaReadingEvidence(result.reading));
  return result;
}
export function beijingDateTime(now=new Date()) { const f=new Intl.DateTimeFormat('sv-SE',{timeZone:'Etc/GMT-8',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});return f.format(now).replace(' ','T'); }
