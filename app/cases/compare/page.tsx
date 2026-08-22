import { Suspense } from 'react';
import CaseComparisonBuilder from '@/components/CaseComparisonBuilder';

export default function CaseComparisonPage() {
  return <Suspense fallback={<main className="min-h-screen px-5 py-20 text-center text-sm" style={{ color: 'var(--t-faint)' }}>正在打开案例对比台…</main>}><CaseComparisonBuilder /></Suspense>;
}
