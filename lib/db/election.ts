import { createHash, randomUUID } from 'node:crypto';
import { getDatabase } from './client';
import { ElectionError } from '@/lib/election/engine';
import { calculatePersonalElection, calculatePersonalElectionHours } from '@/lib/election/personal-service';
import type { PersonalElectionSnapshot } from '@/lib/election/personal-types';
import type { ElectionTimeSelection } from '@/lib/election/hours-types';
import type { ElectionInput, ElectionPlan, ElectionPlanSummary, ElectionResult } from '@/lib/election/types';
type Row = { id:string;title:string;input_json:string;result_json:string;selected_dates_json:string;selected_times_json:string;notes:string;created_at:number;updated_at:number };
function plan(r:Row): ElectionPlan { const result:ElectionResult = JSON.parse(r.result_json); return { id:r.id,title:r.title,input:JSON.parse(r.input_json),result,counts:result.counts,selectedTimes:JSON.parse(r.selected_times_json),selectedDates:JSON.parse(r.selected_dates_json),notes:r.notes,createdAt:r.created_at,updatedAt:r.updated_at }; }
function text(raw:unknown,max:number,label:string,required=false) { if (typeof raw !== 'string' || raw.trim().length > max || (required && !raw.trim())) throw new ElectionError(`${label}需为${required ? '1' : '0'}–${max}字文本`); return raw.trim(); }
function selectedDates(raw:unknown,result:ElectionResult):string[] { if (!Array.isArray(raw) || raw.length > 3 || raw.some(d => typeof d !== 'string' || !result.days.some(day => day.date === d))) throw new ElectionError('对照日期最多 3 个，且需位于当前筛选区间内'); return [...new Set(raw as string[])].sort(); }
function fingerprint(title:string,notes:string,input:ElectionInput,result:ElectionResult,dates:string[],times:ElectionTimeSelection[]) { return createHash('sha256').update(JSON.stringify({ version:result.version,title,notes,input,...(result.personal ? {personal:result.personal} : {}),dates,times:times.map(t=>({date:t.date,slotId:t.slotId,version:t.version})) })).digest('hex'); }
export function getElectionPlan(id:string) { const r = getDatabase().prepare('SELECT * FROM election_plans WHERE id = ?').get(id) as Row|undefined; return r ? plan(r) : null; }
export function listElectionPlans():ElectionPlanSummary[] { type SummaryRow = Omit<Row,'result_json'|'selected_times_json'> & { counts_json:string }; return (getDatabase().prepare("SELECT id,title,input_json,json_extract(result_json, '$.counts') AS counts_json,selected_dates_json,notes,created_at,updated_at FROM election_plans ORDER BY updated_at DESC LIMIT 100").all() as SummaryRow[]).map(r => ({ id:r.id,title:r.title,input:JSON.parse(r.input_json),counts:JSON.parse(r.counts_json),selectedDates:JSON.parse(r.selected_dates_json),notes:r.notes,createdAt:r.created_at,updatedAt:r.updated_at })); }
export function createElectionPlan(raw:unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ElectionError('请提交有效的择日方案');
  const v = raw as Record<string,unknown>;
  const title = text(v.title,80,'方案名称',true), notes = text(v.notes ?? '',1000,'备注'), result = calculatePersonalElection(v.input), dates = selectedDates(v.selectedDates ?? [],result), input = result.input, times = selectTimes(v.selectedTimes ?? [],input,[],result.personal);
  const hash = fingerprint(title,notes,input,result,dates,times);
  return getDatabase().transaction(() => { const existing = getDatabase().prepare('SELECT * FROM election_plans WHERE input_fingerprint = ?').get(hash) as Row|undefined; if (existing) return { plan:plan(existing),reused:true }; const id = randomUUID(),now = Date.now(); getDatabase().prepare('INSERT INTO election_plans (id,title,input_fingerprint,input_json,result_json,selected_dates_json,selected_times_json,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,title,hash,JSON.stringify(input),JSON.stringify(result),JSON.stringify(dates),JSON.stringify(times),notes,now,now); return { plan:getElectionPlan(id)!,reused:false }; })();
}
export function updateElectionPlan(id:string,raw:unknown) {
  return getDatabase().transaction(() => {
    const saved = getElectionPlan(id); if (!saved) throw new ElectionError('择日方案不存在',404);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ElectionError('修改参数格式不正确'); const v = raw as Record<string,unknown>;
    if (!Object.keys(v).length || Object.keys(v).some(k => !['title','notes','selectedDates','selectedTimes'].includes(k))) throw new ElectionError('只能修改方案名称、备注、对照日期与时段；筛选条件请重新建立方案');
    const title = v.title === undefined ? saved.title : text(v.title,80,'方案名称',true), notes = v.notes === undefined ? saved.notes : text(v.notes,1000,'备注'), dates = v.selectedDates === undefined ? saved.selectedDates : selectedDates(v.selectedDates,saved.result), times = v.selectedTimes === undefined ? saved.selectedTimes : selectTimes(v.selectedTimes,saved.input,saved.selectedTimes,saved.result.personal), hash = fingerprint(title,notes,saved.input,saved.result,dates,times);
    const duplicate = getDatabase().prepare('SELECT id FROM election_plans WHERE input_fingerprint = ? AND id != ?').get(hash,id); if (duplicate) throw new ElectionError('已有相同方案，请使用已保存的记录',409);
    getDatabase().prepare('UPDATE election_plans SET title = ?,notes = ?,selected_dates_json = ?,selected_times_json = ?,input_fingerprint = ?,updated_at = ? WHERE id = ?').run(title,notes,JSON.stringify(dates),JSON.stringify(times),hash,Date.now(),id); return getElectionPlan(id)!;
  })();
}
export function deleteElectionPlan(id:string) { return getDatabase().prepare('DELETE FROM election_plans WHERE id = ?').run(id).changes === 1; }

// 客户端只提交时段标识。新增选择重新计算；保留的选择沿用保存快照，避免改备注时悄悄改动依据。
function selectTimes(raw: unknown, input: ElectionInput, saved: ElectionTimeSelection[] = [], personal?: PersonalElectionSnapshot): ElectionTimeSelection[] {
  if (!Array.isArray(raw) || raw.length > 3) throw new ElectionError('最多保存三个时段');
  const unique = new Set<string>();
  const cache = new Map<string, ReturnType<typeof calculatePersonalElectionHours>>();
  return raw.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ElectionError('时段选择格式不正确');
    const v = value as Record<string, unknown>;
    if (Object.keys(v).some(k => !['date','slotId'].includes(k)) || typeof v.date !== 'string' || typeof v.slotId !== 'string') throw new ElectionError('时段只能提交日期与时段标识');
    if (v.date < input.startDate || v.date > input.endDate) throw new ElectionError('所选时段日期需位于方案区间内');
    const key = `${v.date}/${v.slotId}`;
    if (unique.has(key)) throw new ElectionError('不能重复选择同一时段');
    unique.add(key);
    const existing = saved.find(t => t.date === v.date && t.slotId === v.slotId);
    if (existing) return existing;
    let hours = cache.get(v.date);
    if (!hours) { hours = calculatePersonalElectionHours(input,v.date,personal); cache.set(v.date,hours); }
    const slot = hours.slots.find(t => t.id === v.slotId);
    if (!slot) throw new ElectionError('时段已变化或无效，请重新查看该日时辰');
    return { date: v.date, slotId: v.slotId, version: hours.version, source: hours.source, policy: hours.policy, slot };
  }).sort((a,b) => a.date.localeCompare(b.date) || a.slot.startSecond - b.slot.startSecond);
}
