import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

// 仅对专用验收服务发请求；禁止把异常输入投向正式服务。
const base = 'http://127.0.0.1:30002';
const results = [];
async function check(label, route, method, body, expected) {
  const response = await fetch(base + route, { method, ...(body === undefined ? {} : { body, headers: { 'content-type': 'application/json' } }), signal: AbortSignal.timeout(20000) });
  const content = await response.text();
  results.push({ label, route, method, status: response.status, passed: expected(response.status), response: content.slice(0,350) });
}
const reject = status => status >= 400 && status < 500;
const writeRoutes = ['/api/generate','/api/heming','/api/conversations','/api/bazi/calculate','/api/bazi/profiles','/api/bazi/conversations','/api/rectifications','/api/cases','/api/cases/preview','/api/reminders','/api/monthly-reviews','/api/report-exports','/api/report-user-revisions','/api/case-comparisons'];
for (const route of writeRoutes) {
  for (const body of ['{','null','{}','[]']) await check(`拒绝无效请求 ${body}`, route, 'POST', body, reject);
}
for (const input of [
  { year: 2026, month: 2, day: 30, hour: 4 },
  { year: 1992, month: 7, day: 9, hour: null },
  { year: 1992, month: 7, day: 9, hour: false },
]) await check('排盘日期与时辰边界', '/api/generate', 'POST', JSON.stringify(input), reject);
for (const chartSnapshot of [{ palaces: [] }, { palaces: Array(12).fill(null) }, { palaces: Array(12).fill({}) }]) {
  await check('拒绝损坏命盘快照', '/api/conversations', 'POST', JSON.stringify({ chartSnapshot }), reject);
}
for (const origin of ['https://untrusted.example', 'null', 'http://localhost:30002', 'https://127.0.0.1:30002', 'http://127.0.0.1:30002']) {
  const response = await fetch(base + '/api/generate', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ year: 1992, month: 7, day: 9, hour: 4, gender: 'female' }) });
  const expected = origin === base ? 200 : 403;
  results.push({ label: '写入来源校验', origin, status: response.status, passed: response.status === expected });
}
const walk = directory => readdirSync(directory, { withFileTypes:true }).flatMap(item => item.isDirectory() ? walk(path.join(directory,item.name)) : [path.join(directory,item.name)]);
const routes = walk('app/api').filter(file => file.endsWith('route.ts'));
for (const file of routes) {
  if (!file.includes('[') || !/export async function GET/.test(readFileSync(file,'utf8'))) continue;
  const route = '/' + file.replaceAll('\\','/').replace(/^app\//,'').replace(/\/route.ts$/,'').replace(/\[[^\]]+\]/g,'00000000-0000-4000-8000-000000000099');
  await check('不存在资源不得返回服务端异常',route,'GET',undefined,status => status >= 200 && status < 500);
}
for (const file of routes) {
  if (!file.includes('[')) continue;
  const source = readFileSync(file, 'utf8');
  const route = '/' + file.replaceAll('\\', '/').replace(/^app\//, '').replace(/\/route.ts$/, '').replace(/\[[^\]]+\]/g, '00000000-0000-4000-8000-000000000099');
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    if (!source.includes(`export async function ${method}`)) continue;
    await check('不存在资源的写操作', route, method, method === 'DELETE' ? undefined : '{}', reject);
  }
}
for (const route of ['/api/conversations?limit=abc&offset=-1&q=%27%20OR%201%3D1--','/api/bazi/profiles?limit=1.2&offset=-3','/api/cases/search?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E','/api/conversations?limit=99999999999999']) {
  await check('查询边界与注入',route,'GET',undefined,status=>status>=200&&status<500);
}
await check('方法限制','/api/generate','DELETE',undefined,status=>status===405);
await check('不存在接口','/api/qa-not-found','GET',undefined,status=>status===404);
const output=path.join(tmpdir(),'guanchen-full-qa-http.json');
writeFileSync(output,JSON.stringify({total:results.length,passed:results.filter(r=>r.passed).length,results},null,2));
console.log(JSON.stringify({total:results.length,failed:results.filter(r=>!r.passed),output},null,2));
process.exitCode=results.every(r=>r.passed)?0:1;
