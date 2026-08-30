import { NextResponse } from 'next/server';
import { compareReportVersions } from '@/lib/report-comparisons/service';
import { isReportComparisonSourceKind } from '@/lib/report-comparisons/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sourceKind = params.get('sourceKind');
  const reportId = params.get('reportId')?.trim();
  const baseVersion = Number(params.get('baseVersion'));
  const targetVersion = Number(params.get('targetVersion'));

  if (!isReportComparisonSourceKind(sourceKind)) {
    return NextResponse.json({ error: '报告类型无效' }, { status: 400 });
  }
  if (!reportId) return NextResponse.json({ error: '缺少报告 ID' }, { status: 400 });
  if (!Number.isInteger(baseVersion) || baseVersion < 1
    || !Number.isInteger(targetVersion) || targetVersion < 1) {
    return NextResponse.json({ error: '报告版本无效' }, { status: 400 });
  }

  try {
    return NextResponse.json(compareReportVersions({
      sourceKind,
      reportId,
      baseVersion,
      targetVersion,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : '报告版本对比失败';
    const status = message.includes('不存在') ? 404 : message.includes('不能') || message.includes('不同') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
