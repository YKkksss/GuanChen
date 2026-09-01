import { NextResponse } from 'next/server';
import {
  BackupRestoreBusyError,
  BackupValidationError,
  restoreLocalBackupArchive,
} from '@/lib/backups/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('backup');
    const confirmation = form.get('confirmation');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请选择已经通过预检的备份文件' }, { status: 400 });
    }
    const result = await restoreLocalBackupArchive({
      archive: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      confirmation: typeof confirmation === 'string' ? confirmation : '',
    });
    return NextResponse.json({ result });
  } catch (error) {
    const status = error instanceof BackupRestoreBusyError ? 409
      : error instanceof BackupValidationError ? 422
        : 500;
    if (!(error instanceof BackupValidationError) && !(error instanceof BackupRestoreBusyError)) {
      console.error('本地数据恢复失败：', error);
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : '本地数据恢复失败',
      code: error instanceof BackupValidationError ? error.code : undefined,
    }, { status });
  }
}
