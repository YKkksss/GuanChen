import { NextResponse } from 'next/server';
import { deleteManagedBackup, getBackupLifecycleSummary } from '@/lib/backups/lifecycle';
import { BackupValidationError } from '@/lib/backups/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ fileName: string }> },
) {
  try {
    const { fileName } = await context.params;
    const body = await request.json().catch(() => ({})) as { confirmation?: unknown };
    await deleteManagedBackup(fileName, typeof body.confirmation === 'string' ? body.confirmation : '');
    return NextResponse.json({ summary: await getBackupLifecycleSummary() });
  } catch (error) {
    if (!(error instanceof BackupValidationError)) console.error('本地备份删除失败：', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '本地备份删除失败',
      code: error instanceof BackupValidationError ? error.code : undefined,
    }, { status: error instanceof BackupValidationError ? 422 : 500 });
  }
}
