import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { generateChart } from '../lib/ziwei/algorithm';

const port = Number(process.env.E2E_PORT || 30004);
const base = `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.E2E_OUT || 'docs/qa-evidence/2026-10-18-v2.0-p4-web.json');
const screenshotDirectory = path.resolve(process.env.E2E_SCREENSHOTS || 'docs/qa-evidence/2026-10-18-v2.0-p4');
const directory = mkdtempSync(path.join(tmpdir(), 'guanchen-web-e2e-'));
const accountRoot = path.join(directory, 'accounts');
const reportRoot = path.join(directory, 'exports');
mkdirSync(accountRoot, { recursive: true });
mkdirSync(reportRoot, { recursive: true });
mkdirSync(screenshotDirectory, { recursive: true });

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((item): item is string => Boolean(item));
  return candidates.find(item => existsSync(item));
}

const env = {
  ...process.env,
  ACCOUNT_DATA_DIR: accountRoot,
  REPORT_EXPORT_DIR: reportRoot,
  APP_PUBLIC_ORIGIN: base,
  AUTH_COOKIE_SECURE: '0',
  AUTH_REGISTRATION_ENABLED: '1',
  AI_PROVIDER: 'deepseek',
  DEEPSEEK_API_KEY: 'e2e-local-placeholder',
  DEEPSEEK_BASE_URL: 'http://127.0.0.1:39999',
  DEEPSEEK_MODEL: 'e2e-local-placeholder',
};

const results: Array<Record<string, unknown>> = [];
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const axeViolations: Array<{ page: string; id: string; impact: string; help: string; nodes: Array<{ target: string[]; html: string; failureSummary: string }> }> = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
let server: ReturnType<typeof spawn> | null = null;

async function waitForHealth() {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (response.status === 200) return;
    } catch { /* 尚未监听 */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('应用启动超时');
}

async function main() {
  const executablePath = chromePath();
  if (!executablePath) throw new Error('未找到 Chrome/Edge；请设置 CHROME_PATH');
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: process.cwd(), env, stdio: 'ignore', windowsHide: true });
  await waitForHealth();

  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(`${message.text()} @ ${page.url()}`); });
  page.on('pageerror', error => pageErrors.push(`${error.message} @ ${page.url()}`));

  // 通过真实注册表单建立账号，后续页面共用同一个浏览器会话。
  await page.goto(`${base}/register`, { waitUntil: 'networkidle' });
  const username = `e2e-${Date.now()}`;
  const password = `e2e-${Math.random().toString(36).slice(2)}!A1`;
  await page.fill('#auth-username', username);
  await page.fill('#auth-display-name', '浏览器验收合成账号');
  await page.fill('#auth-password', password);
  await page.fill('#auth-confirmation', password);
  await Promise.all([
    page.waitForURL(url => !url.pathname.startsWith('/register'), { timeout: 20_000 }),
    page.click('button[type="submit"]'),
  ]);
  results.push({ name: '注册并登录', passed: page.url().startsWith(base), url: page.url() });

  const birthInfo = { year: 1992, month: 7, day: 9, hour: 4, gender: 'female' as const };
  const created = await context.request.post(`${base}/api/conversations`, {
    data: { type: 'chart', title: '浏览器验收命盘', birthInfo, chartSnapshot: generateChart(birthInfo) },
  });
  const createdBody = await created.json() as { conversation?: { id?: string }; error?: string };
  results.push({ name: 'API 建立命盘', passed: created.status() === 201 && Boolean(createdBody.conversation?.id), status: created.status(), error: createdBody.error });
  const chartId = createdBody.conversation?.id;

  const pages = [
    { path: '/', name: '首页' },
    ...(chartId ? [{ path: `/chart/${chartId}`, name: '命盘工作台' }] : []),
    { path: '/bazi', name: '八字' },
    { path: '/meihua', name: '梅花' },
    { path: '/liuyao', name: '六爻' },
    { path: '/qimen', name: '奇门' },
    { path: '/election', name: '择日' },
    { path: '/synthesis', name: '合参' },
    { path: '/history', name: '历史档案' },
    { path: '/settings/account', name: '账号设置' },
    { path: '/settings/data', name: '数据保险箱' },
  ];
  const widths = [1280, 768, 390, 320];

  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    for (const target of pages) {
      const response = await page.goto(`${base}${target.path}`, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      results.push({ name: `${target.name} ${width}`, passed: (response?.status() ?? 500) < 400 && overflow <= 1, status: response?.status() ?? 0, overflow });
    }
  }

  // axe 只跑关键页，避免 44 次注入拖慢验收。
  const axeSource = readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
  const axePages = ['/', ...(chartId ? [`/chart/${chartId}`] : []), '/bazi', '/settings/account', '/settings/data'];
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    for (const target of axePages) {
      await page.goto(`${base}${target}`, { waitUntil: 'networkidle' });
      // 等 Framer Motion 的入场透明度/缩放结束，避免把动画中间态当成真实对比度。
      await page.waitForTimeout(1200);
      await page.addScriptTag({ content: axeSource });
      const result = await page.evaluate(async () => {
        // @ts-expect-error axe 由页面脚本注入
        return await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
      }) as { violations: Array<{ id: string; impact: string | null; help: string; nodes: Array<{ target: string[]; html: string; failureSummary: string }> }> };
      for (const violation of result.violations.filter(item => item.impact === 'critical' || item.impact === 'serious')) {
        axeViolations.push({ page: `${target}@${width}`, id: violation.id, impact: violation.impact ?? 'unknown', help: violation.help, nodes: violation.nodes });
      }
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(screenshotDirectory, 'home-1280.jpg'), type: 'jpeg', quality: 70, fullPage: false });
  if (chartId) {
    await page.goto(`${base}/chart/${chartId}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(screenshotDirectory, 'chart-1280.jpg'), type: 'jpeg', quality: 70, fullPage: false });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(screenshotDirectory, 'home-390.jpg'), type: 'jpeg', quality: 70, fullPage: false });

  const report = {
    at: new Date().toISOString(),
    base,
    passed: results.every(item => item.passed) && pageErrors.length === 0 && axeViolations.length === 0,
    count: results.length,
    failures: results.filter(item => !item.passed),
    consoleErrors: [...new Set(consoleErrors)],
    pageErrors: [...new Set(pageErrors)],
    axeViolations,
    screenshots: ['home-1280.jpg', 'home-390.jpg', ...(chartId ? ['chart-1280.jpg'] : [])],
    scope: '真实 Chrome + 本地 30004 + 隔离临时数据；注册、命盘创建、页面入口、四宽度、axe；不调用真实 AI。',
    limitation: '未覆盖真机、完整聊天/报告生成、PDF 下载与备份恢复；这些在各自专项或人工验收。',
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.passed ? 0 : 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { await browser?.close(); } catch { /* ignore */ }
  if (server) {
    server.kill();
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!server.killed) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
  rmSync(directory, { recursive: true, force: true });
});
