import Link from 'next/link';

export default function NotFoundPage() {
  return <main className="mx-auto max-w-2xl px-6 py-16" style={{ color: 'var(--t-text)' }}>
    <h1 className="text-2xl font-semibold">没有找到这个页面</h1>
    <p className="mt-4 leading-7">地址可能有误，相关资料可能已删除，或知识专题尚未收录。</p>
    <nav className="mt-6 flex flex-wrap gap-5" aria-label="可用入口">
      <Link className="inline-flex min-h-11 items-center" href="/history">命盘档案</Link>
      <Link className="inline-flex min-h-11 items-center" href="/knowledge">已收录知识</Link>
      <Link className="inline-flex min-h-11 items-center" href="/">返回首页</Link>
    </nav>
  </main>;
}
