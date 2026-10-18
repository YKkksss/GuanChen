import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerUser, createSession, closeAccountConnections, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { createBaziBirthProfile, deleteBaziBirthProfile } from '../lib/db/bazi';
import { createElectionPlan, getElectionPlan, updateElectionPlan } from '../lib/db/election';
import { calculateBazi } from '../lib/bazi/engine';
import type { BaziCalculationResult } from '../lib/bazi/types';
import { resolveCivilTimeUtcCandidates } from '../lib/rectification/time-service';
import { calculateElection } from '../lib/election/engine';
import { calculateElectionHours } from '../lib/election/hours';
import { calculatePersonalElection, calculatePersonalElectionHours } from '../lib/election/personal-service';
import { normalizePersonalElectionInput } from '../lib/election/personal-rules';
import { buildPersonalElectionLuckSnapshot, assessPersonalElectionLuck, personalElectionLuckCuts } from '../lib/election/personal-luck-engine';
import { PERSONAL_ELECTION_LUCK_VERSION, PERSONAL_ELECTION_LUCK_HOURS_VERSION, type PersonalElectionLuckAssessment, type PersonalElectionLuckSnapshot } from '../lib/election/personal-luck-types';
import { PERSONAL_ELECTION_LEGACY_VERSION, PERSONAL_ELECTION_VERSION, type PersonalElectionInput, type PersonalElectionParticipantSnapshot, type PersonalElectionSnapshot } from '../lib/election/personal-types';
import type { ElectionInput } from '../lib/election/types';
import { POST as preview } from '../app/api/election/preview/route';
import { POST as hours } from '../app/api/election/hours/route';
import { POST as save } from '../app/api/election/route';
import { GET as read, PATCH as patch } from '../app/api/election/[id]/route';

