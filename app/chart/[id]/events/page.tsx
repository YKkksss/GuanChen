import LifeEventsWorkspace from '@/components/LifeEventsWorkspace';

export default async function LifeEventsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LifeEventsWorkspace conversationId={id} />;
}
