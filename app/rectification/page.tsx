import { Suspense } from 'react';
import RectificationHome from '@/components/RectificationHome';

export default function RectificationPage() {
  return (
    <Suspense fallback={<main className="min-h-[100dvh]" style={{ background: 'var(--bg-0)' }} />}>
      <RectificationHome />
    </Suspense>
  );
}
