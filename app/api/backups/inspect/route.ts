import { NextResponse } from 'next/server';
import { BackupValidationError, inspectLocalBackupArchive } from '@/lib/backups/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('backup');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请选择 .ziweibackup 备份文件' }, { status: 400 });
    }
    const preview = await inspectLocalBackupArchive(Buffer.from(await file.arrayBuffer()), file.name);
    return NextResponse.json({ preview });
  } catch (error) {
    const status = error instanceof BackupValidationError ? 422 : 500;
    if (!(error instanceof BackupValidationError)) console.error('本地备份预检失败：', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '本地备份预检失败',
      code: error instanceof BackupValidationError ? error.code : 'BACKUP_INSPECTION_FAILED',
    }, { status });
  }
}