// 所有账号、命盘与方案均在系统临时目录内合成；本专项禁止网络和真实 AI 调用。
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-election-luck-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); checks++; }
function rejects(work: () => unknown, label: string) { assert.throws(work, label); checks++; }
function conflict409(work: () => unknown, label: string) { assert.throws(work,(error: unknown)=>error instanceof Error&&'status' in error&&error.status===409,label); checks++; }
function choice(chartId: string, extra: Partial<PersonalElectionInput> = {}): PersonalElectionInput {
  return { participants:[{chartId,preferredElements:[],cautiousElements:[],basisNote:''}],avoidDayYearClash:false,avoidDayBranchClash:false,avoidHourYearClash:false,avoidHourBranchClash:false,filterStems:false,includeLuckContext:true,...extra };
}
function input(date: string, personal?: PersonalElectionInput): ElectionInput {
  return {event:'marriage',startDate:date,endDate:date,ruleMode:'compare',weekdays:[0,1,2,3,4,5,6],excludedZodiacs:[],...(personal ? {personal} : {})};
}
const officialChart = () => calculateBazi({birthDate:'2022-03-09',birthTime:'20:51',gender:'male',timeZoneId:'Asia/Shanghai',timeStandard:'civil_time'});
function person(luck: PersonalElectionLuckSnapshot, id='00000000-0000-4000-8000-000000000001'): PersonalElectionParticipantSnapshot {
  return {...choice(id).participants[0],profileId:id.replace(/.$/,'9'),displayName:`合成岁运${id.slice(-1)}`,chartFingerprint:`synthetic-${id}`,chartMethodologyVersion:'synthetic-chart',chartEngineVersion:'synthetic-chart-engine',unknownTime:luck.status==='withheld_unknown_time',policyLabel:'合成服务端规则资料',
    pillars:[{key:'year',label:'年柱',stem:'甲',branch:'子'},{key:'month',label:'月柱',stem:'丙',branch:'寅'},{key:'day',label:'日柱',stem:luck.dayMasterStem,branch:'辰'},{key:'time',label:'时柱',stem:'庚',branch:'午'}],
    climateReference:{version:'synthetic',label:'合成参考',scope:'仅测试',detail:'候选未作为确定喜忌'},luck};
}
function layer(assessment: PersonalElectionLuckAssessment, key: 'annual'|'month'|'luck_cycle', index=0) { return assessment.segments[index].layers.find(item=>item.key===key)?.ganZhi; }
function request(token: string|undefined, body?: unknown, method='POST') {
  return new Request('http://local/api/election', {method,headers:{'Content-Type':'application/json',...(token?{cookie:`${SESSION_COOKIE}=${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
function syntheticSnapshot(luck: PersonalElectionLuckSnapshot, second?: PersonalElectionLuckSnapshot): PersonalElectionSnapshot {
  const participants=[person(luck),...(second?[person(second,'00000000-0000-4000-8000-000000000002')]:[])];
  const conditions=choice(participants[0].chartId,{participants:participants.map(({chartId,preferredElements,cautiousElements,basisNote})=>({chartId,preferredElements,cautiousElements,basisNote}))});
  return {version:PERSONAL_ELECTION_VERSION,source:'https://example.invalid/server-synthetic',input:conditions,participants};
}
function basicRules() {
  const chart=officialChart(),snapshot=buildPersonalElectionLuckSnapshot(chart),p=person(snapshot);
  equal(snapshot.status,'complete','官方顺排案例可以生成精确岁运背景');
  equal(snapshot.version,PERSONAL_ELECTION_LUCK_VERSION,'岁运背景快照带独立规则版本');
  check(snapshot.methodologyVersion.length>0&&snapshot.engineVersion.length>0&&snapshot.relationVersion.length>0&&snapshot.relationEngineVersion.length>0&&snapshot.tenGodMethodologyVersion.length>0&&snapshot.tenGodEngineVersion.length>0,'排期、关系与十神的方法和引擎版本均保存');
  equal(snapshot.cycles[0],{index:1,ganZhi:'甲辰',startAt:'2030-12-12 06:51:00',endAtExclusive:'2040-12-12 06:51:00'},'复用官方 Yun 流派 2 已知起运案例，保留前闭后开边界');
  check(!('input' in snapshot)&&!('longitude' in snapshot)&&!('locationLabel' in snapshot),'个人岁运最小快照不携带完整出生输入、经纬度或地点');
  const birth=assessPersonalElectionLuck(p,'2022-03-09','甲子','day');
  equal(birth.segments.map(s=>s.luck.kind),['pre_birth','pre_luck'],'出生当日按真实出生时刻划分，不把出生前当作未交运');
  equal(birth.segments[0].endAtExclusive,'2022-03-09 20:51:00','出生秒界前段止于出生时刻');
  equal(birth.segments[1].startAt,'2022-03-09 20:51:00','出生时刻属于出生后段');
  check(birth.segments[0].layers.every(l=>l.eventRelations.length===0)&&birth.segments[0].backgroundRelations.length===0,'出生前只保留日历形式角色，撤回个人关系适用判断');
  const first=assessPersonalElectionLuck(p,'2030-12-12','甲子','day');
  equal(first.segments.map(s=>s.luck.kind),['pre_luck','active'],'首运当日精确区分未交运与第一步大运');
  equal(layer(first,'luck_cycle',0),undefined,'首运前不提前赋予第一步大运');
  equal(layer(first,'luck_cycle',1),'甲辰','首运时刻开始消费第一步大运');
  const at=6*3600+51*60;
  equal(assessPersonalElectionLuck(p,'2030-12-12','甲子','hour',at-1,at).segments[0].luck.kind,'pre_luck','交运前一秒仍未交运');
  equal(assessPersonalElectionLuck(p,'2030-12-12','甲子','hour',at,at+1).segments[0].luck.kind,'active','交运精确秒属于新运');
  const next=assessPersonalElectionLuck(p,'2040-12-12','甲子','day');
  equal(next.segments.map(s=>s.luck.ganZhi),['甲辰','乙巳'],'交运日不以整日覆盖前一步运');
  const truncated={...snapshot,cycles:snapshot.cycles.slice(0,1)},expired=assessPersonalElectionLuck(person(truncated),'2041-01-01','甲子','day');
  equal(expired.segments[0].luck.kind,'out_of_range','已保存末步结束后不无期限延长大运');
  equal(layer(expired,'luck_cycle'),undefined,'末步后仍可列年月份但不补造大运');

  const spring=assessPersonalElectionLuck(p,'2026-02-04','甲子','day');
  equal(spring.segments.map(s=>[s.startAt,s.endAtExclusive]),[['2026-02-04 00:00:00','2026-02-04 04:02:08'],['2026-02-04 04:02:08','2026-02-05 00:00:00']],'立春按已知 04:02:08 秒界分段');
  equal(spring.segments.map((_,i)=>[layer(spring,'annual',i),layer(spring,'month',i)]),[['乙巳','己丑'],['丙午','庚寅']],'立春前后同时切换精确流年与节令月');
  equal(layer(assessPersonalElectionLuck(p,'2026-02-04','甲子','hour',14527,14528),'annual'),'乙巳','立春前一秒仍是上一流年');
  equal(layer(assessPersonalElectionLuck(p,'2026-02-04','甲子','hour',14528,14529),'annual'),'丙午','立春精确秒进入新流年');
  const jie=assessPersonalElectionLuck(p,'2030-03-05','甲子','day');
  equal(jie.segments.map(s=>s.startAt),['2030-03-05 00:00:00','2030-03-05 21:03:18'],'惊蛰采用已知精确节界而非整点或正午');
  equal(jie.segments.map((_,i)=>layer(jie,'month',i)),['戊寅','己卯'],'惊蛰只切月份，不误换流年');
  check(jie.segments.every((_,i)=>layer(jie,'annual',i)==='庚戌'),'惊蛰前后流年保持同一干支');
  const middle=assessPersonalElectionLuck(p,'2026-03-20','甲子','day');
  equal(middle.segments.length,1,'中气日不冒充换月节界');
  check(personalElectionLuckCuts({participants:[p]},'2030-12-12').includes(at),'当日额外交运切点可供吉时分段');
  check(personalElectionLuckCuts({participants:[p]},'2022-03-09').includes(20*3600+51*60),'出生当天暴露出生切点');
  check(!personalElectionLuckCuts({participants:[p]},'2030-12-13').some(n=>n!==0&&n!==86400),'无交运日期不混入其他日期的时刻');

  // 甲日主的十神采用独立的固定对照，而不是从被测引擎复制公式。
  const gods=['比肩','劫财','食神','伤官','偏财','正财','七杀','正官','偏印','正印'];
  [...'甲乙丙丁戊己庚辛壬癸'].forEach((stem,i)=>{
    const result=assessPersonalElectionLuck(person({...snapshot,dayMasterStem:'甲'}),'2031-06-01',`${stem}${i%2?'丑':'子'}`,'day');
    equal(result.targetTenGod,gods[i],`甲日主与用事干${stem}的十神独立校验`);
    check(result.segments[0].layers.every(s=>gods.includes(s.tenGod)),'各背景层十神属于确定角色，不输出运势评分');
  });
  // 选择已知甲辰大运，使用独立固定关系表校验用事干支，而不依赖库的关系输出构造预期。
  const cyclePerson=person({...snapshot,cycles:[{index:1,ganZhi:'甲辰',startAt:'2025-01-01 00:00:00',endAtExclusive:'2035-01-01 00:00:00'}]});
  [...'甲乙丙丁戊己庚辛壬癸'].forEach((stem,i)=>{
    const target=`${stem}${i%2?'丑':'子'}`,r=assessPersonalElectionLuck(cyclePerson,'2031-06-01',target,'day').segments[0].layers.find(l=>l.key==='luck_cycle')!.eventRelations;
    equal(r.some(v=>v.label==='天干五合'),stem==='己','用事干与甲运干仅己干形成五合位置');
  });
  [...'子丑寅卯辰巳午未申酉戌亥'].forEach((branch,i)=>{
    const r=assessPersonalElectionLuck(cyclePerson,'2031-06-01',`${i%2?'乙':'甲'}${branch}`,'hour').segments[0].layers.find(l=>l.key==='luck_cycle')!.eventRelations;
    equal(r.some(v=>v.label==='地支六合'),branch==='酉','用事支与辰运支仅酉构成六合位置');
    equal(r.some(v=>v.label==='地支六冲'),branch==='戌','用事支与辰运支仅戌构成六冲位置');
    equal(r.some(v=>v.label==='地支相同'),branch==='辰','用事支与辰运支同支只列实际重复');
    check(r.every(v=>v.detail.includes('用事时')),'时层关系明确标注用事时而非冒充流日');
  });
  const unknown=buildPersonalElectionLuckSnapshot(calculateBazi({birthDate:'1999-06-07',unknownTime:true,gender:'male'}));
  equal(unknown.status,'withheld_unknown_time','缺时不生成精确交运快照');
  check(unknown.cycles.every(c=>c.startAt===null&&c.endAtExclusive===null),'缺时不补精确起止日期');
  for(const day of ['1999-06-07','2026-10-16']) {
    const result=assessPersonalElectionLuck(person(unknown),day,'甲子','day');
    check(result.segments.every(s=>!s.layers.some(l=>l.key==='luck_cycle')),'缺时背景不偷用暂定大运序列');
    check(result.warnings.length>0,'缺时用户可见撤回依据');
  }
  equal(assessPersonalElectionLuck(person(unknown),'1999-06-07','甲子','day').segments[0].luck.kind,'birth_time_unknown','缺时出生当天明确出生时刻未定');
  for(const raw of [
    {birthDate:'1988-07-01',birthTime:'12:00',gender:'male',timeZoneId:'Asia/Shanghai'},
    {birthDate:'2022-03-09',birthTime:'20:51',gender:'male',timeZoneId:'America/New_York'},
  ] as const) {
    const withheld=buildPersonalElectionLuckSnapshot(calculateBazi(raw));
    equal(withheld.status,'withheld_unsupported_clock','上海夏令时和非固定东八区均撤回当前精确排期');
    check(withheld.cycles.every(c=>c.startAt===null&&c.endAtExclusive===null),'不支持的时钟不泄露看似有效的精确交运日期');
    const shifted=(days:number)=>new Date(Date.parse(`${raw.birthDate}T00:00:00Z`)+days*86400000).toISOString().slice(0,10);
    for(const [offset,kind] of [[-2,'pre_birth'],[-1,'birth_time_unknown'],[0,'birth_time_unknown'],[1,'birth_time_unknown'],[2,'unavailable']] as const) {
      const background=assessPersonalElectionLuck(person(withheld),shifted(offset),'甲子','day');
      check(background.segments.every(s=>s.luck.kind===kind),'未校准时区以相邻三日保守窗口判断出生前后，不直接比较异区墙钟');
      if(kind!=='unavailable')check(background.segments.every(s=>s.backgroundRelations.length===0&&s.layers.every(l=>l.eventRelations.length===0)),'不支持的时钟在出生前及出生窗口内不输出个人适用关系');
    }
    equal(personalElectionLuckCuts({participants:[person(withheld)]},raw.birthDate),[0,86400],'未校准出生时钟不作为精确时段切点');
  }
  const folded={birthDate:'1991-09-15',birthTime:'01:30',gender:'male',timeZoneId:'Asia/Shanghai',timeStandard:'civil_time'} as const;
  equal(resolveCivilTimeUtcCandidates({date:folded.birthDate,time:folded.birthTime,timeZoneId:folded.timeZoneId}).map(c=>c.utcOffsetMinutes),[540,480],'上海回拨重复时刻同时含夏令时及标准时两个候选，不能只看一次东八区回转');
  const foldedSnapshot=buildPersonalElectionLuckSnapshot(calculateBazi(folded));
  equal(foldedSnapshot.status,'withheld_unsupported_clock','1991 年上海 01:30 回拨歧义撤回精确排期');
  equal(foldedSnapshot.cycles,[],'回拨歧义不产生看似确定的精确交运表');
  const uniqueAfterFold={...folded,birthTime:'02:30'};
  equal(resolveCivilTimeUtcCandidates({date:uniqueAfterFold.birthDate,time:uniqueAfterFold.birthTime,timeZoneId:uniqueAfterFold.timeZoneId}).map(c=>c.utcOffsetMinutes),[480],'回拨后同日 02:30 已是唯一东八区时刻');
  equal(buildPersonalElectionLuckSnapshot(calculateBazi(uniqueAfterFold)).status,'complete','不把回拨当天所有唯一标准时刻一律撤回');
  const gap={...folded,birthDate:'1991-04-14',birthTime:'02:30'};
  equal(resolveCivilTimeUtcCandidates({date:gap.birthDate,time:gap.birthTime,timeZoneId:gap.timeZoneId}),[],'上海春季跳时区间的 02:30 不存在任何 UTC 候选');
  const gapSnapshot=buildPersonalElectionLuckSnapshot(calculateBazi(gap));
  equal(gapSnapshot.status,'withheld_unsupported_clock','不存在的民用时刻不能生成精确岁运归属');
  equal(gapSnapshot.cycles,[],'跳时缺失时刻不补造交运表');
  const solar=buildPersonalElectionLuckSnapshot(calculateBazi({birthDate:'2022-03-09',birthTime:'20:51',gender:'male',timeZoneId:'Asia/Shanghai',timeStandard:'apparent_solar_time',longitude:116.4}));
  equal(solar.status,'complete','年月份一致的真太阳时版本仍以民用出生瞬间计算起运，不二次校正用事时间');
  equal(solar.cycles[0].startAt,snapshot.cycles[0].startAt,'真太阳时不重复修正实际出生瞬间与大运交接');
  const conflict=structuredClone(chart) as BaziCalculationResult;
  conflict.pillars.month.ganZhi='乙卯';conflict.pillars.month.stem='乙';conflict.pillars.month.branch='卯';
  const conflicting=buildPersonalElectionLuckSnapshot(conflict);
  equal(conflicting.status,'withheld_chart_time_basis_conflict','已存月柱与民用时间计算冲突时撤回精确岁运');
  const conflictBirth=assessPersonalElectionLuck(person(conflicting),'2022-03-09','甲子','day');
  equal(conflictBirth.segments.map(s=>s.luck.kind),['pre_birth','unavailable'],'年月柱冲突时仍保留已经校准的真实出生边界');
  check(conflictBirth.segments[0].backgroundRelations.length===0&&conflictBirth.segments[0].layers.every(l=>l.eventRelations.length===0),'排盘口径冲突不能绕过出生前个人关系禁用');
  equal(conflictBirth.segments[1].startAt,'2022-03-09 20:51:00','冲突快照出生后的不可用段仍准确起于民用出生瞬间');
  const actualSolarConflict=buildPersonalElectionLuckSnapshot(calculateBazi({birthDate:'2026-02-04',birthTime:'04:30',gender:'male',timeZoneId:'Asia/Shanghai',timeStandard:'apparent_solar_time',longitude:75}));
  equal(actualSolarConflict.status,'withheld_chart_time_basis_conflict','真实太阳时跨立春案例撤回精确排期，而非只依赖篡改快照样本');
  for(const key of ['version','methodologyVersion','engineVersion','relationVersion','relationEngineVersion','tenGodMethodologyVersion','tenGodEngineVersion'] as const) {
    const obsolete=person({...snapshot,[key]:'obsolete-test-version'});
    conflict409(()=>assessPersonalElectionLuck(obsolete,'2031-06-01','甲子','day'),'背景、排期及关系版本失配统一阻止混用');
    conflict409(()=>personalElectionLuckCuts({participants:[obsolete]},'2031-06-01'),'时段切点也校验保存版本，不能在旧规则上重算');
  }
  const {luck:_discarded,...withoutLuck}=p;
  conflict409(()=>assessPersonalElectionLuck(withoutLuck,'2031-06-01','甲子','day'),'缺少保存背景时不根据命盘四柱反推交运日期');
  for(const bad of [null,1,'true',[],{}]) rejects(()=>normalizePersonalElectionInput({...choice(randomUUID()),includeLuckContext:bad}),'岁运背景开关只允许布尔值');
}

function segmentedHours() {
  const raw={...buildPersonalElectionLuckSnapshot(officialChart()),dayMasterStem:'甲'},other={...structuredClone(raw),dayMasterStem:'乙'};
  other.cycles=other.cycles.map((cycle,i)=>({...cycle,startAt:`${2030+i*10}-12-12 07:02:00`,endAtExclusive:`${2040+i*10}-12-12 07:02:00`}));
  const snapshot=syntheticSnapshot(raw,other),date='2030-12-12',conditions=input(date,snapshot.input),result=calculatePersonalElectionHours(conditions,date,snapshot),base=calculateElectionHours(input(date),date);
  equal(result.version,PERSONAL_ELECTION_LUCK_HOURS_VERSION,'启用岁运的吉时使用新分段规则版本');
  equal(result.slots.length,base.slots.length+2,'两人不同交运时刻分别补齐切点');
  check(result.slots.some(s=>s.startSecond===24660)&&result.slots.some(s=>s.startSecond===25320),'两人交运秒界共同出现在时段边界');
  equal(result.slots[0].startSecond,0,'分段从当天零点开始');
  equal(result.slots.at(-1)?.endSecond,86400,'分段覆盖至次日零点');
  result.slots.forEach((slot,i)=>{
    if(i)equal(slot.startSecond,result.slots[i-1].endSecond,'多人切点合并后无间隙和重叠');
    check(slot.startSecond<slot.endSecond,'所有分段保持正时长');
    const original=base.slots.find(s=>s.startSecond<=slot.startSecond&&s.endSecond>slot.startSecond)!;
    equal([slot.status,slot.baseStatus],[original.status,original.status],'岁运关系只提供背景，不影响黄历或自动排除');
    equal([slot.yi,slot.ji,slot.dayRules],[original.yi,original.ji,original.dayRules],'额外交运切段保留原黄历日时宜忌');
    equal(slot.personal?.targetGanZhi,slot.timeGanZhi,'时层关系按实际用事时干支');
    equal(slot.personalDay?.targetGanZhi,slot.civilDayGanZhi,'日层关系始终使用本公历日干支');
    check(slot.personal?.participants.every(p=>p.luck?.segments.length===1),'每位参与者每个时段只消费该时段背景');
  });
  const before=result.slots.find(s=>s.endSecond===24660)!,after=result.slots.find(s=>s.startSecond===24660)!,second=result.slots.find(s=>s.startSecond===25320)!;
  equal(before.personal!.participants.map(p=>p.luck!.segments[0].luck.kind),['pre_luck','pre_luck'],'第一位交运前两位均未交运');
  equal(after.personal!.participants.map(p=>p.luck!.segments[0].luck.kind),['active','pre_luck'],'第一位交运不提前改变第二位');
  equal(second.personal!.participants.map(p=>p.luck!.segments[0].luck.kind),['active','active'],'第二位交运后各自进入对应大运');
  const roleSlot=result.slots.find(s=>s.timeGanZhi.startsWith('甲'))??result.slots[0];
  check(roleSlot.personal!.participants[0].luck!.targetTenGod!==roleSlot.personal!.participants[1].luck!.targetTenGod,'同一用事干按两人各自本命日主计算角色，不合并成共同十神');
  const late=result.slots.at(-1)!;
  check(late.lateZi&&late.civilDayGanZhi!==late.timeRuleDayGanZhi,'晚子仍保留公历日和时规则日差异');
  equal(late.personalDay!.targetGanZhi,late.civilDayGanZhi,'岁运联动不把晚子日条件偷换为次日');
  const natalOnly=calculatePersonalElectionHours(input(date,{...snapshot.input,includeLuckContext:undefined}),date,{...snapshot,input:{...snapshot.input,includeLuckContext:undefined},participants:snapshot.participants.map(({luck,...p})=>p)});
  equal(natalOnly.slots.length,base.slots.length,'未启用岁运时不增加交运切段');
  check(natalOnly.slots.every(s=>s.personal!.participants.every(p=>!p.luck)),'原局关系模式不偷偷计算个人岁运');
  const stale=structuredClone(snapshot);stale.version=PERSONAL_ELECTION_LEGACY_VERSION;
  conflict409(()=>calculatePersonalElectionHours(conditions,date,stale),'v1 方案不能借输入参数临时开启新岁运');
  const incomplete=structuredClone(snapshot);delete incomplete.participants[1].luck;
  conflict409(()=>calculatePersonalElectionHours(conditions,date,incomplete),'双人模式缺少任一人岁运资料时拒绝静默降级');
}

async function main() {
  const a=await registerUser({username:'luck-a',password:randomUUID(),displayName:'岁运专项甲'}),b=await registerUser({username:'luck-b',password:randomUUID(),displayName:'岁运专项乙'}),tokenA=createSession(a.id),tokenB=createSession(b.id);
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('岁运专项禁止网络和 AI 调用');};
  try {
    basicRules();segmentedHours();
    let profileId='',chartId='',planId='',legacyId='';
    let ownInput: ElectionInput;
    await runAsUser(a,async()=>{
      const profile=createBaziBirthProfile({displayName:'合成岁运主事人',birthDate:'2022-03-09',birthTime:'20:51',gender:'male',timeZoneId:'Asia/Shanghai',locationLabel:'不可泄露地点',notes:'不可泄露备注',initialChart:{timeStandard:'civil_time',lateZiPolicy:'same_day'}});
      profileId=profile.id;chartId=profile.charts[0].id;ownInput=input('2030-12-12',choice(chartId));
      const result=calculatePersonalElection(ownInput),base=calculateElection(input('2030-12-12'));
      equal(result.personal?.participants[0].luck?.cycles[0].startAt,'2030-12-12 06:51:00','新方案从当前账号保存的命盘建立岁运资料');
      check(!JSON.stringify(result).includes('不可泄露'),'日结果不携带来源地点与私密备注');
      equal(result.days[0].status,base.days[0].status,'显示大运流年月背景不改变日期黄历状态');
      check(result.days[0].personal?.participants[0].luck?.segments.length===2,'日期结果保留交运当天两个背景');
      const filtered={...ownInput,endDate:'2030-12-24',personal:choice(chartId,{avoidDayYearClash:true,avoidHourBranchClash:true})},filteredLuck=calculatePersonalElection(filtered),filteredPlain=calculatePersonalElection({...filtered,personal:{...filtered.personal,includeLuckContext:undefined}});
      equal(filteredLuck.days.map(d=>[d.status,d.reasons]),filteredPlain.days.map(d=>[d.status,d.reasons]),'岁运展示不新增、抵消或改写显式原局避冲条件');
      check(filteredLuck.days.some(d=>d.personal?.excluded),'多日样本实际触发至少一次人工选定避冲，避免空验证');
      equal(filteredLuck.counts,filteredPlain.counts,'岁运展示不改变筛选数量统计');
      const dayHours=calculatePersonalElectionHours(ownInput,'2030-12-12'),slot=dayHours.slots.find(s=>s.startSecond===24660)!;
      const created=createElectionPlan({title:'合成岁运保存方案',input:ownInput,selectedTimes:[{date:'2030-12-12',slotId:slot.id}]});planId=created.plan.id;
      equal(created.plan.selectedTimes[0].version,PERSONAL_ELECTION_LUCK_HOURS_VERSION,'保存所选时段使用岁运分段版本');
      const originalResult=JSON.stringify(created.plan.result),originalTime=JSON.stringify(created.plan.selectedTimes[0]);
      const legacyInput=input('2030-12-12',choice(chartId,{includeLuckContext:undefined})),legacy=createElectionPlan({title:'合成 v1 历史方案',input:legacyInput});legacyId=legacy.plan.id;
      // 只修改本专项临时库，模拟真实升级前保存的 v1 数据，确认升级不补写旧依据。
      const legacyResult=structuredClone(legacy.plan.result);legacyResult.personal!.version=PERSONAL_ELECTION_LEGACY_VERSION;
      getDatabase().prepare('UPDATE election_plans SET result_json = ? WHERE id = ?').run(JSON.stringify(legacyResult),legacyId);
      const beforeLegacy=JSON.stringify(getElectionPlan(legacyId)!.result);
      check(deleteBaziBirthProfile(profileId),'测试来源档案可删除');
      equal(JSON.stringify(getElectionPlan(planId)!.result),originalResult,'来源删除后结果按原快照回看');
      equal(JSON.stringify(getElectionPlan(planId)!.selectedTimes[0]),originalTime,'来源删除后已有时段不重算');
      const fresh=calculatePersonalElectionHours(ownInput,'2030-12-12',getElectionPlan(planId)!.result.personal),added=fresh.slots.find(s=>s.startSecond===25200)!;
      const updated=updateElectionPlan(planId,{selectedTimes:[{date:'2030-12-12',slotId:slot.id},{date:'2030-12-12',slotId:added.id}]});
      equal(JSON.stringify(updated.selectedTimes[0]),originalTime,'新增时段保留既有选择原始快照');
      check(updated.selectedTimes[1].slot.personal?.participants[0].luck?.segments[0].luck.kind==='active','新增时段可在源盘删除后从保存岁运资料复算');
      equal(JSON.stringify(updated.result),originalResult,'新增时段不改旧日结果依据');
      const oldHours=calculatePersonalElectionHours(legacyInput,'2030-12-12',getElectionPlan(legacyId)!.result.personal);
      check(oldHours.slots.every(s=>s.personal?.participants.every(p=>!p.luck)),'v1 方案继续查询时段但不自动添加新岁运背景');
      const oldUpdated=updateElectionPlan(legacyId,{selectedTimes:[{date:'2030-12-12',slotId:oldHours.slots[0].id}]});
      equal(JSON.stringify(oldUpdated.result),beforeLegacy,'v1 新增原规则时段不改写历史结果');
      check(!oldUpdated.selectedTimes[0].slot.personal!.participants[0].luck,'v1 新时段仍只保留原局个人依据');
      rejects(()=>calculatePersonalElection(ownInput),'删源后新建预览必须重新选择可用来源，不能挪用历史快照');
      closeDatabaseConnection();
      equal(getElectionPlan(planId)?.result.personal?.participants[0].luck?.version,PERSONAL_ELECTION_LUCK_VERSION,'数据库重开后岁运版本及快照完整保留');
      equal((getDatabase().pragma('foreign_key_check') as unknown[]).length,0,'新增岁运背景不破坏外键完整性');
    });
    const ctx={params:Promise.resolve({id:planId})};
    for(const [token,status] of [[undefined,401],[tokenB,404],[tokenA,200]] as const) {
      const response=await read(request(token,undefined,'GET'),ctx);equal(response.status,status,'匿名和跨账号不得读取含岁运与出生时刻的个人方案');
      equal(response.headers.get('Cache-Control'),'private, no-store','敏感个人方案禁止共享缓存');
      const body=await response.json();if(status!==200)check(!JSON.stringify(body).includes('合成岁运主事人'),'错误响应不泄露参与者资料');
      const h=await hours(request(token,{planId,date:'2030-12-12'}));equal(h.status,status,'历史岁运时辰入口按账号所有者检查');await h.json();
      const edited=await patch(request(token,{notes:'合成岁运备注'},'PATCH'),ctx);equal(edited.status,status,'历史岁运方案修改按账号所有者检查');await edited.json();
    }
    const savedHours=await hours(request(tokenA,{planId,date:'2030-12-12'})),savedBody=await savedHours.json();
    check(savedHours.status===200&&savedBody.hours.personal.participants[0].luck.cycles[0].startAt==='2030-12-12 06:51:00','历史时辰 HTTP 在来源删除后仍从保存岁运快照计算');
    for(const handler of [preview,save,hours]) {
      const body=handler===preview?ownInput!:handler===save?{title:'跨账号岁运',input:ownInput!}:{input:ownInput!,date:'2030-12-12'};
      const anonymous=await handler(request(undefined,body));equal(anonymous.status,401,'新岁运预览、保存、时辰查询必须登录');await anonymous.json();
      const denied=await handler(request(tokenB,body));equal(denied.status,404,'其他账号不能引用非本人八字版本');check(!JSON.stringify(await denied.json()).includes('合成岁运主事人'),'跨账号错误不暴露来源资料');
    }
    for(const body of [{planId,date:'2030-12-12',snapshot:{}},{planId,date:'2030-12-12',luck:{}},{planId,date:'2030-12-12',input:ownInput!}]) {
      const response=await hours(request(tokenA,body));equal(response.status,400,'历史时辰不接受客户端岁运快照及混用新输入');await response.json();
    }
    const fresh=await runAsUser(a,async()=>createBaziBirthProfile({displayName:'合成仍存来源',birthDate:'2018-06-11',birthTime:'09:30',gender:'female',initialChart:{}})),valid=input('2030-12-12',choice(fresh.charts[0].id));
    for(const forged of [
      {...valid,personal:{...valid.personal,luck:{cycles:[]}}},
      {...valid,personal:{...valid.personal,participants:[{...valid.personal!.participants[0],luck:{cycles:[]}}]}},
      {...valid,personal:{...valid.personal,participants:[{...valid.personal!.participants[0],birthAt:'1900-01-01 00:00:00'}]}},
    ]) {
      const response=await preview(request(tokenA,forged));equal(response.status,400,'客户端不得伪造岁运、出生时刻或个人快照');await response.json();
    }
    const forgedSave=await save(request(tokenA,{title:'忽略伪造岁运结果',input:valid,result:{personal:{participants:[{luck:{cycles:[{ganZhi:'伪造'}]}}]}},userId:b.id})),forgedBody=await forgedSave.json();
    check(forgedSave.status===201&&forgedBody.plan.result.personal.participants[0].luck.cycles[0].ganZhi==='丁巳','保存只根据当前账号来源计算，不信任外层结果和 userId');
    console.log(`个人择日岁运专项通过：${checks} 项；精确立春交节、出生与交运秒界、多人切点、十神、缺时与时钟撤回、晚子日时、黄历独立、v1 兼容、删源复算及账号防伪；未调用网络和 AI。`);
  } finally {
    globalThis.fetch=originalFetch;runAsUser(a,closeDatabaseConnection);runAsUser(b,closeDatabaseConnection);closeAccountConnections();
    if(path.dirname(path.resolve(directory))!==path.resolve(tmpdir()))throw new Error('测试目录不在系统临时根目录');
    rmSync(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
