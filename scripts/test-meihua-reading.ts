import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Solar } from 'lunar-javascript';
import { calculateMeihua, normalizeMeihuaInput } from '../lib/meihua/engine';
import { meihuaSeasonState } from '../lib/meihua/reading-engine';
import { MEIHUA_READING_VERSION } from '../lib/meihua/reading-types';
import type { Element } from '../lib/meihua/types';
import { registerUser, createSession, closeAccountConnections, SESSION_COOKIE } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { getDatabase, closeDatabaseConnection } from '../lib/db/client';
import { createMeihuaSession, getMeihuaSession, deleteMeihuaSession } from '../lib/db/meihua';
import { buildMeihuaMessages, sendMeihuaMessage, getMeihuaDetail, stopMeihuaMessage } from '../lib/meihua/chat';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { GET as read, DELETE as remove } from '../app/api/meihua/[id]/route';
import { POST as preview } from '../app/api/meihua/preview/route';
import { POST as save } from '../app/api/meihua/route';
import { POST as chat } from '../app/api/meihua/[id]/messages/route';
import { POST as cancel } from '../app/api/meihua/[id]/cancel/route';
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-meihua-reading-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'fallback.sqlite');
process.env.AI_PROVIDER = 'deepseek'; process.env.DEEPSEEK_API_KEY = 'synthetic-meihua-reading-key';
let checks = 0, calls = 0, mode = 'normal';
function check(condition: unknown, label: string): asserts condition { assert.ok(condition, label); checks++; }
const rejects = (work: () => unknown, label: string) => { assert.throws(work, label); checks++; };
const server = createServer(async (req, res) => {
  calls++; let raw = ''; for await (const chunk of req) raw += chunk;
  const facts = JSON.parse(JSON.parse(raw).messages.at(-1).content);
  if (mode === 'fail') { res.writeHead(503); res.end('synthetic-meihua-reading-key internal'); return; }
  if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 120));
  const evidenceIds = mode === 'bad' ? ['missing'] : facts.result.reading ? ['reading:season', 'reading:relations', 'reading:timing', ...(facts.result.reading.imagery ? ['reading:imagery:policy'] : []), ...(facts.result.reading.scenario ? ['reading:scenario:policy'] : [])] : ['gua:primary', 'relation:primary'];
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ content: '## 合成梅花条件观察\n\n只核对已保存结构、季节时间与明确参考卦，月份候选不代表确定日期。', evidenceIds }) } }], usage: { prompt_tokens: 20, completion_tokens: 30 } }));
});
const input = { method: 'objects', objectCount: '10', dateTime: '2026-10-15T18:30:00', seasonPolicy: 'jie_month', timingTarget: 'changed_use' };
function request(token?: string, method = 'GET', data?: unknown) { return new Request('http://local/api/meihua', { method, headers: { 'Content-Type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }); }
async function main() {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address();
  if (!address || typeof address === 'string') throw new Error('模拟地址不可用'); process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}`;
  const a = await registerUser({ username: 'meihua-reading-a', password: randomUUID() }), b = await registerUser({ username: 'meihua-reading-b', password: randomUUID() });
  const tokenA = createSession(a.id), tokenB = createSession(b.id); let id = '';
  try {
    const elements: Element[] = ['木', '火', '土', '金', '水'];
    const expected = [['旺','休','囚','死','相'],['相','旺','休','囚','死'],['死','相','旺','休','囚'],['囚','死','相','旺','休'],['休','囚','死','相','旺']];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) check(meihuaSeasonState(elements[i], elements[j]) === expected[i][j], '独立25格季节矩阵');
    rejects(() => meihuaSeasonState('__proto__' as Element, '木'), '继承键不是五行');
    for (let upper = 1; upper <= 8; upper++) for (let lower = 1; lower <= 8; lower++) for (let movingLine = 1; movingLine <= 6; movingLine++) for (const mutualPolicy of ['middle_lines','pure_changed']) {
      const r = calculateMeihua({ method: 'manual', upper, lower, movingLine, mutualPolicy });
      check(r.reading?.version === MEIHUA_READING_VERSION && r.reading.status === 'needs_time', '768种卦变没有时间不套当前季节');
      check(r.reading.rows.length === 5 && r.reading.rows.every(row => row.state === null), '体本用互变五位置均无虚构季节');
      check(r.reading.rows[0].trigram.number === (movingLine <= 3 ? upper : lower), '体始终为本卦不含动爻侧');
      check(r.reading.rows[4].trigram.number === r.changed[r.use.position].number, '变用仍与固定原体比较');
      check(r.reading.groups.reduce((n, group) => n + group.positions.length, 0) === 4, '四个用位不重复投票');
      check(new Set(r.evidence.map(e => e.id)).size === r.evidence.length, '每种结构依据ID唯一');
      check(r.reading.timing.conditions.length === 3 && r.reading.timing.number === r.body.trigram.number, '默认明确参考体而非任意卦数加总');
    }
    for (let count = 1; count <= 32; count++) for (let hour = 1; hour <= 12; hour++) {
      const h = hour === 1 ? 0 : hour * 2 - 2;
      const r = calculateMeihua({ ...input, objectCount: String(count), dateTime: `2026-10-15T${String(h).padStart(2,'0')}:30:00` });
      check(r.primary.upper.number === (count % 8 || 8) && r.primary.lower.number === (hour % 8 || 8), '物数与时数分别取上下卦');
      check(r.movingLine === ((count + hour) % 6 || 6), '物数动爻使用原数加时，非上下卦余数加总');
    }
    const large = '999999999999999999999999999999';
    const big = calculateMeihua({ ...input, objectCount: large });
    check(big.primary.upper.number === Number(BigInt(large) % BigInt(8)) && big.movingLine === Number((BigInt(large) + BigInt(10)) % BigInt(6)), '物数30位不丢精度');
    const base = { method: 'manual', upper: 1, lower: 1, movingLine: 1 };
    check(JSON.stringify(normalizeMeihuaInput(base))===JSON.stringify(normalizeMeihuaInput({...base,seasonPolicy:'jie_month',timingTarget:'body'})), '省略与显式默认口径规范为同一输入');
    const noTime = calculateMeihua(base), contextual = calculateMeihua({ ...base, contextDateTime: '2026-02-05T12:00' });
    check(JSON.stringify([noTime.primary,noTime.mutual,noTime.changed]) === JSON.stringify([contextual.primary,contextual.mutual,contextual.changed]) && contextual.calendar === null, '补季节时间不改起卦结构或伪造起卦历法');
    check(contextual.reading?.context?.monthBranch === '寅' && contextual.reading.context.source === 'context', '立春后节令月木');
    const lunar = calculateMeihua({ ...base, contextDateTime: '2026-02-05T12:00', seasonPolicy: 'lunar_month' });
    check(lunar.reading?.context?.monthBranch === '丑' && lunar.reading.context.monthElement === '土', '春节前农历十二月土，与节令分开');
    const terms = (Solar.fromYmdHms(2026,7,1,12,0,0).getLunar() as unknown as {getJieQiTable():Record<string,{toYmdHms():string}>}).getJieQiTable();
    for (const name of ['立春','惊蛰','清明','立夏','芒种','小暑','立秋','白露','寒露','立冬','大雪','小寒']) {
      const at = terms[name].toYmdHms().replace(' ','T'), previous = new Date(new Date(at+'Z').getTime()-1000).toISOString().slice(0,19);
      const before = calculateMeihua({ ...base, contextDateTime: previous }), after = calculateMeihua({ ...base, contextDateTime: at });
      check(before.reading?.context?.monthBranch !== after.reading?.context?.monthBranch, '十二节前后一秒换月');
    }
    const leap = calculateMeihua({ ...base, contextDateTime: '2025-07-25T12:00', seasonPolicy: 'lunar_month' });
    check(leap.reading?.context?.leapMonth && leap.reading.context.monthBranch === '未', '农历闰六月同名未月土');
    for (const timingTarget of ['body','use','changed_use'] as const) {
      const r = calculateMeihua({ ...base, timingTarget });
      const wanted = timingTarget === 'body' ? r.body.trigram : timingTarget === 'use' ? r.use.trigram : r.changed[r.use.position];
      check(r.reading?.timing.trigram.number === wanted.number && r.reading.timing.conditions.every(c => c.branches.length > 0), '应期严格使用明确参考卦');
    }
    for (const raw of [{ ...input, objectCount:'0' },{ ...input,objectCount:2 },{ ...input,objectCount:'-2' },{ ...input,objectCount:'9'.repeat(31) },{ ...input,dateTime:undefined },{ ...input,contextDateTime:input.dateTime },{ ...base,contextDateTime:'2026-02-30T12:00' },{ ...base,seasonPolicy:'__proto__' },{ ...base,timingTarget:'constructor' },{ ...base,contextDateTime:'2026-10-15T12:00Z' }]) rejects(() => normalizeMeihuaInput(raw), '新参数严格校验');
    await runAsUser(a, async () => {
      const made = createMeihuaSession({ title:'梅花深化合成', question:'合成条件复核，不代表现实预测', input }); id = made.session.id;
      check(Boolean(made.session.result.reading) && calls === 0, '保存带深化快照且不AI');
      check(createMeihuaSession({ title:'梅花深化合成', question:made.session.question, input:{ ...input,objectCount:'00010' } }).reused, '物数规范后保存幂等');
      const snapshot = JSON.stringify(made.session.result), prompt = buildMeihuaMessages(made.session, [], '复核');
      check(prompt[0].content.includes('本记录含季节') && prompt[0].content.includes('不乘动爻'), '新策略只用保存条件且不换算确定日期');
      await sendMeihuaMessage(id, { message:'解释明确参考卦', requestId:randomUUID() });
      check(getMeihuaDetail(id).turns[0].status === 'completed' && getMeihuaDetail(id).turns[0].evidenceIds.every(e => e.startsWith('reading:')), '新回复引用深化依据');
      mode='slow'; const pending=sendMeihuaMessage(id,{message:'停止新复核',requestId:randomUUID()}); const turn=getMeihuaDetail(id).turns.at(-1)!; stopMeihuaMessage(id,turn.id); await pending;
      check(getMeihuaDetail(id).turns.at(-1)?.status==='canceled','深化停止保留问题');
      mode='fail'; await assert.rejects(sendMeihuaMessage(id,{message:'失败复核',requestId:randomUUID()}), e=>e instanceof Error&&!e.message.includes('synthetic-meihua-reading-key')); checks++;
      const failed=getMeihuaDetail(id).turns.at(-1)!; mode='normal';await sendMeihuaMessage(id,{message:failed.message,retryOf:failed.id,requestId:randomUUID()});check(getMeihuaDetail(id).turns.at(-1)?.status==='completed','深化失败可重试');
      check(JSON.stringify(getMeihuaSession(id)?.result)===snapshot,'所有问答不改保存时规则事实');
      const legacy=createMeihuaSession({title:'第一版合成',question:'旧版回看',input:base}).session;
      const old=structuredClone(legacy.result);delete old.reading;old.evidence=old.evidence.filter(e=>!e.id.startsWith('reading:'));
      getDatabase().prepare('UPDATE meihua_sessions SET result_json=? WHERE id=?').run(JSON.stringify(old),legacy.id);
      check(!getMeihuaSession(legacy.id)?.result.reading && buildMeihuaMessages(getMeihuaSession(legacy.id)!,[],'回看')[0].content.includes('第一版固定快照'),'旧JSON不补算，新旧问答策略分开');
      await sendMeihuaMessage(legacy.id,{message:'只核原结构',requestId:randomUUID()});check(JSON.stringify(getMeihuaSession(legacy.id)?.result)===JSON.stringify(old),'旧对话不改原快照');
      const archive=await createLocalBackupArchive();deleteMeihuaSession(id);await restoreLocalBackupArchive({archive:archive.buffer,confirmation:LOCAL_BACKUP_CONFIRMATION});
      check(JSON.stringify(getMeihuaSession(id)?.result)===snapshot&&!getMeihuaSession(legacy.id)?.result.reading,'整库恢复新旧快照原样保留');
      closeDatabaseConnection();check(Boolean(getMeihuaSession(id)?.result.reading),'重开连接保留深化');
    });
    const context={params:Promise.resolve({id})};
    for (const [token,status] of [[undefined,401],[tokenB,404],[tokenA,200]] as const) {const r=await read(request(token),context);check(r.status===status,'新快照账号隔离');await r.json();}
    for (const fn of [chat,cancel]) {const r=await fn(request(tokenB,'POST',fn===chat?{message:'越权',requestId:randomUUID()}:{turnId:randomUUID()}),context);check(r.status===404,'跨账号发问停止拒绝');await r.json();}
    const denied=await remove(request(tokenB,'DELETE'),context);check(denied.status===404,'跨账号删除拒绝');await denied.json();
    const invalid=await preview(request(tokenA,'POST',{...input,seasonPolicy:'constructor'}));check(invalid.status===400,'HTTP拒绝继承参数');await invalid.json();
    const forged=await save(request(tokenA,'POST',{title:'伪造复核合成',question:'服务端重算',input,userId:b.id,result:{reading:'FORGED'}}));const saved=await forged.json();check(forged.status===201&&saved.session.result.reading.version===MEIHUA_READING_VERSION,'服务端重算忽略伪造账号与reading');
    console.log(`梅花深化专项通过：${checks}项；季节矩阵、768卦变、物数时数、大数、节界、条件应期、新旧快照、问答停止重试、账号及备份。`);
  } finally {
    runAsUser(a,closeDatabaseConnection);runAsUser(b,closeDatabaseConnection);closeAccountConnections();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
    if(path.dirname(path.resolve(directory))!==path.resolve(tmpdir()))throw new Error('清理目录越出临时范围');rmSync(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
