import FortuneTopicsWorkspace from '@/components/FortuneTopicsWorkspace';
import { isFortuneTopic } from '@/lib/fortune-topics/types';
import { parsePeriodKey } from '@/lib/fortune-topics/periods';
export const metadata = { title: '紫微运势专题 · 观辰' };
export default async function FortunePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ topic?: string; period?: string; compare?: string }> }) {
  const { id } = await params, query = await searchParams;
  const safeKey = (v: unknown) => { if (typeof v !== 'string') return ''; try { parsePeriodKey(v); return v; } catch { return ''; } };
  return <FortuneTopicsWorkspace key={id} conversationId={id} initialTopic={isFortuneTopic(query.topic) ? query.topic : 'career'} initialPeriod={safeKey(query.period)} initialCompare={safeKey(query.compare)} />;
}
