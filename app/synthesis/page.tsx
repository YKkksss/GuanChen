import SynthesisHome from '@/components/SynthesisHome';
export const metadata = { title: '紫微与八字合参 · 观辰' };
export default async function SynthesisPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) { const { source } = await searchParams; return <SynthesisHome sourceId={typeof source === 'string' ? source : ''} />; }
