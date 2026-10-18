import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const base = process.env.GUANCHEN_QA_URL || 'http://127.0.0.1:30002';
if (!/^http:\/\/(127\.0\.0\.1|localhost):30002$/.test(base)) throw new Error('只允许独立 QA 服务');
const results = [];
const run = async (label, url, token, method = 'GET', body) => {
  const response = await fetch(base + url, { method, headers: { ...(token ? { cookie: token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  return { response, text, data: (() => { try { return JSON.parse(text); } catch { return null; } })() };
};
const check = (label, condition, details = {}) => { results.push({ label, passed: !!condition, ...details }); assert.ok(condition, label); };
const cookie = response => response.headers.get('set-cookie')?.split(';')[0];
const prefix = 'http-' + Date.now().toString(36);
const a = await run('注册甲', '/api/auth/register', null, 'POST', { username: prefix + '-a', displayName: 'HTTP测试甲', password: 'synthetic-http-password-a', role: 'admin', userId: 'forged' });
check('注册不能指定权限与身份', a.response.status === 201 && a.data.user.role === 'user');
check('会话 Cookie 受保护', /HttpOnly/i.test(a.response.headers.get('set-cookie')) && /SameSite=Lax/i.test(a.response.headers.get('set-cookie')));
const tokenA = cookie(a.response);
const b = await run('注册乙', '/api/auth/register', null, 'POST', { username: prefix + '-b', displayName: 'HTTP测试乙', password: 'synthetic-http-password-b' });
check('注册乙', b.response.status === 201);
const tokenB = cookie(b.response);
const files = directory => readdirSync(directory, {withFileTypes:true}).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory,entry.name)]);
for (const file of files('app/api').filter(file => file.endsWith('route.ts'))) {
  const normalized = file.replaceAll('\\', '/');
  if (/\/auth\/(login|register|logout|session)\//.test(normalized)) continue;
  const source = readFileSync(file, 'utf8');
  const url = '/' + normalized.replace(/^app\//, '').replace(/\/route.ts$/, '').replace(/\[[^\]]+\]/g, '00000000-0000-4000-8000-000000000099');
  for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
    if (!new RegExp(`export const ${method} = withAccount`).test(source)) continue;
    const result = await run('未登录拒绝', url, null, method, ['POST','PATCH','PUT'].includes(method) ? {} : undefined);
    check(`${method} ${url} 未登录拒绝`, result.response.status === 401, { status: result.response.status });
  }
}
const chart = await run('排盘', '/api/generate', tokenA, 'POST', { name: 'HTTP甲私密命盘', year:1992, month:7, day:9, hour:4, gender:'female' });
check('登录后可排盘', chart.response.status === 200);
const created = await run('保存命盘', '/api/conversations', tokenA, 'POST', { chartSnapshot: chart.data, title:'HTTP甲私密档案', userId:b.data.user.id });
check('客户端 userId 不改变归属', created.response.status === 201);
const id = created.data.conversation.id;
const reply = await run('聊天', `/api/conversations/${id}/respond`, tokenA, 'POST', { message:'HTTP甲的私密聊天测试', requestId:crypto.randomUUID() });
check('流式聊天成功', reply.response.status === 200 && reply.text.includes('[DONE]'));
const own = await run('本人读取', `/api/conversations/${id}`, tokenA);
check('本人聊天持久化', own.response.status === 200 && own.text.includes('HTTP甲的私密聊天测试'));
const foreign = await run('乙读取甲', `/api/conversations/${id}`, tokenB);
check('乙不能读取甲', foreign.response.status === 404 && !foreign.text.includes('HTTP甲'));
for (const method of ['PATCH','DELETE']) {
  const result = await run('越权写', `/api/conversations/${id}`, tokenB, method, method === 'PATCH' ? { title:'恶意覆盖' } : undefined);
  check(`乙不能${method}甲`, result.response.status === 404);
}
const otherList = await run('乙列表', '/api/conversations?q=HTTP&userId=' + a.data.user.id, tokenB);
check('列表与搜索隔离', otherList.data.total === 0 && !otherList.text.includes('HTTP甲'));
const admin = await run('普通用户管理', '/api/admin/users', tokenB);
check('普通用户不能访问管理列表', admin.response.status === 403);
const profiles = await run('八字', '/api/bazi/profiles', tokenA, 'POST', { displayName:'HTTP甲八字', birthDate:'1992-07-09', birthTime:'08:30', gender:'female', unknownTime:false, timeZoneId:'Asia/Shanghai', longitude:116.4074, initialChart:{timeStandard:'civil_time',lateZiPolicy:'same_day'} });
check('八字档案可保存', profiles.response.status === 201);
const profileId = profiles.data.profile.id;
const versionId = profiles.data.profile.charts[0].id;
check('八字档案隔离', (await run('八字越权', `/api/bazi/profiles/${profileId}`, tokenB)).response.status === 404);
check('八字版本隔离', (await run('版本越权', `/api/bazi/charts/${versionId}`, tokenB)).response.status === 404);
const baziConversation = await run('八字对话', '/api/bazi/conversations', tokenA, 'POST', { chartVersionId:versionId });
check('八字对话可建立', baziConversation.response.status === 201);
check('八字对话隔离', (await run('八字对话越权', `/api/bazi/conversations/${baziConversation.data.conversation.id}`, tokenB)).response.status === 404);
const report = await run('专题报告', `/api/conversations/${id}/reports`, tokenA, 'POST', { type:'overview' });
check('专题报告可生成', report.response.status < 300);
// 各模块的 ID 校验由独立业务数据库覆盖，报告详情及下载仍需要实际 HTTP 复核。
const reportId = report.data.report?.id ?? report.data.detail?.report?.id;
check('报告返回有效 ID', !!reportId);
check('报告详情隔离', (await run('报告越权', `/api/reports/${reportId}`, tokenB)).response.status === 404);
const exportResult = await run('PDF导出', '/api/report-exports', tokenA, 'POST', { sourceKind:'topic', reportId });
check('PDF可导出', exportResult.response.status < 300);
const exportId = exportResult.data.record?.id ?? exportResult.data.export?.id;
check('PDF返回有效 ID', !!exportId);
const download = await run('PDF下载', `/api/report-exports/${exportId}/download`, tokenA);
check('本人可下载 PDF', download.response.status === 200 && download.text.startsWith('%PDF-'));
const blockedDownload = await run('PDF越权', `/api/report-exports/${exportId}/download`, tokenB);
check('乙不能下载甲 PDF', blockedDownload.response.status === 404 && !blockedDownload.text.startsWith('%PDF-'));
const csrf = await fetch(base + '/api/auth/login', {method:'POST',headers:{'content-type':'application/json',origin:'https://untrusted.example'},body:JSON.stringify({username:prefix+'-a',password:'synthetic-http-password-a'})});
check('登录拒绝跨站写入', csrf.status === 403);
const change = await run('修改密码', '/api/auth/password', tokenA, 'POST', { oldPassword:'synthetic-http-password-a', newPassword:'synthetic-http-new-password' });
check('修改密码成功', change.response.status === 200);
check('改密后旧会话失效', (await run('旧会话', '/api/conversations', tokenA)).response.status === 401);
const newLogin = await run('新密码登录', '/api/auth/login', null, 'POST', {username:prefix+'-a',password:'synthetic-http-new-password'});
check('新密码可登录', newLogin.response.status === 200);
const newToken = cookie(newLogin.response);
const logout = await run('退出', '/api/auth/logout', newToken, 'POST');
check('退出成功', logout.response.status === 200);
check('退出后会话不可重用', (await run('重放', '/api/conversations', newToken)).response.status === 401);
const output = path.join(tmpdir(), 'guanchen-accounts-http-result.json');
writeFileSync(output, JSON.stringify({ total:results.length, passed:results.filter(item=>item.passed).length, results },null,2));
console.log(JSON.stringify({ total:results.length, passed:results.length, output }));
