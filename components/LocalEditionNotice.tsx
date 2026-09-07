import Link from 'next/link';
import type { ReactNode } from 'react';

export default function LocalEditionNotice({ title, children }: { title: string; children: ReactNode }) {
  return <main className="mx-auto max-w-3xl px-6 py-10 leading-8" style={{ color: 'var(--t-text)' }}>
    <Link href="/" className="inline-flex min-h-11 items-center" style={{ color: 'var(--ac)' }}>← 返回首页</Link>
    <h1 className="mt-6 text-2xl font-semibold">{title}</h1>
    <p className="mb-8 mt-2 text-sm" style={{ color: 'var(--t-text2)' }}>适用于 v1 本地与可信局域网版本 · 更新于 2026-09-07</p>
    <div className="space-y-7 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold">{children}</div>
    <nav aria-label="版本说明" className="mt-10 flex flex-wrap gap-x-6 border-t pt-4" style={{ borderColor: 'var(--t-border)', color: 'var(--ac)' }}>
      <Link className="inline-flex min-h-11 items-center" href="/privacy">数据与隐私说明</Link>
      <Link className="inline-flex min-h-11 items-center" href="/terms">本地版使用说明</Link>
      <Link className="inline-flex min-h-11 items-center" href="/settings/data">数据保险箱</Link>
    </nav>
  </main>;
}
