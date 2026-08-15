import ReportDetailWorkspace from '@/components/ReportDetailWorkspace';

export default async function HemingReportDetailPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = await params;
  return <ReportDetailWorkspace conversationId={id} reportId={reportId} conversationType="heming" />;
}
