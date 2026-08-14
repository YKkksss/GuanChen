import ReportDetailWorkspace from '@/components/ReportDetailWorkspace';

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = await params;
  return <ReportDetailWorkspace conversationId={id} reportId={reportId} />;
}
