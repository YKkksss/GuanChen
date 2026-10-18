import { constants } from 'node:fs';
import { access, mkdir, rm, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { resolvePdfFonts } from '../../lib/report-exports/pdf-renderer';

const failures: string[] = [];
const warnings: string[] = [];
const checks: Record<string, unknown> = {};

function fail(message: string) { failures.push(message); }
function warn(message: string) { warnings.push(message); }

async function writableDirectory(target: string, label: string) {
  try {
    await mkdir(target, { recursive: true });
    const probe = path.join(target, `.preflight-${process.pid}-${Date.now()}`);
    await writeFile(probe, 'ok');
    await rm(probe, { force: true });
    await access(target, constants.W_OK);
    checks[label] = 'ok';
  } catch (error) {
    checks[label] = 'failed';
    fail(`${label} 不可写：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  checks.node = process.versions.node;
  if (major < 22) fail(`Node.js 版本过低：${process.versions.node}，需要 22+（已验证 24）`);
  else if (major < 24) warn(`Node.js ${process.versions.node} 未作为当前验证版本，建议 24`);

  const accountRoot = path.resolve(process.env.ACCOUNT_DATA_DIR || path.join(process.cwd(), 'data', 'accounts'));
  const exportRoot = path.resolve(process.env.REPORT_EXPORT_DIR || path.join(process.cwd(), 'data', 'report-exports'));
  checks.accountDataDir = accountRoot;
  checks.reportExportDir = exportRoot;
  await writableDirectory(accountRoot, 'accountDataDirWritable');
  await writableDirectory(exportRoot, 'reportExportDirWritable');
  await writableDirectory(path.join(accountRoot, '..'), 'accountParentWritable');

  try {
    const db = new Database(':memory:');
    db.prepare('SELECT 1 AS ok').get();
    db.close();
    checks.betterSqlite3 = 'ok';
  } catch (error) {
    checks.betterSqlite3 = 'failed';
    fail(`better-sqlite3 不可用：${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const fonts = resolvePdfFonts();
    checks.pdfFonts = fonts;
    if (process.env.REPORT_PDF_FONT_PATH) {
      try { await access(process.env.REPORT_PDF_FONT_PATH); } catch { fail(`REPORT_PDF_FONT_PATH 不存在：${process.env.REPORT_PDF_FONT_PATH}`); }
    }
  } catch (error) {
    checks.pdfFonts = 'failed';
    fail(`PDF 中文字体不可用：${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const info = await statfs(accountRoot);
    const freeMb = Math.round(Number(info.bavail) * Number(info.bsize) / 1024 / 1024);
    checks.diskFreeMb = freeMb;
    if (freeMb < 1024) warn(`可用磁盘空间不足 1 GB：${freeMb} MB`);
  } catch (error) {
    checks.diskFreeMb = 'unknown';
    warn(`无法读取磁盘空间：${error instanceof Error ? error.message : String(error)}`);
  }

  const origin = process.env.APP_PUBLIC_ORIGIN;
  checks.publicOrigin = origin || null;
  if (process.env.NODE_ENV === 'production') {
    if (!origin) fail('生产环境必须设置 APP_PUBLIC_ORIGIN');
    else if (!origin.startsWith('https://')) warn(`生产 APP_PUBLIC_ORIGIN 不是 HTTPS：${origin}`);
  }
  checks.cookieSecure = process.env.AUTH_COOKIE_SECURE || '0';
  if (process.env.NODE_ENV === 'production' && process.env.AUTH_COOKIE_SECURE !== '1') warn('生产环境建议 AUTH_COOKIE_SECURE=1');

  const provider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase();
  checks.aiProvider = provider;
  const key = provider === 'mimo' ? process.env.MIMO_API_KEY : process.env.DEEPSEEK_API_KEY;
  if (!key) warn(`AI_PROVIDER=${provider} 但未配置对应密钥；AI 功能会返回 503`);
  checks.aiConfigured = Boolean(key);

  const result = {
    passed: failures.length === 0,
    node: process.versions.node,
    checks,
    failures,
    warnings,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
