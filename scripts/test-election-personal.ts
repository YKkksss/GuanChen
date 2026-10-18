import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerUser, createSession, closeAccountConnections, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { getDatabase, closeDatabaseConnection } from '../lib/db/client';
import { createBaziBirthProfile, createBaziChartVersion, deleteBaziBirthProfile, getBaziChartVersion, updateBaziBirthProfile } from '../lib/db/bazi';
import { createElectionPlan, getElectionPlan, listElectionPlans, updateElectionPlan, deleteElectionPlan } from '../lib/db/election';
import { normalizePersonalElectionInput } from '../lib/election/personal-rules';
import { assessPersonalElection } from '../lib/election/personal-engine';
import { calculatePersonalElection, calculatePersonalElectionHours, listPersonalElectionCharts } from '../lib/election/personal-service';
import { calculateElection } from '../lib/election/engine';
import { calculateElectionHours } from '../lib/election/hours';
import { PERSONAL_ELECTION_VERSION, type PersonalElectionInput, type PersonalElectionParticipantSnapshot, type PersonalElectionSnapshot } from '../lib/election/personal-types';
import type { BaziElement, BaziPillarKey } from '../lib/bazi/types';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { POST as preview } from '../app/api/election/preview/route';
import { POST as hours } from '../app/api/election/hours/route';
import { GET as list, POST as save } from '../app/api/election/route';
import { GET as participants } from '../app/api/election/participants/route';
import { GET as read, PATCH as patch, DELETE as remove } from '../app/api/election/[id]/route';

// 本专项只使用临时账号与合成档案，禁止外呼，不访问项目实际账号目录。
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-election-personal-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'exports');
const baseInput = { event: 'marriage', startDate: '2026-10-12', endDate: '2026-10-14', ruleMode: 'compare', weekdays: [0,1,2,3,4,5,6], excludedZodiacs: [] };
const stems = [...'甲乙丙丁戊己庚辛壬癸'], branches = [...'子丑寅卯辰巳午未申酉戌亥'];
const elements: BaziElement[] = ['木','火','土','金','水'];
let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
function rejects(work: () => unknown, label: string) { assert.throws(work, label); checks++; }
function choices(chartId: string, overrides: Partial<PersonalElectionInput> = {}): PersonalElectionInput {
  return { participants: [{ chartId, preferredElements: [], cautiousElements: [], basisNote: '' }], avoidDayYearClash: false, avoidDayBranchClash: false, avoidHourYearClash: false, avoidHourBranchClash: false, filterStems: false, ...overrides };
}
function synthetic(person: Partial<PersonalElectionParticipantSnapshot> = {}, flags: Partial<PersonalElectionInput> = {}): PersonalElectionSnapshot {
  const chartId = '00000000-0000-4000-8000-000000000001';
  const participant: PersonalElectionParticipantSnapshot = {
    ...choices(chartId).participants[0], profileId: '00000000-0000-4000-8000-000000000002', displayName: '合成关系甲', chartFingerprint: 'synthetic-chart-fingerprint', chartMethodologyVersion: 'synthetic-methodology', chartEngineVersion: 'synthetic-engine', unknownTime: false, policyLabel: '合成条件，仅供规则测试',
    pillars: [{ key:'year',label:'年柱',stem:'甲',branch:'子' }, { key:'month',label:'月柱',stem:'丙',branch:'寅' }, { key:'day',label:'日柱',stem:'戊',branch:'辰' }, { key:'time',label:'时柱',stem:'庚',branch:'午' }],
    climateReference: { version:'synthetic-climate',label:'条件参考',scope:'synthetic',detail:'调候候选不是已确定喜用' }, ...person,
  };
  return { version: PERSONAL_ELECTION_VERSION, source:'https://example.invalid/synthetic-personal', input: choices(participant.chartId, { participants:[{ chartId:participant.chartId,preferredElements:participant.preferredElements,cautiousElements:participant.cautiousElements,basisNote:participant.basisNote }],...flags }), participants:[participant] };
}
function pillar(key: BaziPillarKey, stem: string, branch: string) { return { key,label:({year:'年柱',month:'月柱',day:'日柱',time:'时柱'} as const)[key],stem,branch }; }
function ganZhiForBranch(branch: string) { return `${branches.indexOf(branch) % 2 ? '乙':'甲'}${branch}`; }
function request(token: string | undefined, body?: unknown, method='POST', endpoint='http://local/api/election') {
  return new Request(endpoint, { method,headers:{ 'Content-Type':'application/json',...(token ? {cookie:`${SESSION_COOKIE}=${token}`} : {}) },...(body === undefined ? {} : { body:JSON.stringify(body) }) });
}

