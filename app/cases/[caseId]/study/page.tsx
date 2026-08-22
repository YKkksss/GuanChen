import CaseTeachingWorkspace from '@/components/CaseTeachingWorkspace';

export default async function CaseStudyPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <CaseTeachingWorkspace caseId={caseId} />;
}
