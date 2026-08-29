import BaziChatWorkspace from '@/components/BaziChatWorkspace';

export default async function BaziChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BaziChatWorkspace conversationId={id} />;
}
