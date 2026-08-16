import RectificationReportDetailWorkspace from '@/components/RectificationReportDetailWorkspace';
export default async function Page({ params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { id, reportId } = await params;
  return <RectificationReportDetailWorkspace sessionId={id} reportId={reportId} />;
}
