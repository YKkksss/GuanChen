import { BackupValidationError, readAutomaticBackupArchive } from '@/lib/backups/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileName: string }> },
) {
  try {
    const { fileName } = await context.params;
    const buffer = await readAutomaticBackupArchive(fileName);
    const encodedName = encodeURIComponent(fileName);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `attachment; filename="automatic-backup.ziweibackup"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : '自动备份读取失败',
    }, { status: error instanceof BackupValidationError ? 404 : 500 });
  }
}
