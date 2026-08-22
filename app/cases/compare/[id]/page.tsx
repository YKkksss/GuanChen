import CaseComparisonWorkspace from '@/components/CaseComparisonWorkspace';

interface PageProps { params: Promise<{ id: string }> }

export default async function CaseComparisonDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <CaseComparisonWorkspace comparisonId={id} />;
}
