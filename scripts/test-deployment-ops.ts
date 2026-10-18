import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runAccountTest } from './account-test-session';
import { closeAccountConnections } from '../lib/auth/accounts';
import { runAsUser } from '../lib/auth/scope';
import { currentUser } from '../lib/auth/scope';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { createConversation, getConversation } from '../lib/db/conversations';

let checks = 0;
function check(value: unknown, label: string): asserts value { assert.ok(value, label); checks++; }
function equal(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); checks++; }

async function main() {
  const backupRoot = mkdtempSync(path.join(tmpdir(), 'guanchen-ops-backup-'));
  try {
  await runAccountTest(async () => {
    const user = currentUser()!;
    const source = process.env.ACCOUNT_DATA_DIR!;
    const conversation = createConversation({ type: 'chart', title: 'P2 备份恢复演练命盘' });
    const conversationId = conversation.id;
    getDatabase();
    check(existsSync(path.join(source, 'accounts.sqlite')), '账号库已创建');
    check(existsSync(path.join(source, 'users')), '用户目录已创建');

    const font = path.join(process.cwd(), 'scripts', 'fixtures', 'fonts', 'NotoSansSC-Test-Regular.otf');
    const preflight = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/ops/preflight.ts'], {
      cwd: process.cwd(), encoding: 'utf8', windowsHide: true,
      env: { ...process.env, ACCOUNT_DATA_DIR: source, REPORT_EXPORT_DIR: path.join(source, 'exports'), REPORT_PDF_FONT_PATH: font, REPORT_PDF_BOLD_FONT_PATH: font },
    });
    check(preflight.status === 0, `部署预检通过：${preflight.stdout}\n${preflight.stderr}`);
    const preflightJson = JSON.parse(preflight.stdout);
    equal(preflightJson.checks.betterSqlite3, 'ok', '预检确认原生 SQLite 可用');
    check(preflightJson.checks.pdfFonts && preflightJson.checks.pdfFonts !== 'failed', '预检确认 PDF 字体可用');

    const first = spawnSync(process.execPath, ['scripts/ops/backup-all.mjs', `--source=${source}`, `--target=${backupRoot}`, '--keep=1', '--label=first'], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    check(first.status === 0, `第一次在线备份成功：${first.stderr}`);
    const firstReport = JSON.parse(first.stdout);
    check(firstReport.passed && existsSync(firstReport.destination), '备份目录与清单存在');
    check(firstReport.databases.length >= 2, '账号库与用户业务库都进入备份');
    const firstManifest = JSON.parse(readFileSync(path.join(firstReport.destination, 'manifest.json'), 'utf8')) as { databases: Array<{ path: string; sha256: string; bytes: number }> };
    check(firstManifest.databases.every(item => /^[0-9a-f]{64}$/.test(item.sha256)), '备份清单记录 SHA-256');

    const copiedAccounts = new Database(path.join(firstReport.destination, 'accounts.sqlite'), { readonly: true });
    check((copiedAccounts.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count >= 1, '备份账号库可读');
    copiedAccounts.close();
    const userDb = firstManifest.databases.find(item => item.path.includes('ziweidoushu.sqlite'))!;
    const copiedUser = new Database(path.join(firstReport.destination, userDb.path), { readonly: true });
    check((copiedUser.prepare('SELECT COUNT(*) AS count FROM conversations').get() as { count: number }).count >= 1, '备份用户库含演练命盘');
    copiedUser.close();

    const second = spawnSync(process.execPath, ['scripts/ops/backup-all.mjs', `--source=${source}`, `--target=${backupRoot}`, '--keep=1', '--label=second'], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    check(second.status === 0, '第二次备份成功');
    const secondReport = JSON.parse(second.stdout);
    equal(secondReport.pruned, ['accounts-first'], '保留策略删除超出 keep 的旧备份');

    const inside = spawnSync(process.execPath, ['scripts/ops/backup-all.mjs', `--source=${source}`, `--target=${path.join(source, 'nested')}`], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
    check(inside.status !== 0 && inside.stderr.includes('不能位于'), '拒绝把备份写进账号数据目录内部');

    // 模拟数据丢失后从备份恢复：关闭连接、移走原目录、复制备份、按原账号重开。
    closeDatabaseConnection();
    closeAccountConnections();
    const lost = `${source}-lost`;
    renameSync(source, lost);
    cpSync(secondReport.destination, source, { recursive: true });
    const restored = runAsUser(user, () => getConversation(conversationId));
    check(Boolean(restored) && restored!.title === 'P2 备份恢复演练命盘', '恢复后按原账号读回命盘');
    closeDatabaseConnection();
    rmSync(lost, { recursive: true, force: true });
    console.log(`P2 部署运维专项通过：${checks}项；预检、在线备份、完整性、保留策略、拒绝嵌套目标、模拟丢失恢复；未调用 AI。`);
  });
  } finally {
    rmSync(backupRoot, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
