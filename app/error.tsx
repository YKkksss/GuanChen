'use client';

import Link from 'next/link';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto max-w-2xl px-6 py-16" style={{ color: 'var(--t-text)' }}>
    <h1 className="text-2xl font-semibold">页面暂时无法显示</h1>
    <p role="alert" className="mt-4 leading-7">请尝试重新加载。若刚才正在保存或生成内容，恢复后先核对记录，避免重复提交。</p>
    <div className="mt-6 flex flex-wrap gap-4">
      <button type="button" onClick={reset} className="min-h-11 rounded-lg px-5" style={{ background: 'var(--ac)', color: 'white' }}>重新加载页面</button>
      <Link href="/history" className="inline-flex min-h-11 items-center">查看命盘档案</Link>
      <Link href="/" className="inline-flex min-h-11 items-center">返回首页</Link>
    </div>
  </main>;
}
