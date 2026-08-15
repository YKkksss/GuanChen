import HemingWorkspace from '@/components/HemingWorkspace';

interface HemingConversationPageProps {
  params: Promise<{ id: string }>;
}

export default async function HemingConversationPage({ params }: HemingConversationPageProps) {
  const { id } = await params;
  return <HemingWorkspace conversationId={id} />;
}
