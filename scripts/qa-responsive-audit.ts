import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { registerUser, closeAccountConnections } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { createBaziBirthProfile } from '../lib/db/bazi';
import { closeDatabaseConnection } from '../lib/db/client';
import { generateChart } from '../lib/ziwei/algorithm';

const port = Number(process.env.AUDIT_PORT || 30006);
const base = `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.AUDIT_OUT || 'docs/qa-evidence/2026-10-18-v2.0-responsive-audit.json');
const shotDir = path.resolve(process.env.AUDIT_SHOTS || 'docs/qa-evidence/2026-10-18-v2.0-responsive');
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-responsive-audit-'));
const accountRoot = path.join(directory, 'accounts');
const exportRoot = path.join(directory, 'exports');
mkdirSync(accountRoot, { recursive: true });
mkdirSync(exportRoot, { recursive: true });
mkdirSync(shotDir, { recursive: true });
process.env.ACCOUNT_DATA_DIR = accountRoot;
process.env.REPORT_EXPORT_DIR = exportRoot;

const widths = [320, 360, 390, 414, 768, 834, 1024];
const username = 'responsive-audit';
const password = 'synthetic-responsive-audit-123';

const env = {
  ...process.env,
  ACCOUNT_DATA_DIR: accountRoot,
  REPORT_EXPORT_DIR: exportRoot,
  APP_PUBLIC_ORIGIN: base,
  AUTH_COOKIE_SECURE: '0',
  AUTH_REGISTRATION_ENABLED: '1',
  AI_PROVIDER: 'deepseek',
  DEEPSEEK_API_KEY: 'audit-local-placeholder',
  DEEPSEEK_BASE_URL: 'http://127.0.0.1:39999',
  DEEPSEEK_MODEL: 'audit-local-placeholder',
};

type Offender = { tag: string; className: string; text: string; left: number; right: number; width: number };
type RouteResult = { route: string; name: string; width: number; status: number; documentOverflow: number; offenders: Offender[]; errors: string[] };

let server: ReturnType<typeof spawn> | null = null;
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

function executablePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean) as string[];
  return candidates.find(item => existsSync(item));
}

async function waitForHealth() {
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    try {
      if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) })).status === 200) return;
    } catch { /* not up yet */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('应用启动超时');
}

async function main() {
  // 服务启动前直接写入合成账号与八字档案，避免依赖动态 API 的载荷细节。
  const account = await registerUser({ username, password, displayName: '响应式审计合成账号' });
  let baziChartId = '';
  runAsUser(account, () => {
    baziChartId = createBaziBirthProfile({
      displayName: '响应式审计合成命例',
      birthDate: '1992-07-09',
      birthTime: '04:30',
      gender: 'female',
      initialChart: {},
    }).charts[0].id;
  });
  closeDatabaseConnection();
  closeAccountConnections();

  const chrome = executablePath();
  if (!chrome) throw new Error('未找到 Chrome/Edge；请设置 CHROME_PATH');
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: process.cwd(), env, stdio: 'ignore', windowsHide: true });
  await waitForHealth();

  browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', async response => {
    if (response.status() < 400 || !response.url().includes('/api/')) return;
    const body = await response.text().catch(() => '');
    errors.push(`${response.status()} ${new URL(response.url()).pathname} ${body.replace(/\s+/g, ' ').slice(0, 180)}`);
  });

  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#auth-username');
  await page.waitForTimeout(500);
  await page.fill('#auth-username', username);
  await page.fill('#auth-password', password);
  await Promise.all([
    page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 20_000 }),
    page.click('button[type="submit"]'),
  ]);

  // 建立一张紫微命盘和一份合参，用于详情页布局检查。
  const birthInfo = { year: 1992, month: 7, day: 9, hour: 4, gender: 'female' as const };
  const chartResponse = await context.request.post(`${base}/api/conversations`, {
    data: { type: 'chart', title: '响应式审计命盘', birthInfo, chartSnapshot: generateChart(birthInfo) },
  });
  const chartBody = await chartResponse.json() as { conversation?: { id?: string } };
  const chartId = chartBody.conversation?.id ?? '';
  const birthB = { year: 1990, month: 3, day: 18, hour: 7, gender: 'male' as const };
  const hemingResponse = await context.request.post(`${base}/api/conversations`, {
    data: {
      type: 'heming',
      birthInfoA: birthInfo,
      birthInfoB: birthB,
      chartSnapshotA: generateChart(birthInfo),
      chartSnapshotB: generateChart(birthB),
      relationshipType: 'romantic',
    },
  });
  const hemingBody = await hemingResponse.json() as { conversation?: { id?: string } };
  const hemingId = hemingBody.conversation?.id ?? '';

  const routes: Array<{ path: string; name: string; key?: boolean }> = [
    { path: '/', name: '首页', key: true },
    { path: '/chart', name: '命盘入口' },
    { path: '/chart/select', name: '命盘选择' },
    { path: '/history', name: '历史档案', key: true },
    { path: '/heming', name: '合盘入口', key: true },
    { path: '/rectification', name: '校时入口' },
    { path: '/bazi', name: '八字入口', key: true },
    { path: '/synthesis', name: '合参入口' },
    { path: '/election', name: '择日入口' },
    { path: '/meihua', name: '梅花入口' },
    { path: '/liuyao', name: '六爻入口' },
    { path: '/qimen', name: '奇门入口' },
    { path: '/learn', name: '学习' },
    { path: '/practice', name: '练习' },
    { path: '/practice/review', name: '练习复习' },
    { path: '/practice/open-ended', name: '开放练习' },
    { path: '/practice/foundation-review', name: '基础复习' },
    { path: '/practice/chart-structure', name: '命盘结构' },
    { path: '/cases', name: '案例' },
    { path: '/cases/new', name: '新建案例' },
    { path: '/cases/compare', name: '案例对比' },
    { path: '/knowledge', name: '知识库' },
    { path: '/library', name: '典籍' },
    { path: '/reviews', name: '复盘' },
    { path: '/reminders', name: '提醒' },
    { path: '/settings/account', name: '账号设置' },
    { path: '/settings/data', name: '数据保险箱', key: true },
    { path: '/privacy', name: '隐私' },
    { path: '/terms', name: '使用说明' },
  ];
  if (chartId) {
    routes.push(
      { path: `/chart/${chartId}`, name: '紫微命盘', key: true },
      { path: `/chart/${chartId}/events`, name: '命盘事件' },
      { path: `/chart/${chartId}/timeline`, name: '人生时间轴' },
      { path: `/chart/${chartId}/calendar`, name: '运程日历' },
      { path: `/chart/${chartId}/fortune`, name: '运程' },
      { path: `/chart/${chartId}/reports`, name: '命盘报告' },
    );
  }
  if (hemingId) routes.push({ path: `/heming/${hemingId}`, name: '合盘工作台' });
  if (baziChartId) routes.push({ path: `/bazi/reading/${baziChartId}`, name: '八字论命', key: true });

  const results: RouteResult[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 768 ? 1024 : 844 });
    for (const target of routes) {
      errors.length = 0;
      const response = await page.goto(`${base}${target.path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(width >= 768 ? 800 : 550);
      const layout = await page.evaluate(() => {
        const viewport = window.innerWidth;
        const offenders: Array<{ tag: string; className: string; text: string; left: number; right: number; width: number }> = [];
        for (const element of document.body.querySelectorAll<HTMLElement>('*')) {
          if (element.closest('[aria-hidden="true"], [inert], template')) continue;
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
          if (element.tagName === 'IMG' && element.className.toString().includes('orbitWatermark')) continue;
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) continue;
          if (rect.right <= viewport + 1 || rect.left >= viewport) continue;
          if (rect.left < 0 && rect.right <= 0) continue;
          let parent = element.parentElement;
          let scrollable = false;
          while (parent) {
            const parentStyle = getComputedStyle(parent);
            if (/(auto|scroll)/.test(parentStyle.overflowX)) { scrollable = true; break; }
            parent = parent.parentElement;
          }
          if (scrollable) continue;
          offenders.push({
            tag: element.tagName.toLowerCase(),
            className: typeof element.className === 'string' ? element.className.slice(0, 100) : '',
            text: (element.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          });
        }
        return {
          documentOverflow: document.documentElement.scrollWidth - viewport,
          offenders: offenders.slice(0, 8),
        };
      });
      results.push({
        route: target.path,
        name: target.name,
        width,
        status: response?.status() ?? 0,
        documentOverflow: layout.documentOverflow,
        offenders: layout.offenders,
        errors: [...new Set(errors)].slice(0, 4),
      });
    }
  }

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : width === 320 ? 568 : 844 });
    for (const target of routes.filter(item => item.key)) {
      await page.goto(`${base}${target.path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      const name = target.name.replace(/[^\w\u4e00-\u9fa5-]+/g, '-');
      await page.screenshot({ path: path.join(shotDir, `${name}-${width}.jpg`), type: 'jpeg', quality: 65, fullPage: false });
    }
  }

  const failures = results.filter(item => item.status >= 400 || item.documentOverflow > 1 || item.offenders.length > 0 || item.errors.length > 0);
  const report = {
    at: new Date().toISOString(),
    base,
    passed: failures.length === 0,
    widths,
    routeCount: routes.length,
    checks: results.length,
    failures,
    screenshots: results.filter(item => item.width === 390 && routes.find(route => route.path === item.route)?.key).map(item => `${item.name}-390.jpg`),
    scope: '隔离临时数据；合成账号/命盘/合参/八字；登录后真实 Chrome 遍历；不调用真实 AI。',
    limitation: '不覆盖真机、PDF 下载、完整聊天流式与报告生成；元素越界只统计部分可见的可见元素。',
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks, failures: report.failures.length }, null, 2));
  if (!report.passed) console.log(JSON.stringify(report.failures.slice(0, 12), null, 2));
  process.exitCode = report.passed ? 0 : 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { await browser?.close(); } catch { /* ignore */ }
  if (server) {
    spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    server.kill();
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  try {
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    // Windows 可能在进程刚退出时仍持有临时目录句柄；目录位于系统临时区，不应让清理失败覆盖验收结果。
  }
});
