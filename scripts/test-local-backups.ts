import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-local-backup-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(tempDirectory, 'report-exports');

async function main() {
  const { createConversation } = await import('../lib/db/conversations');
  const { getDatabase } = await import('../lib/db/client');
  const {
    BackupValidationError,
    createLocalBackupArchive,
    getLocalDataSummary,
    inspectLocalBackupArchive,
    restoreLocalBackupArchive,
  } = await import('../lib/backups/service');
  const { LOCAL_BACKUP_CONFIRMATION } = await import('../lib/backups/types');
  const backupRoute = await import('../app/api/backups/route');
  const exportRoute = await import('../app/api/backups/export/route');
  const inspectRoute = await import('../app/api/backups/inspect/route');
  const restoreRoute = await import('../app/api/backups/restore/route');
  const automaticRoute = await import('../app/api/backups/automatic/[fileName]/route');

  try {
    createConversation({ type: 'chart', title: '备份时保留的命盘' });
    getDatabase().prepare(`
      INSERT INTO messages (
        id, conversation_id, seq, role, content, source, status,
        token_count, created_at, updated_at
      ) VALUES (?, ?, 1, 'user', '这条消息必须随备份恢复', 'question', 'completed', 10, ?, ?)
    `).run(
      'backup-message-fixture',
      (getDatabase().prepare('SELECT id FROM conversations LIMIT 1').get() as { id: string }).id,
      Date.now(),
      Date.now(),
    );

    const archive = await createLocalBackupArchive();
    assert.ok(archive.fileName.endsWith('.ziweibackup'));
    assert.equal(archive.buffer[0], 0x1f);
    assert.equal(archive.preview.schemaVersion, 46);
    assert.equal(archive.preview.content.conversations, 1);
    assert.equal(archive.preview.content.messages, 1);
    assert.equal(archive.preview.compatible, true);

    const preview = await inspectLocalBackupArchive(archive.buffer, archive.fileName);
    assert.equal(preview.fingerprint, archive.preview.fingerprint);
    assert.equal(preview.tableCount, archive.preview.tableCount);

    const inspectForm = new FormData();
    inspectForm.set('backup', new File([new Uint8Array(archive.buffer)], archive.fileName, { type: 'application/gzip' }));
    const inspectResponse = await inspectRoute.POST(new Request('http://localhost/api/backups/inspect', {
      method: 'POST', body: inspectForm,
    }));
    assert.equal(inspectResponse.status, 200);
    assert.equal((await inspectResponse.json() as { preview: { compatible: boolean } }).preview.compatible, true);

    const exportResponse = await exportRoute.GET();
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get('content-disposition') ?? '', /\.ziweibackup/);
    assert.equal(Buffer.from(await exportResponse.arrayBuffer())[0], 0x1f);

    createConversation({ type: 'chart', title: '备份后新增、恢复时应移除的命盘' });
    assert.equal((getDatabase().prepare('SELECT COUNT(*) AS total FROM conversations').get() as { total: number }).total, 2);

    await assert.rejects(
      restoreLocalBackupArchive({ archive: archive.buffer, confirmation: '确认' }),
      (error: unknown) => error instanceof BackupValidationError && error.code === 'CONFIRMATION_REQUIRED',
    );

    const restoreForm = new FormData();
    restoreForm.set('backup', new File([new Uint8Array(archive.buffer)], archive.fileName, { type: 'application/gzip' }));
    restoreForm.set('confirmation', LOCAL_BACKUP_CONFIRMATION);
    const restoreResponse = await restoreRoute.POST(new Request('http://localhost/api/backups/restore', {
      method: 'POST', body: restoreForm,
    }));
    assert.equal(restoreResponse.status, 200);
    const restoreData = await restoreResponse.json() as { result: { rollbackBackupFileName: string } };
    assert.ok(restoreData.result.rollbackBackupFileName.endsWith('.ziweibackup'));

    const restoredTitles = (getDatabase().prepare('SELECT title FROM conversations ORDER BY title').all() as Array<{ title: string }>).map(row => row.title);
    assert.deepEqual(restoredTitles, ['备份时保留的命盘']);
    assert.equal((getDatabase().prepare('SELECT content FROM messages WHERE id = ?').get('backup-message-fixture') as { content: string }).content, '这条消息必须随备份恢复');
    assert.equal(getDatabase().pragma('integrity_check', { simple: true }), 'ok');
    assert.equal((getDatabase().pragma('foreign_key_check') as unknown[]).length, 0);

    const summaryResponse = await backupRoute.GET();
    assert.equal(summaryResponse.status, 200);
    const summaryData = await summaryResponse.json() as { summary: { automaticBackups: Array<{ fileName: string }> } };
    assert.equal(summaryData.summary.automaticBackups.length, 1);
    const automaticName = summaryData.summary.automaticBackups[0].fileName;
    const automaticResponse = await automaticRoute.GET(
      new Request(`http://localhost/api/backups/automatic/${encodeURIComponent(automaticName)}`),
      { params: Promise.resolve({ fileName: automaticName }) },
    );
    assert.equal(automaticResponse.status, 200);
    const automaticPreview = await inspectLocalBackupArchive(Buffer.from(await automaticResponse.arrayBuffer()), automaticName);
    assert.equal(automaticPreview.content.conversations, 2, '恢复前自动备份必须保留被替换前的完整数据');

    const tampered = JSON.parse(gunzipSync(archive.buffer).toString('utf8')) as {
      database: { sha256: string };
      attachments: unknown[];
    };
    tampered.database.sha256 = '0'.repeat(64);
    await assert.rejects(
      inspectLocalBackupArchive(gzipSync(Buffer.from(JSON.stringify(tampered))), 'tampered.ziweibackup'),
      (error: unknown) => error instanceof BackupValidationError && error.code === 'CONTENT_DIGEST_MISMATCH',
    );

    const unsafe = JSON.parse(gunzipSync(archive.buffer).toString('utf8')) as {
      attachments: Array<{ relativePath: string; mimeType: string; byteSize: number; sha256: string; data: string }>;
    };
    unsafe.attachments.push({
      relativePath: 'report-exports/../../outside.pdf',
      mimeType: 'application/pdf',
      byteSize: 5,
      sha256: 'e9af2e0cd1bfe4a923c952d65a87a1b1033193345140154c11194905073d00a1',
      data: Buffer.from('%PDF-').toString('base64'),
    });
    await assert.rejects(
      inspectLocalBackupArchive(gzipSync(Buffer.from(JSON.stringify(unsafe))), 'unsafe.ziweibackup'),
      (error: unknown) => error instanceof BackupValidationError && error.code === 'ATTACHMENT_PATH_INVALID',
    );

    const finalSummary = await getLocalDataSummary();
    assert.equal(finalSummary.content.conversations, 1);
    assert.ok(existsSync(path.join(tempDirectory, 'backups', automaticName)));
    console.log('本地备份恢复测试通过：一致性快照、API 预检、整库恢复、恢复前自动备份、指纹校验与路径防护均正常。');
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
