import { ChartPackageValidationError, inspectChartPackage } from '@/lib/chart-transfer/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('chartPackage');
    if (!(file instanceof File)) return Response.json({ error: '请选择 .ziweichart.json 文件' }, { status: 400 });
    const preview = inspectChartPackage(Buffer.from(await file.arrayBuffer()), file.name);
    return Response.json({ preview });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : '单命盘数据包预检失败',
      code: error instanceof ChartPackageValidationError ? error.code : undefined,
    }, { status: error instanceof ChartPackageValidationError ? 422 : 500 });
  }
}
