import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Solar } from 'lunar-javascript';
import { registerUser, createSession, closeAccountConnections, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { getDatabase, closeDatabaseConnection } from '../lib/db/client';
import { calculateElectionHours, classifyElectionHour } from '../lib/election/hours';
import { ELECTION_EVENTS, ELECTION_MODES, ZODIACS } from '../lib/election/types';
import { ELECTION_HOURS_VERSION } from '../lib/election/hours-types';
import { shiftCalendarDay } from '../lib/fortune-calendar/dates';
import { createElectionPlan, getElectionPlan, updateElectionPlan, deleteElectionPlan } from '../lib/db/election';
import { createQimenSession, getQimenSession } from '../lib/db/qimen';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { POST as hours } from '../app/api/election/hours/route';
import { PATCH as patch, GET as read } from '../app/api/election/[id]/route';
const directory = mkdtempSync(path.join(tmpdir(),'guanchen-election-hours-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory,'accounts'); process.env.SQLITE_PATH = path.join(directory,'fallback.sqlite'); process.env.REPORT_EXPORT_DIR = path.join(directory,'exports');
const input = {event:'marriage',startDate:'2026-10-12',endDate:'2026-10-14',ruleMode:'compare',weekdays:[0,1,2,3,4,5,6],excludedZodiacs:[]};
let checks = 0;
function check(v: unknown, label: string) { assert.ok(v,label); checks++; }
function rejects(fn: () => unknown, label: string) { assert.throws(fn,label); checks++; }
function request(token?: string, body?: unknown, method='POST') { return new Request('http://local/api/election/hours',{method,headers:{'Content-Type':'application/json',...(token?{cookie:`${SESSION_COOKIE}=${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}); }
async function main() {
  const a=await registerUser({username:'hours-a',password:randomUUID(),displayName:'时辰甲'}),b=await registerUser({username:'hours-b',password:randomUUID(),displayName:'时辰乙'}),tokenA=createSession(a.id),tokenB=createSession(b.id);
  const originalFetch=globalThis.fetch; globalThis.fetch=async()=>{throw new Error('本专项不允许外呼或调用AI');};
  try {
    const ordinary=calculateElectionHours(input,'2026-10-12');
    check(ordinary.slots.length===13&&ordinary.slots[0].start==='00:00:00'&&ordinary.slots.at(-1)?.end==='24:00:00','一天十三段覆盖早晚子时');
    check(ordinary.slots[0].timeGanZhi==='甲子'&&ordinary.slots[0].civilDayGanZhi==='己未'&&ordinary.slots[0].tianShen==='天刑'&&ordinary.slots[0].status==='candidate','已知早子黑道标签不压过日时明确列宜');
    check(ordinary.slots[1].yi.join()==='无'&&ordinary.slots[1].ji.includes('诸事不宜')&&ordinary.slots[1].status==='avoid','已知丑时诸事不宜不作为候选');
    const late=ordinary.slots.at(-1)!;
    check(late.label==='晚子时'&&late.civilDayGanZhi==='己未'&&late.timeRuleDayGanZhi==='庚申'&&late.timeGanZhi==='丙子'&&late.status==='review','晚子时日界不同明确待核');
    const tomorrow=calculateElectionHours(input,'2026-10-13').slots[0];
    check(late.timeGanZhi===tomorrow.timeGanZhi&&late.yi.join()===tomorrow.yi.join()&&late.ji.join()===tomorrow.ji.join(),'跨午夜子时规则连续');
    check(calculateElectionHours({...input,event:'opening'},'2026-10-12').slots.every(s=>s.status==='avoid'),'日忌不被时宜抵消');
    const spring=calculateElectionHours({...input,event:'moving',ruleMode:'exact_boundary',startDate:'2026-02-04',endDate:'2026-02-04'},'2026-02-04');
    check(spring.transitionAt==='04:02:08'&&spring.slots.length===14,'立春实际交节到秒并分成十四段');
    const before=spring.slots.find(s=>s.end==='04:02:08')!,after=spring.slots.find(s=>s.start==='04:02:08')!;
    check(before.start==='03:00:00'&&after.end==='05:00:00'&&before.monthGanZhi==='己丑'&&after.monthGanZhi==='庚寅','寅时交节前后月界独立');
    check(before.dayRules[1].monthGanZhi!==after.dayRules[1].monthGanZhi&&before.splitAtTerm&&after.splitAtTerm,'精确口径使用各分段时刻');
    for(const status of ['candidate','review','avoid','unlisted','excluded'] as const) for(const assessment of ['support','avoid','unlisted'] as const) for(const lateZi of [false,true]) {
      const r=classifyElectionHour({status,reasons:['日依据']},{assessment,reason:'时依据'},lateZi);
      const expected=status==='excluded'?'excluded':status==='avoid'||assessment==='avoid'?'avoid':lateZi?'review':status==='candidate'&&assessment==='support'?'candidate':status==='review'||status==='candidate'||assessment==='support'?'review':'unlisted';
      check(r.status===expected&&r.reasons.length>0,'日时组合及晚子、排除优先级');
    }
    for(let n=0;n<60;n++) {
      const date=shiftCalendarDay('2026-10-12',n),r=calculateElectionHours({...input,startDate:date,endDate:date},date);
      check(r.slots.reduce((sum,s)=>sum+s.endSecond-s.startSecond,0)===86400,'六十日完整覆盖无缺秒');
      check(r.slots.every((s,i)=>s.endSecond>s.startSecond&&(i===0?s.startSecond===0:s.startSecond===r.slots[i-1].endSecond)),'分段无交叠无断点');
      for(const slot of r.slots) {
        const [y,m,d]=date.split('-').map(Number),[h,min,sec]=slot.start.split(':').map(Number),l=Solar.fromYmdHms(y,m,d,h,min,sec).getLunar();
        check(slot.yi.join()===l.getTimeYi().join()&&slot.ji.join()===l.getTimeJi().join()&&slot.chong===l.getTimeChongDesc()&&slot.timeGanZhi===l.getTimeInGanZhi(),'六十日各时段保留库原始宜忌冲干支');
      }
    }
    for(const event of Object.keys(ELECTION_EVENTS)) for(const ruleMode of Object.keys(ELECTION_MODES)) {
      const r=calculateElectionHours({...input,event,ruleMode},'2026-10-12');
      check(r.slots.filter(s=>s.status==='candidate').every(s=>!s.lateZi&&s.timeAssessment==='support'&&s.dayRules.filter(d=>d.selected).every(d=>d.assessment==='support')),'七事项三口径共同候选约束');
    }
    const blocked=calculateElectionHours({...input,weekdays:[0]},'2026-10-12');check(blocked.slots.every(s=>s.status==='excluded'),'星期条件沿用');
    const chong=Solar.fromYmd(2026,10,12).getLunar().getDayChongShengXiao();check(calculateElectionHours({...input,excludedZodiacs:[ZODIACS.indexOf(chong as typeof ZODIACS[number])]},'2026-10-12').slots.every(s=>s.status==='excluded'),'日冲排除沿用');
    for(const date of ['1900-01-01','2000-02-29','2025-07-25','2026-12-31','2100-12-31']) check(calculateElectionHours({...input,startDate:date,endDate:date},date).slots.at(-1)?.endSecond===86400,'范围端点闰年闰月跨年');
    for(const date of [null,1,'2026-2-4','2026-10-11','2026-10-15','1900-02-29']) rejects(()=>calculateElectionHours(input,date),'非法及越界日期拒绝');
    const oldTZ=process.env.TZ;process.env.TZ='America/Los_Angeles';const western=calculateElectionHours(input,'2026-10-12');process.env.TZ='Asia/Shanghai';check(JSON.stringify(western)===JSON.stringify(calculateElectionHours(input,'2026-10-12')),'宿主时区不改变北京时间');if(oldTZ===undefined)delete process.env.TZ;else process.env.TZ=oldTZ;
    let id='';const chosen=[{date:'2026-10-12',slotId:ordinary.slots[0].id},{date:'2026-10-12',slotId:late.id}];
    await runAsUser(a,async()=>{
      const old=createElectionPlan({title:'升级旧择日',input,selectedDates:['2026-10-12'],notes:'旧资料保留'}).plan;
      const q=createQimenSession({title:'保留奇门',question:'合成迁移核对',input:{method:'chaibu',dateTime:'2026-10-12T12:00:00'}}).session;
      getDatabase().exec('ALTER TABLE election_plans DROP COLUMN selected_times_json; DELETE FROM schema_migrations WHERE version=56;');closeDatabaseConnection();
      check(getElectionPlan(old.id)?.selectedTimes.length===0&&getElectionPlan(old.id)?.notes==='旧资料保留'&&JSON.stringify(getElectionPlan(old.id)?.result)===JSON.stringify(old.result),'v55升级v56旧择日快照不改动且时段默认空');
      check(Boolean(getQimenSession(q.id))&&(getDatabase().prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {v:number}).v===56,'升级保留奇门及数据库版本');
      const saved=createElectionPlan({title:'时辰合成方案',input,selectedTimes:chosen});id=saved.plan.id;
      check(saved.plan.selectedTimes.length===2&&saved.plan.selectedTimes[1].slot.status==='review','保存候选与待核时段原始状态');
      check(createElectionPlan({title:'时辰合成方案',input,selectedTimes:[...chosen].reverse()}).reused,'乱序选择规范后幂等');
      for(const selectedTimes of [null,{},[...chosen,...chosen],[chosen[0],chosen[0]],[{date:'2026-10-11',slotId:'0-3600'}],[{date:'2026-10-12',slotId:'0-7200'}],[{...chosen[0],slot:{status:'candidate'}}]]) rejects(()=>updateElectionPlan(id,{selectedTimes}),'数量重复越界伪造快照拒绝');
      const snapshot=JSON.stringify(saved.plan.selectedTimes);updateElectionPlan(id,{notes:'更新安排'});check(JSON.stringify(getElectionPlan(id)?.selectedTimes)===snapshot,'改备注不重算时段');
      const updated=updateElectionPlan(id,{selectedTimes:[chosen[1]]});check(updated.selectedTimes.length===1&&JSON.stringify(updated.selectedTimes[0])===JSON.stringify(saved.plan.selectedTimes[1]),'取消部分时段保留其他快照');
      closeDatabaseConnection();check(getElectionPlan(id)?.selectedTimes[0].version===ELECTION_HOURS_VERSION,'重开按原版回看');
      const archive=await createLocalBackupArchive();deleteElectionPlan(id);await restoreLocalBackupArchive({archive:archive.buffer,confirmation:LOCAL_BACKUP_CONFIRMATION});check(getElectionPlan(id)?.selectedTimes[0].slot.lateZi,'整库备份恢复已选时段');
      check((getDatabase().pragma('foreign_key_check') as unknown[]).length===0,'外键完整性');
    });
    const context={params:Promise.resolve({id})};
    for(const [token,status] of [[undefined,401],[tokenB,404],[tokenA,200]] as const) {
      const r=await patch(request(token,{selectedTimes:chosen},'PATCH'),context);check(r.status===status,'匿名跨账号修改时段拒绝');await r.json();
      const v=await read(request(token,undefined,'GET'),context);check(v.status===status,'匿名跨账号读取时段拒绝');await v.json();
    }
    const anon=await hours(request(undefined,{input,date:'2026-10-12'}));check(anon.status===401,'匿名时辰查询拒绝');await anon.json();
    const http=await hours(request(tokenA,{input,date:'2026-10-12'}));check(http.status===200&&(await http.json()).hours.slots.length===13,'时辰HTTP计算');
    for(const body of [null,[],{}, {input,date:'2026-10-15'},{input:{...input,event:'__proto__'},date:'2026-10-12'}]) {const r=await hours(request(tokenA,body));check(r.status===400,'时辰HTTP输入校验');await r.json();}
    console.log(`择日吉时专项通过：${checks}项；日时组合、六十日各时段、早晚子时、实际交节、保存快照、v56迁移、备份与账号隔离；未调用AI。`);
  } finally {
    globalThis.fetch=originalFetch;runAsUser(a,closeDatabaseConnection);runAsUser(b,closeDatabaseConnection);closeAccountConnections();
    if(path.dirname(path.resolve(directory))!==path.resolve(tmpdir()))throw new Error('临时目录边界不正确');rmSync(directory,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
