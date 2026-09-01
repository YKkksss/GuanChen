import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-encrypted-backup-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(tempDirectory, 'report-exports');

async function main() {
  const { createConversation } = await import('../lib/db/conversations');
  const { getDatabase } = await import('../lib/db/client');
  const {
    ENCRYPTED_BACKUP_MAGIC,
    createEncryptedLocalBackupArchive,
    decryptEncryptedLocalBackupArchive,
    isEncryptedLocalBackupArchive,
  } = await import('../lib/backups/encrypted');
  const { BackupValidationError, inspectLocalBackupArchive } = await import('../lib/backups/service');
  const { LOCAL_BACKUP_CONFIRMATION } = await import('../lib/backups/types');
  const encryptedExportRoute = await import('../app/api/backups/export/encrypted/route');
  const inspectRoute = await import('../app/api/backups/inspect/route');
  const restoreRoute = await import('../app/api/backups/restore/route');
  const passwordDecomposed = 'Cafe\u0301-安全-12345';
  const passwordComposed = 'Café-安全-12345';

  try {
    createConversation({ type: 'chart', title: '加密前保留的私密命盘' });

    const encrypted = await createEncryptedLocalBackupArchive(passwordDecomposed);
    assert.ok(encrypted.fileName.endsWith('.ziweibackupx'));
    assert.equal(isEncryptedLocalBackupArchive(encrypted.buffer), true);
    assert.equal(encrypted.buffer.subarray(0, ENCRYPTED_BACKUP_MAGIC.length).equals(ENCRYPTED_BACKUP_MAGIC), true);
    assert.equal(encrypted.buffer.includes(Buffer.from('加密前保留的私密命盘')), false, '密文中不能泄露业务正文');

    const decrypted = await decryptEncryptedLocalBackupArchive(encrypted.buffer, passwordComposed);
    const preview = await inspectLocalBackupArchive(decrypted.buffer, decrypted.fileName);
    assert.equal(preview.compatible, true);
    assert.equal(preview.content.conversations, 1);
    assert.equal(preview.fingerprint, encrypted.preview.fingerprint);

    await assert.rejects(
      decryptEncryptedLocalBackupArchive(encrypted.buffer, '完全错误的密码-12345'),
      (error: unknown) => error instanceof BackupValidationError && error.code === 'ENCRYPTED_BACKUP_AUTH_FAILED',
    );

    const tampered = Buffer.from(encrypted.buffer);
    tampered[tampered.length - 32] ^= 0x01;
    await assert.rejects(
      decryptEncryptedLocalBackupArchive(tampered, passwordComposed),
      (error: unknown) => error instanceof BackupValidationError && error.code === 'ENCRYPTED_BACKUP_AUTH_FAILED',
    );

    const weakExportResponse = await encryptedExportRoute.POST(new Request('http://localhost/api/backups/export/encrypted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '123' }),
    }));
    assert.equal(weakExportResponse.status, 422);

    const exportResponse = await encryptedExportRoute.POST(new Request('http://localhost/api/backups/export/encrypted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordComposed }),
    }));
    assert.equal(exportResponse.status, 200);
    assert.equal(exportResponse.headers.get('x-backup-encrypted'), 'true');
    assert.match(exportResponse.headers.get('content-disposition') ?? '', /\.ziweibackupx/);

    const inspectForm = new FormData();
    inspectForm.set('backup', new File([new Uint8Array(encrypted.buffer)], encrypted.fileName, { type: 'application/octet-stream' }));
    inspectForm.set('password', passwordComposed);
    const inspectResponse = await inspectRoute.POST(new Request('http://localhost/api/backups/inspect', {
      method: 'POST', body: inspectForm,
    }));
    assert.equal(inspectResponse.status, 200);
    const inspectData = await inspectResponse.json() as { encrypted: boolean; preview: { compatible: boolean } };
    assert.equal(inspectData.encrypted, true);
    assert.equal(inspectData.preview.compatible, true);

    createConversation({ type: 'chart', title: '加密后新增、恢复时应移除的命盘' });
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS total FROM conversations').get() as { total: number }).total, 2);

    const restoreForm = new FormData();
    restoreForm.set('backup', new File([new Uint8Array(encrypted.buffer)], encrypted.fileName, { type: 'application/octet-stream' }));
    restoreForm.set('password', passwordComposed);
    restoreForm.set('confirmation', LOCAL_BACKUP_CONFIRMATION);
    const restoreResponse = await restoreRoute.POST(new Request('http://localhost/api/backups/restore', {
      method: 'POST', body: restoreForm,
    }));
    assert.equal(restoreResponse.status, 200);
    assert.equal((await restoreResponse.json() as { encrypted: boolean }).encrypted, true);
    const titles = (getDatabase().prepare('SELECT title FROM conversations').all() as Array<{ title: string }>).map(row => row.title);
    assert.deepEqual(titles, ['加密前保留的私密命盘']);
    assert.equal(getDatabase().pragma('integrity_check', { simple: true }), 'ok');
    assert.equal((getDatabase().pragma('foreign_key_check') as unknown[]).length, 0);

    console.log('加密备份测试通过：密码归一化、认证加密、错误密码、篡改拦截、API 导出预检与整库恢复均正常。');
  } finally {
    const { closeDatabaseConnection } = await import('../lib/db/client');
    closeDatabaseConnection();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
