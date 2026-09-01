import { ChartPackageValidationError, importChartPackage } from '@/lib/chart-transfer/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('chartPackage');
    if (!(file instanceof File)) return Response.json({ error: '请选择已经通过预检的命盘数据包' }, { status: 400 });
    const result = importChartPackage({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      confirmation: typeof form.get('confirmation') === 'string' ? String(form.get('confirmation')) : '',
      title: typeof form.get('title') === 'string' ? String(form.get('title')) : undefined,
    });
    return Response.json({ result });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : '单命盘数据包导入失败',
      code: error instanceof ChartPackageValidationError ? error.code : undefined,
    }, { status: error instanceof ChartPackageValidationError ? 422 : 500 });
  }
}
