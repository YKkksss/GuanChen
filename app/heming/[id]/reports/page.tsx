import HemingReportsWorkspace from '@/components/HemingReportsWorkspace';

export default async function HemingReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HemingReportsWorkspace conversationId={id} />;
}
