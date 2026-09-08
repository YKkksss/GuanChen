import { NextResponse } from 'next/server';
import { getReportExport, listReportExports } from '@/lib/db/report-exports';
import {
  ReportExportBusyError,
  ensureReportPdfExport,
} from '@/lib/report-exports/service';
import { isReportExportKind } from '@/lib/report-exports/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sourceKind = params.get('sourceKind');
  const reportId = params.get('reportId')?.trim();
  if (!isReportExportKind(sourceKind) || !reportId) {
    return NextResponse.json({ error: '导出类型和报告编号不能为空' }, { status: 400 });
  }
  return NextResponse.json({ exports: listReportExports({ sourceKind, reportId }) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    sourceKind?: unknown;
    reportId?: unknown;
    version?: unknown;
  };
  if (!body || typeof body !== 'object' || Array.isArray(body) || !isReportExportKind(body.sourceKind)) {
    return NextResponse.json({ error: 'PDF 导出类型无效' }, { status: 400 });
  }
  const reportId = typeof body.reportId === 'string' ? body.reportId.trim() : '';
  if (!reportId) return NextResponse.json({ error: '报告编号不能为空' }, { status: 400 });
  const version = body.version === undefined ? undefined : Number(body.version);
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
    return NextResponse.json({ error: '报告版本无效' }, { status: 400 });
  }

  try {
    const result = await ensureReportPdfExport({
      sourceKind: body.sourceKind,
      reportId,
      version,
    });
    return NextResponse.json({
      export: result.record,
      reused: result.reused,
      downloadUrl: `/api/report-exports/${result.record.id}/download`,
    });
  } catch (error) {
    if (error instanceof ReportExportBusyError) {
      return NextResponse.json({
        export: getReportExport(error.exportId),
        error: error.message,
      }, { status: 202 });
    }
    const message = error instanceof Error ? error.message : 'PDF 导出失败';
    const status = message.includes('不存在') ? 404
      : message.includes('只有已完成') || message.includes('不一致') ? 409
        : message.includes('PDF_CJK_FONT_NOT_FOUND') ? 503
          : 500;
    console.error('PDF 导出失败：', error);
    return NextResponse.json({ error: publicError(message) }, { status });
  }
}

function publicError(message: string): string {
  if (message.includes('PDF_CJK_FONT_NOT_FOUND')) return '服务器没有可用的中文 PDF 字体，请先完成字体配置';
  if (message.startsWith('PDF_')) return 'PDF 文件生成失败，请稍后重试';
  return message.slice(0, 240);
}
