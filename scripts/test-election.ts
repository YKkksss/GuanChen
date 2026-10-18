import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Solar } from 'lunar-javascript';
import { registerUser, createSession, closeAccountConnections, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { getDatabase, closeDatabaseConnection } from '../lib/db/client';
import { createConversation, getConversation } from '../lib/db/conversations';
import { calculateElection, normalizeElectionInput, assessAlmanac, classifyElectionDay } from '../lib/election/engine';
import { ELECTION_EVENTS, ELECTION_MODES, ZODIACS, type AlmanacRule } from '../lib/election/types';
import { createElectionPlan, getElectionPlan, listElectionPlans, updateElectionPlan, deleteElectionPlan } from '../lib/db/election';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { PORTABLE_CHART_TABLES } from '../lib/chart-transfer/service';
import { GET as list, POST as save } from '../app/api/election/route';
import { POST as preview } from '../app/api/election/preview/route';
import { GET as read, PATCH as patch, DELETE as remove } from '../app/api/election/[id]/route';
const directory = mkdtempSync(path.join(tmpdir(),'guanchen-election-test-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory,'accounts'); process.env.SQLITE_PATH = path.join(directory,'fallback.sqlite'); process.env.REPORT_EXPORT_DIR = path.join(directory,'exports');
const input = {event:'marriage',startDate:'2026-10-12',endDate:'2026-11-10',ruleMode:'compare',weekdays:[0,1,2,3,4,5,6],excludedZodiacs:[]};
let checks = 0;
function check(v:unknown,label:string) { assert.ok(v,label); checks++; }
function rejects(fn:()=>unknown,label:string) { assert.throws(fn,label); checks++; }
function request(token?:string,method='GET',body?:unknown) { return new Request('http://local/api/election',{method,headers:{'Content-Type':'application/json',...(token ? {cookie:`${SESSION_COOKIE}=${token}`} : {})},...(body === undefined ? {} : {body:JSON.stringify(body)})}); }
function rule(mode:AlmanacRule['mode'],assessment:AlmanacRule['assessment'],selected=true):AlmanacRule { return {mode,assessment,selected,monthGanZhi:'戊戌',yi:[],ji:[],reason:`${mode} ${assessment}`,}; }
async function main() {
  const originalFetch = globalThis.fetch;
  const a = await registerUser({username:'election-a',password:randomUUID(),displayName:'择日测试甲'}), b = await registerUser({username:'election-b',password:randomUUID(),displayName:'择日测试乙'}), tokenA = createSession(a.id), tokenB = createSession(b.id);
  let id = '';
  // 本模块不依赖 AI；任何意外外呼都令专项立即失败。
  globalThis.fetch = async () => { throw new Error('择日专项不允许外呼'); };
  try {
    const daily = calculateElection({...input,endDate:input.startDate}); check(daily.days.length === 1 && daily.days[0].status === 'candidate','已知2026-10-12嫁娶明确列宜');
    check(calculateElection({...input,endDate:input.startDate,event:'opening'}).days[0].status === 'avoid','已知同日开市列忌');
    check(calculateElection({...input,endDate:input.startDate,event:'contract'}).days[0].status === 'unlisted','未列立券不按诸事适宜处理');
    const source = Solar.fromYmd(2026,10,12).getLunar(); check(daily.days[0].rules[0].yi.join() === source.getDayYi(1).join() && daily.days[0].dayGanZhi === source.getDayInGanZhi(), '原始黄历事项与日干支保存');
    check(calculateElection({...input,startDate:'2026-02-17',endDate:'2026-02-17'}).days[0].lunar.includes('正月初一'),'春节农历标签');
    const leap = calculateElection({...input,startDate:'2025-07-25',endDate:'2025-07-25'}).days[0]; check(leap.leapMonth && leap.lunarMonth === -6 && leap.lunar.includes('闰六月初一'),'闰月不丢失');
    const leapYear = calculateElection({...input,startDate:'2000-02-28',endDate:'2000-03-01'}); check(leapYear.days.map(d=>d.date).join() === '2000-02-28,2000-02-29,2000-03-01','闰年与跨月');
    check(calculateElection({...input,startDate:'2025-12-31',endDate:'2026-01-01'}).days.length === 2,'公历跨年包含首尾');
    for (const ruleMode of Object.keys(ELECTION_MODES)) { const day = calculateElection({...input,event:'moving',startDate:'2026-02-04',endDate:'2026-02-04',ruleMode}).days[0]; check(day.boundary.changesWithinDay && day.boundary.startMonth !== day.boundary.endMonth && day.status === (ruleMode === 'day_boundary' ? 'candidate' : 'review'),'交节日两种月界区分并按所选规则处理'); }
    check(calculateElection({...input,startDate:'1900-01-01',endDate:'1900-01-01'}).days.length === 1 && calculateElection({...input,startDate:'2100-12-31',endDate:'2100-12-31'}).days.length === 1,'支持范围首尾');
    check(calculateElection({...input,startDate:'2026-01-01',endDate:'2026-04-02'}).days.length === 92,'92天最大区间');
    for(const raw of [null,[],1,'input']) rejects(()=>normalizeElectionInput(raw),'非法根值拒绝');
    for (const changes of [{event:'other'},{event:'__proto__'},{ruleMode:'wrong'},{startDate:'1899-12-31'},{endDate:'2101-01-01'},{startDate:'1900-02-29'},{startDate:'2026-2-1'},{startDate:2026},{startDate:'2026-11-11'},{startDate:'2026-01-01',endDate:'2026-04-03'},{weekdays:[]},{weekdays:[7]},{weekdays:['1']},{weekdays:[NaN]},{weekdays:'all'},{excludedZodiacs:[12]},{excludedZodiacs:[-1]},{excludedZodiacs:['鼠']},{excludedZodiacs:null},{ruleMode:null}]) {
      if (changes.excludedZodiacs === null && Object.hasOwn(changes,'excludedZodiacs')) { check(normalizeElectionInput({...input,...changes}).excludedZodiacs.length === 0,'空可选生肖默认无排除'); }
      else rejects(()=>normalizeElectionInput({...input,...changes}),'非法事项、条件或日期拒绝');
    }
    check(normalizeElectionInput({...input,weekdays:[6,1,6],excludedZodiacs:[2,1,2]}).weekdays.join() === '1,6','筛选数组规范去重排序');
    for (const [yi,ji,status] of [[['嫁娶'],[],'support'],[[],['嫁娶'],'avoid'],[['嫁娶'],['嫁娶'],'avoid'],[['诸事不宜'],[],'avoid'],[[],['诸事不宜'],'avoid'],[[],['诸事不忌'],'unlisted'],[['祭祀'],['开市'],'unlisted']] as Array<[string[],string[],string]>) check(assessAlmanac('嫁娶',yi,ji).assessment === status,'明确事项匹配、诸事标记和冲突处理');
    for (const x of ['support','avoid','unlisted'] as const) for (const y of ['support','avoid','unlisted'] as const) { const expected = x === 'avoid' || y === 'avoid' ? 'avoid' : x === 'support' && y === 'support' ? 'candidate' : x === 'support' || y === 'support' ? 'review' : 'unlisted'; check(classifyElectionDay([rule('day_boundary',x),rule('exact_boundary',y)],[],false).status === expected,'两口径所有事项组合'); check(classifyElectionDay([rule('day_boundary',x),rule('exact_boundary',y)],[],true).status === 'review','交节日不以代表时刻判全天'); }
    check(classifyElectionDay([rule('day_boundary','support'),rule('exact_boundary','avoid',false)],[],false).status === 'candidate','未选择的参考口径不偷改筛选');
    check(classifyElectionDay([rule('day_boundary','support'),rule('exact_boundary','support')],['用户星期排除'],true).status === 'excluded','现实条件排除优先'); rejects(()=>classifyElectionDay([],[],false),'缺少所选口径拒绝');
    const chong = ZODIACS.indexOf(daily.days[0].chongZodiac as typeof ZODIACS[number]); check(chong >= 0 && calculateElection({...input,endDate:input.startDate,excludedZodiacs:[chong]}).days[0].status === 'excluded','指定日冲生肖排除');
    check(calculateElection({...input,endDate:input.startDate,weekdays:[0]}).days[0].status === 'excluded','非可用星期排除');
    for (const event of Object.keys(ELECTION_EVENTS)) for (const ruleMode of Object.keys(ELECTION_MODES)) { const r = calculateElection({...input,event,ruleMode}); check(Object.values(r.counts).reduce((n,v)=>n+v,0) === 30 && r.days.every((d,i)=>i === 0 || d.date > r.days[i-1].date),'七事项三口径计数完整且按日期顺序'); check(r.days.filter(d=>d.status === 'candidate').every(d=>d.rules.filter(r=>r.selected).every(r=>r.assessment === 'support') && !(ruleMode !== 'day_boundary' && d.boundary.changesWithinDay)),'所有候选满足已选规则且无待核日内交节'); }
    const previousTZ = process.env.TZ; process.env.TZ = 'America/Los_Angeles'; const western = calculateElection(input); process.env.TZ = 'Asia/Shanghai'; const eastern = calculateElection(input); if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; check(JSON.stringify(western) === JSON.stringify(eastern),'服务进程时区不改变日期与黄历结果');
    await runAsUser(a,async()=>{
      check((getDatabase().prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {v:number}).v === 56,'v56初始化');
      const draft = createElectionPlan({title:'合成择日方案',input,selectedDates:['2026-10-12','2026-10-13'],notes:'仅供测试的现实安排'}); id = draft.plan.id;
      check(!draft.reused && draft.plan.selectedDates.length === 2 && draft.plan.result.days.length === 30,'保存完整筛选、依据及对照日期');
      check(createElectionPlan({title:' 合成择日方案 ',input:{...input,weekdays:[6,5,4,3,2,1,0]},selectedDates:['2026-10-13','2026-10-12'],notes:'仅供测试的现实安排'}).reused && listElectionPlans().length === 1,'规范资料与重复保存幂等');
      check(!Object.hasOwn(listElectionPlans()[0],'result'),'列表仅返回概要，不加载整份日历');
      for (const v of [{title:''},{title:'x'.repeat(81)},{notes:'x'.repeat(1001)},{selectedDates:['2026-01-01']},{selectedDates:['2026-10-12','2026-10-13','2026-10-14','2026-10-15']}]) rejects(()=>createElectionPlan({title:'合成择日方案',input,...v}),'保存文本与对照范围拒绝');
      getDatabase().exec("CREATE TEMP TRIGGER fail_election BEFORE INSERT ON election_plans BEGIN SELECT RAISE(ABORT, '合成回滚'); END"); rejects(()=>createElectionPlan({title:'回滚择日',input}),'插入失败'); getDatabase().exec('DROP TRIGGER fail_election'); check(listElectionPlans().length === 1,'事务失败不遗留记录');
      const old = JSON.stringify(draft.plan.result), updated = updateElectionPlan(id,{title:'改名择日',notes:'更新现实信息',selectedDates:['2026-10-14']}); check(updated.selectedDates.join() === '2026-10-14' && updated.notes === '更新现实信息' && JSON.stringify(updated.result) === old,'修改对照与备注保留原始规则快照');
      for (const data of [null,[],{}, {title:null},{notes:1},{selectedDates:['invalid']},{input},{userId:a.id}]) rejects(()=>updateElectionPlan(id,data),'非法修改与不允许改筛选输入');
      const other = createElectionPlan({title:'另一个方案',input}); rejects(()=>updateElectionPlan(other.plan.id,{title:'改名择日',notes:'更新现实信息',selectedDates:['2026-10-14']}),'同内容修改冲突保留两份');
      const stable = getElectionPlan(id)!; closeDatabaseConnection(); check(JSON.stringify(getElectionPlan(id)?.result) === JSON.stringify(stable.result),'连接重开按保存口径回看');
      const archive = await createLocalBackupArchive(); deleteElectionPlan(id); await restoreLocalBackupArchive({archive:archive.buffer,confirmation:LOCAL_BACKUP_CONFIRMATION}); check(getElectionPlan(id)?.notes === '更新现实信息' && getElectionPlan(id)?.selectedDates.join() === '2026-10-14','整库备份恢复独立方案');
      check(!PORTABLE_CHART_TABLES.some(t=>String(t).includes('election')),'独立方案不进入单紫微包');
      const conversation = createConversation({type:'chart',title:'迁移保留的合成命盘',birthInfo:{year:2000,month:1,day:1,hour:0,gender:'male'}});
      getDatabase().exec('DROP TABLE qimen_turns; DROP TABLE qimen_sessions; DROP TABLE liuyao_turns; DROP TABLE liuyao_sessions; DROP TABLE meihua_turns; DROP TABLE meihua_sessions; DROP TABLE election_plans; DELETE FROM schema_migrations WHERE version >= 52;'); closeDatabaseConnection(); check((getDatabase().prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {v:number}).v === 56 && Boolean(getConversation(conversation.id)),'v51升级v56保留已有命盘');
      const restored = createElectionPlan({title:'合成HTTP方案',input}); id = restored.plan.id;
      check((getDatabase().pragma('foreign_key_check') as unknown[]).length === 0,'外键完整性');
    });
    const ctx = {params:Promise.resolve({id})};
    for (const [token,expected] of [[undefined,401],[tokenB,404],[tokenA,200]] as const) { const r = await read(request(token),ctx); check(r.status === expected,'匿名及跨账号读取拒绝'); await r.json(); const edited = await patch(request(token,'PATCH',{notes:'HTTP合成更新'}),ctx); check(edited.status === expected,'匿名及跨账号修改拒绝'); await edited.json(); }
    for (const fn of [list,preview,save]) { const r = await fn(request(undefined,fn === list ? 'GET':'POST',fn === list ? undefined:input)); check(r.status === 401,'匿名列表与创建预览均拒绝'); await r.json(); }
    const bList = await list(request(tokenB)); check((await bList.json()).plans.length === 0,'乙列表无甲方案');
    const before = runAsUser(a,()=>listElectionPlans().length), p = await preview(request(tokenA,'POST',input)); check(p.status === 200 && (await p.json()).result.days.length === 30 && runAsUser(a,()=>listElectionPlans().length) === before,'预览API不写档案');
    for (const data of [null,[],{...input,weekdays:[]},{...input,excludedZodiacs:[15]}]) { const r = await preview(request(tokenA,'POST',data)); check(r.status === 400,'预览API输入校验'); await r.json(); }
    const created = await save(request(tokenA,'POST',{title:'HTTP新建合成',input,selectedDates:[],userId:b.id,result:{days:['篡改']}})); const body = await created.json(); check(created.status === 201 && body.plan.result.days.length === 30,'服务端重算并忽略伪造结果与账号字段');
    const noBody = await save(new Request('http://local/api/election',{method:'POST',headers:{cookie:`${SESSION_COOKIE}=${tokenA}`},body:'invalid'})); check(noBody.status === 400,'坏JSON拒绝'); await noBody.json();
    const denied = await remove(request(tokenB,'DELETE'),ctx); check(denied.status === 404,'跨账号删除拒绝'); await denied.json(); const anon = await remove(request(undefined,'DELETE'),ctx); check(anon.status === 401,'匿名删除拒绝'); await anon.json();
    const removed = await remove(request(tokenA,'DELETE'),ctx); check(removed.status === 200,'本人删除方案'); await removed.json(); const missing = await read(request(tokenA),ctx); check(missing.status === 404,'删除后不可回看'); await missing.json();
    console.log(`择日工具专项通过：${checks}项；七事项三口径、交节日、历法与时区、筛选依据、对照保存、快照、账号隔离、备份迁移；未调用AI。`);
  } finally { globalThis.fetch = originalFetch; runAsUser(a,closeDatabaseConnection); runAsUser(b,closeDatabaseConnection); closeAccountConnections(); if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir())) throw new Error('测试清理目录不在临时目录'); rmSync(directory,{recursive:true,force:true}); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
