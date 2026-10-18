import BaziReadingWorkspace from '@/components/BaziReadingWorkspace';
export const metadata = { title: '八字论命总览 · 观辰' };
export default async function BaziReadingPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <BaziReadingWorkspace key={id} chartId={id} />; }
