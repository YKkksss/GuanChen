import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { authenticate, changePassword, closeAccountConnections, consumeAuthLimit, createSession, getUserById, listUsers, promoteLocalAdministrator, registerUser, revokeSession, SESSION_COOKIE, updateUser, userForSession } from '../lib/auth/accounts';
import { runAsUser, userDataDirectory } from '../lib/auth/scope';
import { beginDatabaseMaintenance, closeDatabaseConnection, endDatabaseMaintenance, getDatabase, getDatabasePath, leaseDatabaseScope } from '../lib/db/client';
import { createConversation, getConversation, listConversations } from '../lib/db/conversations';
import { createLocalBackupArchive, inspectLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';
import { getReportExportRoot } from '../lib/report-exports/service';
import { cancelGeneration, startGeneration } from '../lib/chat/generations';
import { generationStream } from '../lib/chat/generation-stream';
import { safeAccountDestination } from '../lib/auth/redirect';

const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-account-security-'));
process.env.ACCOUNT_DATA_DIR = path.join(directory, 'accounts');
process.env.SQLITE_PATH = path.join(directory, 'legacy.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(directory, 'legacy-exports');
let checks = 0;
let rawDatabase: Database.Database | null = null;
function check(value: unknown, message: string) { assert.ok(value, message); checks++; }
function request(url: string, token?: string, method = 'GET', body?: unknown) {
  return new Request(`http://local${url}`, { method, headers: { ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const walk = (root: string): string[] => readdirSync(root, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(root, item.name)) : [path.join(root, item.name)]);

async function main() {
  for (const input of ['//untrusted.example', '/\\untrusted.example', '/\t/untrusted.example', '/\n/untrusted.example', 'https://untrusted.example', '/login?next=/history']) check(safeAccountDestination(input, 'http://local') === '/', '登录跳转不能离开本站或循环登录');
  check(safeAccountDestination('/history?q=test', 'http://local') === '/history?q=test', '安全跳转保留查询条件');
  const original = createConversation({ type: 'chart', title: '原库保留的私密资料' });
  const a = await registerUser({ username: 'Account-A', password: 'synthetic-password-a', displayName: '测试甲' });
  const b = await registerUser({ username: 'account-b', password: 'synthetic-password-b', displayName: '测试乙' });
  check(a.role === 'user' && b.role === 'user', '首个注册用户不能获得管理员权限');
  check(a.username === 'account-a', '用户名大小写规范化');
  await assert.rejects(registerUser({ username: 'ACCOUNT-A', password: 'synthetic-password' })); checks++;
  await assert.rejects(registerUser({ username: '../invalid', password: 'synthetic-password' })); checks++;
  await assert.rejects(registerUser({ username: 'short-password', password: 'short' })); checks++;
  check((await authenticate('ACCOUNT-A', 'synthetic-password-a')).id === a.id, '密码登录');
  await assert.rejects(authenticate('account-a', 'wrong-password')); checks++;
  await assert.rejects(authenticate('unknown-user', 'wrong-password')); checks++;
  let tokenA = createSession(a.id);
  const tokenB = createSession(b.id);
  check(userForSession(tokenA)?.id === a.id, '会话绑定用户');
  check(!userForSession('forged') && !userForSession('f'.repeat(64)), '拒绝伪造会话');
  const raw = rawDatabase = new Database(path.join(process.env.ACCOUNT_DATA_DIR!, 'accounts.sqlite'));
  const row = raw.prepare('SELECT password_hash FROM users WHERE id = ?').get(a.id) as {password_hash: string};
  check(row.password_hash.startsWith('scrypt:') && !row.password_hash.includes('synthetic-password-a'), '密码加盐派生存储');
  check(!raw.prepare('SELECT 1 FROM sessions WHERE token_hash = ?').get(tokenA), '会话只保存哈希');
  check(!JSON.stringify(listUsers()).includes('password_hash'), '管理列表不含密码哈希');

  // 枚举所有业务方法，保证新增登录保护没有漏掉下载、备份及次级资源。
  for (const file of walk('app/api').filter(file => file.endsWith('route.ts'))) {
    const normalized = file.replaceAll('\\', '/');
    if (/\/auth\/(login|register|session|logout)\//.test(normalized) || /\/health\/route\.ts$/.test(normalized)) continue;
    const route = await import(`../${normalized}`);
    const url = '/' + normalized.replace(/^app\//, '').replace(/\/route.ts$/, '').replace(/\[[^\]]+\]/g, 'foreign-resource');
    for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
      if (typeof route[method] !== 'function') continue;
      const response = await route[method](request(url, undefined, method), { params: Promise.resolve({}) });
      check(response.status === 401, `未登录接口必须拒绝：${method} ${url}`);
    }
  }
  const healthRoute = await import('../app/api/health/route');
  const healthResponse = await healthRoute.GET(request('/api/health'));
  check(healthResponse.status === 200 && (await healthResponse.json()).service === 'guanchen', '健康检查公开可用且不要求登录');
  const conversationRoute = await import('../app/api/conversations/route');
  const detailRoute = await import('../app/api/conversations/[id]/route');
  const messageRoute = await import('../app/api/conversations/[id]/messages/route');
  const messages = await import('../lib/db/conversations');
  const own = runAsUser(a, () => {
    check(listConversations().length === 0, '新账号无法读取原库');
    check(getDatabasePath().startsWith(userDataDirectory(a)!), '服务端数据库按身份确定');
    check(getReportExportRoot().startsWith(userDataDirectory(a)!), '报告目录按身份确定');
    const conversation = createConversation({ type: 'chart', title: '甲的私密命盘' });
    messages.appendMessage({ conversationId: conversation.id, role: 'user', content: '只有甲可读取的聊天内容', source: 'question' });
    return conversation;
  });
  const context = { params: Promise.resolve({ id: own.id }) };
  let response = await detailRoute.GET(request(`/api/conversations/${own.id}`, tokenA), context);
  check(response.status === 200 && (await response.text()).includes('只有甲可读取'), '自己可以读取聊天');
  response = await conversationRoute.GET(request('/api/conversations?userId=' + a.id, tokenB));
  check((await response.json()).total === 0, '查询参数不能冒充其他用户');
  response = await detailRoute.GET(request(`/api/conversations/${own.id}`, tokenB), context);
  check(response.status === 404, '替换会话 ID 无法读取他人记录'); await response.text();
  response = await detailRoute.PATCH(request(`/api/conversations/${own.id}`, tokenB, 'PATCH', { title: '试图覆盖' }), context);
  check(response.status === 404, '不能修改他人会话'); await response.text();
  response = await detailRoute.DELETE(request(`/api/conversations/${own.id}`, tokenB, 'DELETE'), context);
  check(response.status === 404, '不能删除他人会话'); await response.text();
  response = await messageRoute.GET(request(`/api/conversations/${own.id}/messages`, tokenB), context);
  check(response.status === 404, '消息子接口同样隔离'); await response.text();
  check(runAsUser(a, () => getConversation(own.id)?.title) === '甲的私密命盘', '越权操作不改变原数据');
  response = await detailRoute.GET(request(`/api/conversations/${own.id}`, tokenA, 'HEAD'), context);
  check(response.status === 200 && !response.body, 'HEAD 请求不遗留响应与连接占用');
  check([...globalThis.__guanchenDatabases!.values()].every(slot => slot.leases === 0), '已完成请求均释放连接占用');
  const savedRuntime = process.env.NEXT_RUNTIME;
  process.env.NEXT_RUNTIME = 'nodejs';
  try {
    assert.throws(getDatabase, /缺少账号/); checks++;
    assert.throws(getReportExportRoot, /缺少账号/); checks++;
    check(runAsUser(a, () => getConversation(own.id)?.id) === own.id, '服务端业务只在明确身份下访问数据库');
  } finally { if (savedRuntime === undefined) delete process.env.NEXT_RUNTIME; else process.env.NEXT_RUNTIME = savedRuntime; }
  const concurrent = await Promise.all([a, b, a, b].map(user => runAsUser(user, async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return { user: user.id, ids: listConversations().map(item => item.id) };
  })));
  check(concurrent.every(item => item.ids.includes(own.id) === (item.user === a.id)), '并发请求的异步身份互不覆盖');
  const jobA = runAsUser(a, () => startGeneration('ziwei', own.id, 'same-request-identifier'));
  const jobB = runAsUser(b, () => startGeneration('ziwei', own.id, 'same-request-identifier'));
  check(jobA && jobB, '相同会话 ID 的生成任务按用户隔离');
  runAsUser(b, () => cancelGeneration('ziwei', own.id, 'same-request-identifier'));
  check(!jobA!.controller.signal.aborted && jobB!.controller.signal.aborted, '另一用户的停止请求不能取消本人的任务');
  jobA!.release(); jobB!.release();
  let finishPath = '';
  const stream = runAsUser(a, () => generationStream({ job: startGeneration('ziwei', own.id, 'another-request-identifier')!, requestSignal: new AbortController().signal,
    async *produce() { yield '测试流式回答'; }, savePartial() {}, finish() { finishPath = getDatabasePath(); } }));
  await runAsUser(b, () => new Response(stream).text());
  check(finishPath.startsWith(userDataDirectory(a)!), '跨上下文读取流仍保存到创建者空间');
  const backupA = await runAsUser(a, createLocalBackupArchive);
  const backupB = await runAsUser(b, createLocalBackupArchive);
  const envelope = JSON.parse(gunzipSync(backupB.buffer).toString());
  check(!envelope.inventory.tableCounts.some((item: {name: string}) => item.name === 'users' || item.name === 'sessions'), '个人备份不包含统一账号库');
  const previewA = await inspectLocalBackupArchive(backupA.buffer);
  const previewB = await inspectLocalBackupArchive(backupB.buffer);
  check(previewA.content.conversations > previewB.content.conversations, '备份只包含各自资料');
  const ownB = runAsUser(b, () => createConversation({ type: 'chart', title: '乙的独立档案' }));
  const maintenance = runAsUser(a, beginDatabaseMaintenance);
  try {
    check(runAsUser(b, () => getConversation(ownB.id)?.id) === ownB.id, '甲维护数据库期间乙仍可读取自己的资料');
    assert.throws(() => runAsUser(a, getDatabase), /维护/); checks++;
  } finally { runAsUser(a, () => endDatabaseMaintenance(maintenance)); }
  const scratch = runAsUser(a, () => createConversation({ type: 'chart', title: '甲备份后的临时资料' }));
  await runAsUser(a, () => restoreLocalBackupArchive({ archive: backupA.buffer, fileName: backupA.fileName, confirmation: LOCAL_BACKUP_CONFIRMATION }));
  check(!runAsUser(a, () => getConversation(scratch.id)) && !!runAsUser(a, () => getConversation(own.id)), '甲可以恢复自己的备份');
  check(runAsUser(b, () => getConversation(ownB.id)?.title) === '乙的独立档案', '甲恢复不会覆盖乙的数据');
  check(userForSession(tokenA)?.id === a.id && userForSession(tokenB)?.id === b.id, '个人恢复不会覆盖统一账号及会话');
  const adminRoute = await import('../app/api/admin/users/route');
  response = await adminRoute.GET(request('/api/admin/users', tokenB));
  check(response.status === 403, '普通用户无法查看管理列表'); await response.text();
  promoteLocalAdministrator(a.username);
  check(getUserById(a.id)?.role === 'admin', '部署者指定管理员');
  check(!userForSession(tokenA), '本机变更管理员身份也撤销旧会话');
  tokenA = createSession(a.id);
  response = await adminRoute.GET(request('/api/admin/users', tokenA));
  check(response.status === 200 && (await response.json()).users.length === 2, '管理员可以管理账号');
  assert.throws(() => updateUser(b.id, a.id, { role: 'admin' })); checks++;
  assert.throws(() => updateUser(a.id, a.id, { status: 'disabled' })); checks++;
  updateUser(a.id, b.id, { status: 'disabled' });
  check(!userForSession(tokenB), '停用后已有会话立即失效');
  await assert.rejects(authenticate(b.username, 'synthetic-password-b')); checks++;
  updateUser(a.id, b.id, { status: 'active' });
  check(!userForSession(tokenB), '启用账号不恢复旧会话');
  const secondTokenA = createSession(a.id);
  await changePassword(a.id, 'synthetic-password-a', 'synthetic-new-password');
  check(!userForSession(tokenA) && !userForSession(secondTokenA), '改密码撤销全部设备会话');
  await assert.rejects(authenticate(a.username, 'synthetic-password-a')); checks++;
  check((await authenticate(a.username, 'synthetic-new-password')).id === a.id, '新密码可登录');
  tokenA = createSession(a.id); revokeSession(tokenA);
  check(!userForSession(tokenA), '退出后会话不可重放');
  tokenA = createSession(a.id);
  raw.prepare('UPDATE sessions SET expires_at = 0').run();
  check(!userForSession(tokenA), '过期会话不能访问');
  for (let i = 0; i < 3; i++) consumeAuthLimit('security-test', 3);
  assert.throws(() => consumeAuthLimit('security-test', 3), /频繁/); checks++;
  // 在真实异步密码派生期间改变账号，验证完成后必须复核数据库的最新状态。
  const raceUser = await registerUser({ username: 'credential-race', password: 'synthetic-race-password' });
  const raceHash = (raw.prepare('SELECT password_hash FROM users WHERE id = ?').get(raceUser.id) as { password_hash: string }).password_hash;
  const replacementHash = (raw.prepare('SELECT password_hash FROM users WHERE id = ?').get(b.id) as { password_hash: string }).password_hash;
  const pendingLogin = authenticate(raceUser.username, 'synthetic-race-password');
  raw.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(replacementHash, raceUser.id);
  await assert.rejects(pendingLogin, /用户名或密码错误/); checks++;
  raw.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(raceHash, raceUser.id);
  const pendingChange = changePassword(raceUser.id, 'synthetic-race-password', 'synthetic-race-new-password');
  raw.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(replacementHash, raceUser.id);
  await assert.rejects(pendingChange, /已经变更/); checks++;
  check((raw.prepare('SELECT password_hash FROM users WHERE id = ?').get(raceUser.id) as { password_hash: string }).password_hash === replacementHash, '并行改密不能覆盖另一操作已经提交的密码');
  raw.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(raceHash, raceUser.id);
  const pendingDisabledLogin = authenticate(raceUser.username, 'synthetic-race-password');
  raw.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(raceUser.id);
  await assert.rejects(pendingDisabledLogin, /用户名或密码错误/); checks++;
  for (let i = 0; i < 70; i++) runAsUser({ ...a, id: randomUUID() }, () => { const release = leaseDatabaseScope(); release(); });
  check(globalThis.__guanchenDatabases!.size <= 64, '回收空闲用户连接，避免句柄无限增加');
  check(runAsUser(a, () => getConversation(own.id)?.title) === '甲的私密命盘', '回收空闲连接不丢失持久化资料');
  check(getConversation(original.id)?.title === '原库保留的私密资料', '升级不删除原始资料');
  const legacyOwner = await registerUser({ username: 'legacy-owner', password: 'synthetic-legacy-password' });
  closeDatabaseConnection();
  const migrated = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/manage-accounts.ts', 'import-legacy', legacyOwner.username], { cwd: process.cwd(), env: process.env, encoding: 'utf8', windowsHide: true });
  check(migrated.status === 0, `本机指定账号迁移成功：${migrated.stderr}`);
  check(runAsUser(legacyOwner, () => getConversation(original.id)?.title) === '原库保留的私密资料', '指定账号可读取复制的旧资料');
  check(!runAsUser(b, () => getConversation(original.id)), '其他账号不会获得迁移的旧资料');
  check(getConversation(original.id)?.title === '原库保留的私密资料', '迁移后原库继续保留');
  runAsUser(legacyOwner, closeDatabaseConnection);
  rawDatabase?.close();
  rawDatabase = null;
  for (const user of [a, b]) runAsUser(user, closeDatabaseConnection);
  closeDatabaseConnection(); closeAccountConnections();
  console.log(`账号与隔离测试通过：${checks} 项，包含全业务接口未登录拒绝、并发、流式、备份、越权与会话撤销。`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  closeAccountConnections();
  for (const slot of globalThis.__guanchenDatabases?.values() ?? []) if (slot.db?.open) slot.db.close();
  rawDatabase?.close();
  rawDatabase = null;
  rmSync(directory, { recursive: true, force: true });
});
