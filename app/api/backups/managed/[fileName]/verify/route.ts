import { NextResponse } from 'next/server';
import { verifyManagedBackup } from '@/lib/backups/lifecycle';
import { BackupValidationError } from '@/lib/backups/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(
  _request: Request,
  context: { params: Promise<{ fileName: string }> },
) {
  try {
    const { fileName } = await context.params;
    return NextResponse.json({ backup: await verifyManagedBackup(fileName) });
  } catch (error) {
    if (!(error instanceof BackupValidationError)) console.error('本地备份健康检查失败：', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '本地备份健康检查失败',
      code: error instanceof BackupValidationError ? error.code : undefined,
    }, { status: error instanceof BackupValidationError ? 422 : 500 });
  }
}
