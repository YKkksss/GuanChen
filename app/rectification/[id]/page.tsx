import RectificationWorkbench from '@/components/RectificationWorkbench';

export default async function RectificationWorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RectificationWorkbench sessionId={id} />;
}
