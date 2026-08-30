import { NextResponse } from 'next/server';
import { readReportExportFile } from '@/lib/report-exports/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ exportId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { exportId } = await context.params;
  try {
    const { record, buffer } = await readReportExportFile(exportId);
    const asciiName = `report-${record.id}.pdf`;
    const encodedName = encodeURIComponent(record.fileName)
      .replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'X-Report-Export-Id': record.id,
        'X-Report-Export-Sha256': record.sha256 ?? '',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF 文件读取失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 409 });
  }
}
