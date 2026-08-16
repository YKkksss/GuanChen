import { Suspense } from 'react';
import HemingTransitWorkspace from '@/components/HemingTransitWorkspace';

export default async function HemingTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<div className="p-20 text-center text-sm">正在加载双人运限…</div>}><HemingTransitWorkspace conversationId={id} /></Suspense>;
}
