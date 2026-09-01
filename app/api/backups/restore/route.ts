import { NextResponse } from 'next/server';
import { decryptEncryptedLocalBackupArchive, isEncryptedLocalBackupArchive } from '@/lib/backups/encrypted';
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
    const password = form.get('password');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请选择已经通过预检的备份文件' }, { status: 400 });
    }
    const uploaded = Buffer.from(await file.arrayBuffer());
    const encrypted = isEncryptedLocalBackupArchive(uploaded);
    const archive = encrypted
      ? await decryptEncryptedLocalBackupArchive(uploaded, typeof password === 'string' ? password : '')
      : { buffer: uploaded, fileName: file.name };
    const result = await restoreLocalBackupArchive({
      archive: archive.buffer,
      fileName: archive.fileName,
      confirmation: typeof confirmation === 'string' ? confirmation : '',
    });
    return NextResponse.json({ result, encrypted });
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
