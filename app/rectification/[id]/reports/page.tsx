import RectificationReportsWorkspace from '@/components/RectificationReportsWorkspace';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RectificationReportsWorkspace sessionId={id} />;
}
