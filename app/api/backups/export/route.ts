import { createLocalBackupArchive } from '@/lib/backups/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  try {
    const archive = await createLocalBackupArchive();
    const encodedName = encodeURIComponent(archive.fileName);
    return new Response(new Uint8Array(archive.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': String(archive.buffer.length),
        'Content-Disposition': `attachment; filename="ziwei-local-backup.ziweibackup"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'no-store',
        'X-Backup-Schema-Version': String(archive.preview.schemaVersion),
      },
    });
  } catch (error) {
    console.error('本地数据备份导出失败：', error);
    return Response.json({ error: '本地数据备份导出失败' }, { status: 500 });
  }
}
