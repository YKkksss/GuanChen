import ReportsWorkspace from '@/components/ReportsWorkspace';

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReportsWorkspace conversationId={id} />;
}
