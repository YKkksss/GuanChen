import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';

// 本脚本只访问已创建的独立验收数据，不能改为正式服务地址。
const base = 'http://127.0.0.1:30002';
const directory = path.join(tmpdir(), 'guanchen-full-qa-c83J3g');
const db = new Database(path.join(directory, 'test.sqlite'), { readonly: true, fileMustExist: true });
const a = '910953c7-e047-46be-874f-4ee3faf5edd7';
const b = 'cc6e6813-1a24-4e83-b7c8-c84d49f6a5e3';
const results = [];
async function check(label, route, options, expected) {
  const response = await fetch(base + route, { ...options, signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  results.push({ label, route, status: response.status, passed: expected.includes(response.status), detail: text.slice(0, 200) });
}
function fingerprint() {
  return createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM conversations ORDER BY id').all())).digest('hex');
}
try {
  const events = db.prepare('SELECT id FROM life_events WHERE conversation_id = ?').all(a);
  assert.ok(events.length);
  for (const method of ['GET', 'PATCH', 'DELETE']) {
    await check('禁止跨档案访问或改写事件', `/api/conversations/${b}/events/${events[0].id}`, {
      method, ...(method === 'PATCH' ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {}),
    }, [404]);
  }
  const memories = db.prepare('SELECT id FROM memory_items WHERE conversation_id = ?').all(a);
  for (const memory of memories.slice(0, 1)) {
    await check('禁止跨档案删除记忆', `/api/conversations/${b}/memories/${memory.id}`, { method: 'DELETE' }, [404]);
  }
  for (const route of [`/api/conversations/${a}/context?limit=1.2`, '/api/reports/6b4ed922-677a-4c85-8f13-be5ff5447c74?version=1.2']) {
    await check('已有资源分页与版本边界', route, {}, route.includes('context') ? [200] : [400]);
  }
  const before = fingerprint();
  for (const headers of [{ origin: 'https://untrusted.example' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]) {
    await check('拒绝跨站修改且不改变档案', `/api/conversations/${a}`, { method: 'PATCH', headers: { ...headers, 'content-type': 'text/plain' }, body: JSON.stringify({ title: '不应写入' }) }, [403]);
  }
  for (const body of ['null', '{', '[]']) {
    await check('已有资源拒绝非对象请求', `/api/conversations/${a}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body }, [400]);
  }
  const form = new FormData();
  form.set('backup', new File(['这不是有效备份'], 'broken.ziweibackup'));
  form.set('confirmation', '覆盖本地数据');
  await check('损坏备份不能覆盖数据库', '/api/backups/restore', { method: 'POST', body: form }, [422]);
  results.push({ label: '危险请求后档案内容指纹不变', passed: before === fingerprint() });
  for (const file of ['..%5C..%5C.env.local', '..%2F..%2F.env.local', '%00.sqlite']) {
    await check('备份下载路径穿越与空字节', `/api/backups/automatic/${file}`, {}, [400, 404, 422]);
  }
  const anonymous = readFileSync(path.join(tmpdir(), 'guanchen-full-qa-case.json'), 'utf8');
  results.push({ label: '匿名导出不含来源姓名、精确生日、事件正文', passed: !['QA-完整测试-甲', '1992-07-09', 'QA-转岗'].some(value => anonymous.includes(value)) });
  results.push({ label: 'SQLite 完整性与外键', passed: db.pragma('integrity_check', { simple: true }) === 'ok' && db.pragma('foreign_key_check').length === 0 });
} finally {
  db.close();
  const output = path.join(tmpdir(), 'guanchen-full-qa-security.json');
  writeFileSync(output, JSON.stringify({ total: results.length, results }, null, 2));
  console.log(JSON.stringify({ total: results.length, failed: results.filter(r => !r.passed), output }, null, 2));
}
process.exitCode = results.every(result => result.passed) ? 0 : 1;
