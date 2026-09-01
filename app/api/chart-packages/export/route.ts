import { createChartPackage, ChartPackageValidationError } from '@/lib/chart-transfer/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const conversationId = new URL(request.url).searchParams.get('conversationId')?.trim();
  if (!conversationId) return Response.json({ error: '请选择要导出的单人命盘' }, { status: 400 });
  try {
    const result = createChartPackage(conversationId);
    const encodedName = encodeURIComponent(result.fileName);
    return new Response(new Uint8Array(result.buffer), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': String(result.buffer.length),
        'Content-Disposition': `attachment; filename="ziwei-chart-package.json"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'no-store',
        'X-Chart-Package-Rows': String(result.preview.totalRows),
      },
    });
  } catch (error) {
    const status = error instanceof ChartPackageValidationError && error.code === 'CONVERSATION_NOT_FOUND' ? 404 : 422;
    return Response.json({ error: error instanceof Error ? error.message : '单命盘导出失败' }, { status });
  }
}