function rules() {
  const chartId = randomUUID(), valid = choices(chartId);
  check(normalizePersonalElectionInput(valid).participants[0].chartId === chartId,'个人条件合法版本标识保留');
  for (const raw of [undefined,null,[],{}, { ...valid,participants:[] }, { ...valid,participants:[...valid.participants,...valid.participants,...valid.participants] }, { ...valid,participants:[valid.participants[0],valid.participants[0]] }, { ...valid,participants:[{ ...valid.participants[0],chartId:'  ' }] }, { ...valid,participants:[{ ...valid.participants[0],chartId:'x'.repeat(101) }] }, { ...valid,participants:[{ ...valid.participants[0],preferredElements:['风'] }] }, { ...valid,participants:[{ ...valid.participants[0],preferredElements:['木'],cautiousElements:['木'],basisNote:'合成依据' }] }, { ...valid,participants:[{ ...valid.participants[0],preferredElements:['火'],basisNote:'' }] }, { ...valid,participants:[{ ...valid.participants[0],cautiousElements:['土'],basisNote:'  ' }] }, { ...valid,participants:[{ ...valid.participants[0],basisNote:'x'.repeat(201) }] }, { ...valid,participants:[{ ...valid.participants[0],pillars:[] }] }, { ...valid,snapshot:synthetic() }, { ...valid,filterStems:true }]) rejects(()=>normalizePersonalElectionInput(raw),'个人资料数量、冲突、说明、未知和伪造字段严格拒绝');
  for (const flag of ['avoidDayYearClash','avoidDayBranchClash','avoidHourYearClash','avoidHourBranchClash','filterStems']) for (const value of [null,1,'false',[],{}]) rejects(()=>normalizePersonalElectionInput({...valid,[flag]:value}),'筛选开关只接受布尔类型');
  const normalized = normalizePersonalElectionInput({ ...valid, participants:[{ ...valid.participants[0],preferredElements:['水','木','水'],basisNote:'  人工提供的判断，需要自行复核  ' }] });
  check(new Set(normalized.participants[0].preferredElements).size === normalized.participants[0].preferredElements.length && normalized.participants[0].basisNote === '人工提供的判断，需要自行复核','人工五行去重且依据去除首尾空白');
  for (const raw of [true,1,'火',null,{}]) rejects(()=>normalizePersonalElectionInput({...valid,participants:[{...valid.participants[0],preferredElements:raw}]}),'人工五行必须为数组');
  const plain = synthetic();
  const observed = assessPersonalElection(plain,'甲午','day');
  check(!observed.excluded && observed.participants[0].relations.some(r=>r.type==='branch_clash') && observed.participants[0].relations.some(r=>r.type==='branch_repeat'),'只展示关系时冲与同支不会自动排除');
  check(assessPersonalElection(synthetic({}, {avoidDayYearClash:true}),'甲午','day').excluded,'显式避开日与年支六冲');
  check(!assessPersonalElection(synthetic({}, {avoidDayYearClash:true}),'甲午','hour').excluded,'日层排除不偷偷变成时层排除');
  check(assessPersonalElection(synthetic({}, {avoidHourYearClash:true}),'甲午','hour').excluded,'显式避开时与年支六冲');
  check(assessPersonalElection(synthetic({}, {avoidDayBranchClash:true}),'甲戌','day').excluded,'显式避开日与日支六冲');
  check(assessPersonalElection(synthetic({}, {avoidHourBranchClash:true}),'甲戌','hour').excluded,'显式避开时与日支六冲');
  const clashPairs = ['子午','丑未','寅申','卯酉','辰戌','巳亥'];
  const combinePairs = ['子丑','寅亥','卯戌','辰酉','巳申','午未'];
  for (const natal of branches) for (const target of branches) {
    const r = assessPersonalElection(synthetic({pillars:[pillar('year','甲',natal)]}),ganZhiForBranch(target),'day').participants[0].relations;
    const pair = (pairs:string[])=>pairs.some(p=>p.includes(natal)&&p.includes(target)&&natal!==target);
    check(r.some(v=>v.type==='branch_clash')===pair(clashPairs),'十二支六冲独立表逐对核对');
    check(r.some(v=>v.type==='branch_combine')===pair(combinePairs),'十二支六合独立表逐对核对');
    check(r.some(v=>v.type==='branch_repeat')===(natal===target),'十二支同支只标记实际重复');
  }
  const stemPairs = ['甲己','乙庚','丙辛','丁壬','戊癸'];
  for (const natal of stems) for (const target of stems) {
    const targetGanZhi = `${target}${stems.indexOf(target)%2?'丑':'子'}`;
    const r = assessPersonalElection(synthetic({pillars:[pillar('year',natal,'寅')]}),targetGanZhi,'day');
    check(r.participants[0].relations.some(v=>v.type==='stem_combine')===stemPairs.some(p=>p.includes(natal)&&p.includes(target)&&natal!==target),'十干五合独立表逐对核对');
  }
  for (const group of ['申子辰','亥卯未','寅午戌','巳酉丑']) for (let i=0;i<3;i++) {
    const target=group[i],rest=[...group].filter(b=>b!==target),fixture=synthetic({pillars:[pillar('year','甲',rest[0]),pillar('day','丙',rest[1])]});
    const full=assessPersonalElection(fixture,ganZhiForBranch(target),'day');
    check(full.participants[0].relations.some(r=>r.type==='three_harmony')&&!full.excluded,'原局两个不同成员加当前日支才展示完整三合且不自动判吉凶');
    const partial=assessPersonalElection(synthetic({pillars:[pillar('year','甲',rest[0]),pillar('day','丙',rest[0])]}),ganZhiForBranch(target),'day');
    check(!partial.participants[0].relations.some(r=>r.type==='three_harmony'),'重复成员不能补足缺一的三合');
  }
  for (const element of elements) {
    const person = {preferredElements:[element],basisNote:'合成手工条件，不是系统确定喜用'};
    for (let i=0;i<stems.length;i++) {
      const target=`${stems[i]}${i%2?'丑':'子'}`,expected=elements[Math.floor(i/2)]!==element;
      check(assessPersonalElection(synthetic(person,{filterStems:true}),target,'day').excluded===expected,'人工五行筛选只按显式表层天干元素执行');
      check(!assessPersonalElection(synthetic(person),target,'day').excluded,'未勾选五行过滤时人工方向只作说明');
      check(assessPersonalElection(synthetic({cautiousElements:[element],basisNote:'合成谨慎条件'},{filterStems:true}),target,'hour').excluded===!expected,'人工谨慎条件作用于明确时干');
    }
  }
  const dual=synthetic({preferredElements:['木'],basisNote:'合成甲的人工条件'},{filterStems:true});
  dual.participants.push({...dual.participants[0],chartId:randomUUID(),profileId:randomUUID(),displayName:'合成关系乙',preferredElements:['火']});
  dual.input.participants=dual.participants.map(({chartId,preferredElements,cautiousElements,basisNote})=>({chartId,preferredElements,cautiousElements,basisNote}));
  check(assessPersonalElection(dual,'甲子','day').excluded&&assessPersonalElection(dual,'丙寅','day').excluded,'双人人工条件分别计算，不以一人满足抵消另一人排除');
  const unknown=assessPersonalElection(synthetic({unknownTime:true,pillars:plain.participants[0].pillars.filter(p=>p.key!=='time')}),'甲午','hour');
  check(unknown.participants[0].unknownTime&&!unknown.participants[0].relations.some(r=>r.pillarKeys.includes('time')),'未知时辰不补造时柱关系');
}

