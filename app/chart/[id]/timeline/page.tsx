import TransitWorkspace from '@/components/TransitWorkspace';

export default async function TransitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TransitWorkspace conversationId={id} />;
}
