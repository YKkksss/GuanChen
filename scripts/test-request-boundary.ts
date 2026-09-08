import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

async function main() {
  for (const base of ['http://127.0.0.1:30002', 'http://192.168.1.10:30001', 'https://guanchen.example']) {
    for (const origin of [base, 'https://untrusted.example', 'null']) {
      const request = new NextRequest(`${base}/api/generate`, { method: 'POST', headers: { host: new URL(base).host, origin, 'content-type': 'application/json' }, body: '{"year":1992}' });
      const response = await middleware(request);
      assert.equal(response.status, origin === base ? 200 : 403);
      if (origin === base) assert.equal((await request.json()).year, 1992, '校验副本不能消耗下游请求体');
    }
  }
  for (const body of ['null', '[]', '{', 'true', '"文字"']) {
    const response = await middleware(new NextRequest('http://localhost/api/conversations', { method: 'PATCH', headers: { host: 'localhost', 'content-type': 'application/json' }, body }));
    assert.equal(response.status, 400);
  }
  const command = await middleware(new NextRequest('http://localhost/api/conversations', { method: 'POST', headers: { host: 'localhost', 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(command.status, 200, '无来源头的本地命令行调用可用');
  const crossSite = await middleware(new NextRequest('http://localhost/api/conversations', { method: 'DELETE', headers: { host: 'localhost', 'sec-fetch-site': 'cross-site' } }));
  assert.equal(crossSite.status, 403);
  const form = new FormData();
  form.set('backup', new File(['QA'], 'QA.ziweibackup'));
  const upload = new NextRequest('http://localhost/api/backups/inspect', { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost' }, body: form });
  assert.equal((await middleware(upload)).status, 200);
  assert.ok((await upload.formData()).get('backup') instanceof File, '备份上传不受 JSON 校验影响');
  console.log('请求边界回归通过：同源、局域网、HTTPS、跨站、空来源、非法 JSON、命令行、请求体与备份上传。');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
