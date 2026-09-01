import { createEncryptedLocalBackupArchive } from '@/lib/backups/encrypted';
import { BackupValidationError } from '@/lib/backups/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { password?: unknown };
    const archive = await createEncryptedLocalBackupArchive(
      typeof body.password === 'string' ? body.password : '',
    );
    const encodedName = encodeURIComponent(archive.fileName);
    return new Response(new Uint8Array(archive.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(archive.buffer.length),
        'Content-Disposition': `attachment; filename="ziwei-encrypted-backup.ziweibackupx"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'no-store',
        'X-Backup-Encrypted': 'true',
        'X-Backup-Schema-Version': String(archive.preview.schemaVersion),
      },
    });
  } catch (error) {
    if (!(error instanceof BackupValidationError)) console.error('加密备份导出失败：', error);
    return Response.json({
      error: error instanceof Error ? error.message : '加密备份导出失败',
      code: error instanceof BackupValidationError ? error.code : undefined,
    }, { status: error instanceof BackupValidationError ? 422 : 500 });
  }
}
