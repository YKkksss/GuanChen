'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ConversationListItem } from '@/lib/conversations/types';

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ q: query, type, status, limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    void (async () => {
      try {
        const response = await fetch(`/api/conversations?${params}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json() as { conversations?: ConversationListItem[]; total?: number; error?: string };
        if (!response.ok) throw new Error(data.error || '档案读取失败');
        if (controller.signal.aborted) return;
        const count = data.total ?? 0;
        // 删除或归档后页数可能缩减，返回仍然存在的最后一页。
        if (page > 0 && page * PAGE_SIZE >= count) {
          setPage(Math.max(0, Math.ceil(count / PAGE_SIZE) - 1));
          return;
        }
        setItems(data.conversations ?? []);
        setTotal(count);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '档案读取失败');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [query, type, status, page, retry]);

  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">全部命盘档案</h1><p className="mt-2 text-sm">查找个人命盘及合盘，继续之前的解读。</p></div>
      <Link className="btn-accent min-h-11" href="/chart">新建命盘</Link>
    </header>
    <nav className="flex flex-wrap gap-4 text-sm" aria-label="其他档案入口">
      <Link className="inline-flex min-h-11 items-center underline" href="/bazi">八字档案</Link>
      <Link className="inline-flex min-h-11 items-center underline" href="/rectification">校时任务</Link>
    </nav>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setPage(0); setQuery(draft.trim()); setRetry(value => value + 1); }}>
      <label className="min-w-0 flex-1 space-y-2"><span className="block text-sm">名称或姓名</span><input className="rectification-input min-h-11" type="search" maxLength={100} value={draft} onChange={event => setDraft(event.target.value)} placeholder="搜索所有档案" /></label>
      <label className="space-y-2"><span className="block text-sm">类型</span><select className="rectification-input min-h-11" value={type} onChange={event => { setType(event.target.value); setPage(0); }}><option value="">全部</option><option value="chart">个人命盘</option><option value="heming">合盘</option></select></label>
      <label className="space-y-2"><span className="block text-sm">状态</span><select className="rectification-input min-h-11" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="active">使用中</option><option value="archived">已归档</option><option value="">全部</option></select></label>
      <button type="submit" className="btn-accent min-h-11">搜索</button>
    </form>
    {loading ? <p role="status">正在读取档案…</p> : error ? <div role="alert"><p>{error}</p><button className="min-h-11 underline" type="button" onClick={() => setRetry(value => value + 1)}>重新读取</button></div> : <>
      <p role="status" className="text-sm">共 {total} 条{query ? `，搜索“${query}”` : ''}</p>
      {items.length === 0 ? <p className="rounded-lg border p-6">没有符合条件的档案，可以清空搜索或调整筛选条件。</p> : <ul className="divide-y rounded-lg border">
        {items.map(item => <li key={item.id}><Link className="flex min-h-16 flex-wrap items-center justify-between gap-3 p-4 hover:opacity-80 focus-visible:outline" href={`/${item.type === 'heming' ? 'heming' : 'chart'}/${item.id}`}>
          <div className="min-w-0 flex-1"><strong className="block break-words">{item.title}</strong><span className="text-sm">{item.type === 'heming' ? '合盘' : '个人命盘'} · {item.messageCount} 条消息{item.status === 'archived' ? ' · 已归档' : ''}</span></div>
          <span className="text-sm">{new Date(item.updatedAt).toLocaleDateString('zh-CN')} · 打开</span>
        </Link></li>)}
      </ul>}
      <nav aria-label="档案分页" className="flex items-center justify-center gap-4">
        <button type="button" className="min-h-11 px-3 disabled:opacity-40" disabled={page === 0} onClick={() => setPage(value => value - 1)}>上一页</button>
        <span>第 {page + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))} 页</span>
        <button type="button" className="min-h-11 px-3 disabled:opacity-40" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(value => value + 1)}>下一页</button>
      </nav>
    </>}
    <p className="text-sm">档案保存在部署电脑，同一局域网部署的访问者共享这些数据。</p>
  </main>;
}
