import { NextResponse } from 'next/server';
import { decryptEncryptedLocalBackupArchive, isEncryptedLocalBackupArchive } from '@/lib/backups/encrypted';
import { BackupValidationError, inspectLocalBackupArchive } from '@/lib/backups/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('backup');
    const password = form.get('password');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请选择备份文件' }, { status: 400 });
    }
    const uploaded = Buffer.from(await file.arrayBuffer());
    const encrypted = isEncryptedLocalBackupArchive(uploaded);
    const archive = encrypted
      ? await decryptEncryptedLocalBackupArchive(uploaded, typeof password === 'string' ? password : '')
      : { buffer: uploaded, fileName: file.name };
    const preview = await inspectLocalBackupArchive(archive.buffer, archive.fileName);
    return NextResponse.json({
      preview: { ...preview, fileName: file.name, archiveBytes: uploaded.length },
      encrypted,
    });
  } catch (error) {
    const status = error instanceof BackupValidationError ? 422 : 500;
    if (!(error instanceof BackupValidationError)) console.error('本地备份预检失败：', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '本地备份预检失败',
      code: error instanceof BackupValidationError ? error.code : 'BACKUP_INSPECTION_FAILED',
    }, { status });
  }
}
