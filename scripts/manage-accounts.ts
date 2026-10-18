import { loadEnvConfig } from '@next/env';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { closeAccountConnections, getUserByUsername, promoteLocalAdministrator } from '../lib/auth/accounts';
import { accountDataRoot, runAsUser } from '../lib/auth/scope';
import { closeDatabaseConnection, getDatabase } from '../lib/db/client';
import { createLocalBackupArchive, restoreLocalBackupArchive } from '../lib/backups/service';
import { LOCAL_BACKUP_CONFIRMATION } from '../lib/backups/types';

loadEnvConfig(process.cwd());
async function main() {
  const [operation, username] = process.argv.slice(2);
  if (!username || !['admin', 'import-legacy'].includes(operation)) throw new Error('用法：npm run accounts:manage -- admin 用户名；或 import-legacy 用户名（服务停止后执行）');
  const user = getUserByUsername(username);
  if (!user) throw new Error('请先在网页注册目标账号');
  if (operation === 'admin') {
    promoteLocalAdministrator(username);
    console.log(`已将 ${user.username} 设为管理员。请重新登录。`);
    return;
  }
  // 原库只生成归档，不将首个注册用户自动视为原资料所有者。
  const archive = await createLocalBackupArchive();
  const directory = path.join(accountDataRoot(), 'legacy-backups');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, archive.fileName), archive.buffer, { flag: 'wx' });
  closeDatabaseConnection();
  await runAsUser(user, async () => {
    try {
      const db = getDatabase();
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' AND name <> 'schema_migrations'").all() as {name: string}[];
      for (const table of tables) {
        if (!/^[a-zA-Z0-9_]+$/.test(table.name)) throw new Error('发现未知表名');
        const row = db.prepare(`SELECT COUNT(*) AS count FROM "${table.name}"`).get() as {count: number};
        if (row.count) throw new Error('目标账号已有资料，拒绝覆盖。请使用空白账号接收原资料。');
      }
      await restoreLocalBackupArchive({ archive: archive.buffer, fileName: archive.fileName, confirmation: LOCAL_BACKUP_CONFIRMATION });
      console.log(`原有资料已复制到 ${user.username} 的账号空间，原数据库和发布备份继续保留。`);
    } finally { closeDatabaseConnection(); }
  });
}
main().catch(error => { console.error(error instanceof Error ? error.message : '账号管理失败'); process.exitCode = 1; }).finally(closeAccountConnections);
