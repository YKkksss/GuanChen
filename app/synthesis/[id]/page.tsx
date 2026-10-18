import SynthesisWorkspace from '@/components/SynthesisWorkspace';
import { isSynthesisTopic } from '@/lib/synthesis/types';
export const metadata = { title: '本命合参 · 观辰' };
export default async function SynthesisDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ topic?: string }> }) { const { id } = await params, { topic } = await searchParams; return <SynthesisWorkspace key={id} id={id} initialTopic={isSynthesisTopic(topic) ? topic : 'overview'} />; }