async function main() {
  const a=await registerUser({username:'personal-a',password:randomUUID(),displayName:'个人择日甲'}),b=await registerUser({username:'personal-b',password:randomUUID(),displayName:'个人择日乙'}),tokenA=createSession(a.id),tokenB=createSession(b.id);
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('本专项禁止网络和AI调用');};
  try {
    rules();
    let chartId='',secondChartId='',unknownChartId='',profileId='',planId='',snapshot:PersonalElectionSnapshot;
    await runAsUser(a,async()=>{
      const profile=createBaziBirthProfile({displayName:'合成择日主事人',birthDate:'1992-07-09',birthTime:'09:30',gender:'female',timeZoneId:'Asia/Shanghai',locationLabel:'不应进入择日快照的地点',notes:'不应进入择日快照的私人备注',initialChart:{timeStandard:'civil_time',lateZiPolicy:'same_day'}});
      profileId=profile.id;chartId=profile.charts[0].id;
      const second=createBaziBirthProfile({displayName:'合成共同参与人',birthDate:'1990-12-03',birthTime:'23:30',gender:'male',timeZoneId:'Asia/Shanghai',initialChart:{lateZiPolicy:'next_day'}});secondChartId=second.charts[0].id;
      const unknown=createBaziBirthProfile({displayName:'合成未知时辰',birthDate:'1992-07-09',unknownTime:true,gender:'female',initialChart:{}});unknownChartId=unknown.charts[0].id;
      const input={...baseInput,personal:choices(chartId)},base=calculateElection(baseInput),result=calculatePersonalElection(input);
      snapshot=result.personal!;
      check(snapshot.version===PERSONAL_ELECTION_VERSION&&snapshot.participants[0].displayName===profile.displayName,'当前账号指定版本建立服务器快照');
      check(snapshot.participants[0].chartFingerprint===profile.charts[0].chartFingerprint&&snapshot.participants[0].pillars.length===4,'快照使用保存版本四柱和指纹');
      check(!JSON.stringify(snapshot).includes('不应进入择日快照'),'快照不携带出生地与私密备注');
      check(listPersonalElectionCharts().some(c=>c.chartId===chartId)&&!JSON.stringify(listPersonalElectionCharts()).includes('不应进入择日快照'),'可选八字版本列表仅返回择日所需概要');
      check(result.days.every((d,i)=>d.personal?.participants.length===1&&d.status===base.days[i].status),'只展示关系不改变黄历原始状态');
      check(result.personal?.participants[0].preferredElements.length===0&&result.personal.participants[0].cautiousElements.length===0,'系统不把调候候选自动写为人工喜忌');
      check(snapshot.participants[0].climateReference.detail.length>0,'调候只保留有边界的参考说明');
      rejects(()=>calculateElection(input),'纯黄历入口拒绝带个人条件被静默忽略');
      rejects(()=>calculateElectionHours(input,baseInput.startDate),'纯黄历时辰入口拒绝个人条件被静默忽略');
      const two=calculatePersonalElection({...baseInput,personal:choices(chartId,{participants:[...choices(chartId).participants,...choices(secondChartId).participants]})});
      check(two.personal?.participants.length===2&&two.days.every(d=>d.personal?.participants.length===2),'双人逐日分别保留依据');
      const alternative=createBaziChartVersion(profileId,{lateZiPolicy:'next_day'});
      rejects(()=>calculatePersonalElection({...baseInput,personal:choices(chartId,{participants:[...choices(chartId).participants,...choices(alternative.id).participants]})}),'同一档案的两个版本不能冒充两位参与者');
      const missing=calculatePersonalElection({...baseInput,personal:choices(unknownChartId)});
      check(missing.personal?.participants[0].unknownTime&&missing.personal.participants[0].pillars.length===3,'未知时辰使用三柱且显示缺时标识');
      const explicit=calculatePersonalElection({...baseInput,personal:choices(chartId,{avoidDayYearClash:true,avoidDayBranchClash:true})});
      check(explicit.days.every((d,i)=>d.personal?.excluded&& !['avoid','excluded'].includes(base.days[i].status) ? d.status==='excluded' : d.status===base.days[i].status),'显式个人过滤保留原始事项忌与既有排除状态');
      check(explicit.days.every((d,i)=>d.baseStatus===base.days[i].status),'个人结果保留独立黄历原始状态');
      check(Object.values(explicit.counts).reduce((sum,n)=>sum+n,0)===explicit.days.length,'个人过滤后的统计与逐日一致');
      const daily=calculatePersonalElectionHours(input,baseInput.startDate);
      check(daily.slots.length===13&&daily.slots.every(s=>s.personal&&s.personalDay),'时辰同时保留日层和时层个人依据');
      const late=daily.slots.at(-1)!;
      check(late.personal?.targetGanZhi===late.timeGanZhi&&late.personalDay?.targetGanZhi===late.civilDayGanZhi&&late.civilDayGanZhi!==late.timeRuleDayGanZhi,'晚子时个人日关系沿用公历日，时关系取实际时柱');
      const spring=calculatePersonalElectionHours({...input,startDate:'2026-02-04',endDate:'2026-02-04'},'2026-02-04');
      check(spring.transitionAt==='04:02:08'&&spring.slots.length===14&&spring.slots.every(s=>s.personal&&s.personalDay),'交节秒界保留分段及个人依据');
      const saved=createElectionPlan({title:'合成个人择日',input,selectedDates:[baseInput.startDate],selectedTimes:[{date:baseInput.startDate,slotId:daily.slots[0].id}],notes:'合成现实安排'});planId=saved.plan.id;
      check(saved.plan.result.personal?.participants[0].chartId===chartId&&saved.plan.selectedTimes[0].slot.personal?.participants.length===1,'保存个人日期与时段快照');
      check(createElectionPlan({title:'合成个人择日',input,selectedDates:[baseInput.startDate],selectedTimes:[{date:baseInput.startDate,slotId:daily.slots[0].id}],notes:'合成现实安排'}).reused,'相同个人条件规范保存幂等');
      check(!createElectionPlan({title:'合成个人择日',input:{...input,personal:choices(secondChartId)},selectedDates:[baseInput.startDate],selectedTimes:[{date:baseInput.startDate,slotId:daily.slots[0].id}],notes:'合成现实安排'}).reused,'相同标题不同参与者不撞幂等缓存');
      const old=createElectionPlan({title:'兼容无个人旧方案',input:baseInput,selectedTimes:[{date:baseInput.startDate,slotId:daily.slots[0].id}]}).plan;
      check(!old.result.personal&&!old.selectedTimes[0].slot.personal,'无个人方案保留原始黄历与时段');
      const stored=JSON.stringify(saved.plan.result),storedTimes=JSON.stringify(saved.plan.selectedTimes);
      updateBaziBirthProfile(profileId,{displayName:'改名后的来源'});
      check(JSON.stringify(getElectionPlan(planId)?.result)===stored,'来源改名不改旧方案个人名称与规则');
      check(deleteBaziBirthProfile(profileId)&&!getBaziChartVersion(chartId),'源档案及版本删除成功');
      check(JSON.stringify(getElectionPlan(planId)?.result)===stored&&JSON.stringify(getElectionPlan(planId)?.selectedTimes)===storedTimes,'删源盘保留完整个人方案和所选时段快照');
      rejects(()=>calculatePersonalElection(input),'重新预览已删除的来源不能静默降为黄历');
      const prior=calculatePersonalElectionHours(input,baseInput.startDate,snapshot);
      check(JSON.stringify(prior.slots[0].personal)===JSON.stringify(daily.slots[0].personal),'可信历史快照可在源删除后计算同口径个人时段');
      rejects(()=>calculatePersonalElectionHours(input,baseInput.startDate,{...snapshot,version:'synthetic-unsupported-version'}),'旧版个人规则只读回看，不以当前算法偷偷重算旧时段');
      const changed=updateElectionPlan(planId,{notes:'删除源后更新备注',selectedTimes:[{date:baseInput.startDate,slotId:daily.slots[0].id},{date:baseInput.startDate,slotId:daily.slots[1].id}]});
      check(JSON.stringify(changed.result)===stored&&JSON.stringify(changed.selectedTimes[0])===JSON.stringify(saved.plan.selectedTimes[0])&&changed.selectedTimes[1].slot.personal?.participants[0].displayName==='合成择日主事人','改备注保留快照，新增时段使用历史个人资料');
      rejects(()=>updateElectionPlan(planId,{personal:choices(secondChartId)}),'原方案不可借编辑修改个人来源和筛选条件');
      closeDatabaseConnection();check(getElectionPlan(planId)?.result.personal?.version===PERSONAL_ELECTION_VERSION,'数据库重开保留个人依据');
      const backup=await createLocalBackupArchive();deleteElectionPlan(planId);await restoreLocalBackupArchive({archive:backup.buffer,confirmation:LOCAL_BACKUP_CONFIRMATION});
      check(getElectionPlan(planId)?.selectedTimes.length===2&&getElectionPlan(planId)?.result.personal?.participants[0].chartId===chartId,'整库备份恢复源已删除的个人方案');
      check((getDatabase().pragma('foreign_key_check') as unknown[]).length===0,'个人快照与既有表外键完整性');
    });
    const ownInput={...baseInput,personal:choices(secondChartId)},ctx={params:Promise.resolve({id:planId})};
    for(const [token,expected] of [[undefined,401],[tokenB,404],[tokenA,200]] as const) {
      const r=await read(request(token,undefined,'GET'),ctx);check(r.status===expected,'匿名与跨账号读取个人方案拒绝');check(r.headers.get('Cache-Control')==='private, no-store','个人方案响应禁止共享缓存');await r.json();
      const edited=await patch(request(token,{notes:'HTTP合成更新'},'PATCH'),ctx);check(edited.status===expected,'匿名与跨账号修改个人方案拒绝');await edited.json();
    }
    for(const handler of [preview,save,hours]) {const r=await handler(request(undefined,handler===preview?ownInput:handler===save?{title:'匿名',input:ownInput}:{input:ownInput,date:baseInput.startDate}));check(r.status===401,'匿名个人预览保存和时辰查询拒绝');await r.json();}
    for(const handler of [preview,save,hours]) {const r=await handler(request(tokenB,handler===preview?ownInput:handler===save?{title:'跨账号',input:ownInput}:{input:ownInput,date:baseInput.startDate}));check(r.status===404&&!JSON.stringify(await r.json()).includes('合成共同参与人'),'跨账号来源版本读取统一404且不泄露名称');}
    const before=runAsUser(a,()=>listElectionPlans().length),shown=await preview(request(tokenA,ownInput));check(shown.status===200&&(await shown.json()).result.personal?.participants[0].chartId===secondChartId&&runAsUser(a,()=>listElectionPlans().length)===before,'预览从当前用户计算个人资料且不写入');
    check(runAsUser(b,()=>listPersonalElectionCharts().length)===0,'其他账号可选八字列表无甲的来源信息');
    for(const [token,status] of [[undefined,401],[tokenB,404],[tokenA,200]] as const) {
      const r=await hours(request(token,{planId,date:baseInput.startDate}));
      check(r.status===status,'历史个人时辰入口按方案所有者验证');
      const body=await r.json();
      if(status===200)check(body.hours.personal.participants[0].displayName==='合成择日主事人','源删除后历史时辰HTTP继续按保存快照计算');
    }
    for(const body of [{planId,date:baseInput.startDate,input:ownInput},{planId,date:baseInput.startDate,snapshot:synthetic()},{input:ownInput,date:baseInput.startDate,snapshot:synthetic()},{date:baseInput.startDate}]) {
      const r=await hours(request(tokenA,body));check(r.status===400,'历史时辰严格拒绝混用输入及客户端快照');await r.json();
    }
    const forged=await preview(request(tokenA,{...ownInput,personal:{...ownInput.personal,participants:[{...ownInput.personal.participants[0],displayName:'伪造来源',pillars:[]}]}}));check(forged.status===400,'预览拒绝客户端伪造个人名称四柱');await forged.json();
    const created=await save(request(tokenA,{title:'HTTP个人合成方案',input:ownInput,result:{personal:{participants:[{displayName:'伪造来源'}]}},userId:b.id}));const response=await created.json();check(created.status===201&&response.plan.result.personal.participants[0].displayName==='合成共同参与人','保存端忽略外层伪造结果和账号，重新按当前用户计算');
    for(const [token,status] of [[undefined,401],[tokenB,200],[tokenA,200]] as const){const r=await participants(request(token,undefined,'GET'));check(r.status===status,'参与者来源列表需要登录');const body=await r.json();if(token===tokenB)check(body.charts.length===0,'参与者来源API不能枚举另一账号档案');if(token===tokenA)check(body.charts.some((c:{chartId:string})=>c.chartId===secondChartId),'参与者来源API返回自己的可用版本');}
    const otherList=await list(request(tokenB,undefined,'GET'));check((await otherList.json()).plans.length===0,'其他账号列表没有个人方案');
    const denied=await remove(request(tokenB,undefined,'DELETE'),ctx);check(denied.status===404,'跨账号删除个人方案拒绝');await denied.json();
    const removed=await remove(request(tokenA,undefined,'DELETE'),ctx);check(removed.status===200,'所有者可删除包含历史个人快照的方案');await removed.json();
    const absent=await read(request(tokenA,undefined,'GET'),ctx);check(absent.status===404,'删除后历史个人方案不可读取');await absent.json();
    console.log(`个人化择日专项通过：${checks}项；独立干支关系表、显式日时条件、人工五行、双人未知时柱、晚子交节、快照来源删除、备份与账号隔离；未调用AI。`);
  } finally {
    globalThis.fetch=originalFetch;runAsUser(a,closeDatabaseConnection);runAsUser(b,closeDatabaseConnection);closeAccountConnections();
    if(path.dirname(path.resolve(directory))!==path.resolve(tmpdir()))throw new Error('测试目录不在系统临时根目录');
    rmSync(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
