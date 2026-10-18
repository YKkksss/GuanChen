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
  process.env.APP_PUBLIC_ORIGIN = 'https://guanchen.example';
  try {
    const proxied = new NextRequest('http://localhost/api/auth/login', { method: 'POST', headers: { host: 'localhost', origin: 'https://guanchen.example', 'content-type': 'application/json' }, body: '{}' });
    assert.equal((await middleware(proxied)).status, 200, '固定公开来源支持反向代理内部 HTTP');
    const denied = new NextRequest('http://localhost/api/auth/login', { method: 'POST', headers: { host: 'localhost', origin: 'https://untrusted.example', 'content-type': 'application/json' }, body: '{}' });
    assert.equal((await middleware(denied)).status, 403);
    const page = await middleware(new NextRequest('http://localhost/history', { headers: { host: 'internal:30001' } }));
    assert.equal(new URL(page.headers.get('location')!).origin, 'https://guanchen.example', '正式来源配置优先于内部主机');
  } finally { delete process.env.APP_PUBLIC_ORIGIN; }
  const redirect = await middleware(new NextRequest('http://localhost/history'));
  assert.equal(redirect.status, 307);
  assert.equal(new URL(redirect.headers.get('location')!).pathname, '/login');
  for (const host of ['127.0.0.1:30002', '192.168.1.10:30001']) {
    const response = await middleware(new NextRequest('http://localhost:30002/history?q=test', { headers: { host } }));
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.origin, `http://${host}`, '匿名登录跳转保留直接访问的主机及端口');
    assert.equal(location.searchParams.get('next'), '/history?q=test', '保留原目标页面与查询');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  console.log('请求边界回归通过：同源、局域网、HTTPS、跨站、空来源、非法 JSON、命令行、请求体与备份上传。');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
