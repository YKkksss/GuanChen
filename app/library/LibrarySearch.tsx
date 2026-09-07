import Link from 'next/link';

/** 搜索入口和结果页共用原生表单，支持键盘及无脚本提交。 */
export default function LibrarySearch({ initialQuery = '' }: { initialQuery?: string }) {
  return <form action="/library/search" method="get" role="search" className="flex flex-wrap gap-2 rounded-xl border p-2" style={{ borderColor: 'var(--t-border)', background: 'var(--bg-card)' }}>
    <label htmlFor="classics-query" className="sr-only">检索已收录古籍内容</label>
    <input key={initialQuery} id="classics-query" name="q" type="search" defaultValue={initialQuery} maxLength={100} required className="min-h-11 min-w-0 flex-1 rounded-lg px-3" style={{ color: 'var(--t-text)', background: 'var(--bg-card)' }} placeholder="输入关键词，如：紫微、命宫" />
    <button type="submit" className="min-h-11 rounded-lg px-5" style={{ background: 'var(--ac)', color: 'white' }}>搜索</button>
    {initialQuery && <Link className="flex min-h-11 items-center px-3" href="/library/search">清空</Link>}
  </form>;
}
