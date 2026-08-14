import ChartWorkspace from '@/components/ChartWorkspace';

export default async function SavedChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChartWorkspace conversationId={id} />;
}
