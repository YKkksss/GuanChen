import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirectory = mkdtempSync(path.join(tmpdir(), 'ziwei-backup-lifecycle-test-'));
process.env.SQLITE_PATH = path.join(tempDirectory, 'test.sqlite');
process.env.REPORT_EXPORT_DIR = path.join(tempDirectory, 'report-exports');

async function main() {
  const { createConversation } = await import('../lib/db/conversations');
  const {
    createManagedBackup,
    deleteManagedBackup,
    ensureAutomaticBackupDue,
    getBackupLifecycleSummary,
    listManagedBackups,
    updateBackupPolicy,
    verifyManagedBackup,
  } = await import('../lib/backups/lifecycle');
  const { BackupValidationError } = await import('../lib/backups/service');
  const { LOCAL_BACKUP_DELETE_CONFIRMATION } = await import('../lib/backups/types');
  const autoCheckRoute = await import('../app/api/backups/auto-check/route');
  const managedRoute = await import('../app/api/backups/managed/route');
  const policyRoute = await import('../app/api/backups/policy/route');
  const verifyRoute = await import('../app/api/backups/managed/[fileName]/verify/route');
  const deleteRoute = await import('../app/api/backups/managed/[fileName]/route');

  try {
    createConversation({ type: 'chart', title: '自动备份生命周期测试命盘' });

    const initial = await getBackupLifecycleSummary();
    assert.equal(initial.policy.enabled, true);
    assert.equal(initial.policy.intervalHours, 24);
    assert.equal(initial.policy.retentionCount, 7);
    assert.equal(initial.managedBackups.length, 0);

    const firstCheck = await ensureAutomaticBackupDue();
    assert.equal(firstCheck.status, 'created');
    assert.ok(firstCheck.createdFileName?.startsWith('定时自动备份-'));
    assert.ok(existsSync(path.join(tempDirectory, 'backups', firstCheck.createdFileName!)));

    const secondCheck = await ensureAutomaticBackupDue();
    assert.equal(secondCheck.status, 'not_due');
    assert.equal((await listManagedBackups()).filter(item => item.source === 'scheduled').length, 1);

    const manual = await createManagedBackup('manual');
    assert.equal(manual.source, 'manual');
    const verified = await verifyManagedBackup(manual.fileName);
    assert.equal(verified.health, 'healthy');
    assert.match(verified.healthMessage ?? '', /检查均已通过/);

    await createManagedBackup('scheduled');
    await createManagedBackup('scheduled');
    const retained = await updateBackupPolicy({ intervalHours: 12, retentionCount: 2 });
    assert.equal(retained.policy.intervalHours, 12);
    assert.equal(retained.policy.retentionCount, 2);
    assert.equal(retained.managedBackups.filter(item => item.source === 'scheduled').length, 2);
    assert.equal(retained.managedBackups.filter(item => item.source === 'manual').length, 1, '手动备份不得被自动轮换');

    const corrupt = await createManagedBackup('manual');
    writeFileSync(path.join(tempDirectory, 'backups', corrupt.fileName), Buffer.from('broken archive'));
    const corruptResult = await verifyManagedBackup(corrupt.fileName);
    assert.equal(corruptResult.health, 'damaged');

    await assert.rejects(
      deleteManagedBackup(corrupt.fileName, '删除'),
      (error: unknown) => error instanceof BackupValidationError && error.code === 'BACKUP_DELETE_CONFIRMATION_REQUIRED',
    );
    await deleteManagedBackup(corrupt.fileName, LOCAL_BACKUP_DELETE_CONFIRMATION);
    assert.equal(existsSync(path.join(tempDirectory, 'backups', corrupt.fileName)), false);

    const policyResponse = await policyRoute.PATCH(new Request('http://localhost/api/backups/policy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, intervalHours: 24, retentionCount: 5 }),
    }));
    assert.equal(policyResponse.status, 200);
    const disabledCheck = await autoCheckRoute.POST();
    assert.equal((await disabledCheck.json() as { result: { status: string } }).result.status, 'disabled');

    const managedResponse = await managedRoute.POST();
    assert.equal(managedResponse.status, 201);
    const managedData = await managedResponse.json() as { backup: { fileName: string } };
    const verifyResponse = await verifyRoute.POST(
      new Request('http://localhost/api/backups/managed/verify', { method: 'POST' }),
      { params: Promise.resolve({ fileName: managedData.backup.fileName }) },
    );
    assert.equal(verifyResponse.status, 200);
    assert.equal((await verifyResponse.json() as { backup: { health: string } }).backup.health, 'healthy');

    const deleteResponse = await deleteRoute.DELETE(
      new Request('http://localhost/api/backups/managed/item', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: LOCAL_BACKUP_DELETE_CONFIRMATION }),
      }),
      { params: Promise.resolve({ fileName: managedData.backup.fileName }) },
    );
    assert.equal(deleteResponse.status, 200);
    assert.equal(existsSync(path.join(tempDirectory, 'backups', managedData.backup.fileName)), false);

    console.log('备份生命周期测试通过：后台到期检查、周期保留、手动留存、完整性验证、损坏识别与受保护删除均正常。');
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
