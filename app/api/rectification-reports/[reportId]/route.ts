import { NextResponse } from 'next/server';
import { getRectificationReportDetail } from '@/lib/db/rectification-reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface RouteContext { params: Promise<{ reportId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  const raw = new URL(request.url).searchParams.get('version');
  const version = raw ? Number(raw) : undefined;
  if (raw && (!Number.isInteger(version) || (version ?? 0) < 1)) return NextResponse.json({ error: '报告版本无效' }, { status: 400 });
  const detail = getRectificationReportDetail(reportId, version);
  if (!detail) return NextResponse.json({ error: '校时报告不存在' }, { status: 404 });
  if (raw && !detail.version) return NextResponse.json({ error: '报告版本不存在' }, { status: 404 });
  return NextResponse.json(detail);
}
