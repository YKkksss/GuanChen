import { NextResponse } from 'next/server';
import { updateBackupPolicy } from '@/lib/backups/lifecycle';
import { BackupValidationError } from '@/lib/backups/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const summary = await updateBackupPolicy({
      enabled: body.enabled,
      intervalHours: body.intervalHours,
      retentionCount: body.retentionCount,
    });
    return NextResponse.json({ summary });
  } catch (error) {
    if (!(error instanceof BackupValidationError)) console.error('自动备份策略更新失败：', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '自动备份策略更新失败',
      code: error instanceof BackupValidationError ? error.code : undefined,
    }, { status: error instanceof BackupValidationError ? 422 : 500 });
  }
}
