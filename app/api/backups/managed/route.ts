import { NextResponse } from 'next/server';
import { createManagedBackup, getBackupLifecycleSummary } from '@/lib/backups/lifecycle';
import { BackupValidationError } from '@/lib/backups/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST() {
  try {
    const backup = await createManagedBackup('manual');
    return NextResponse.json({ backup, summary: await getBackupLifecycleSummary() }, { status: 201 });
  } catch (error) {
    if (!(error instanceof BackupValidationError)) console.error('本机保留备份创建失败：', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '本机保留备份创建失败',
      code: error instanceof BackupValidationError ? error.code : undefined,
    }, { status: error instanceof BackupValidationError ? 409 : 500 });
  }
}
