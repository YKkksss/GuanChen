import CaseDetailWorkspace from '@/components/CaseDetailWorkspace';

export default async function CaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <CaseDetailWorkspace caseId={caseId} />;
}
