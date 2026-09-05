'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Conversation } from '@/lib/conversations/types';
import type { RectificationSessionListItem } from '@/lib/rectification/types';
import { destinationHref, supportsDestination, WORKSPACE_DESTINATIONS, type WorkspaceDestination, type WorkspaceSection } from '@/lib/ui/workspace-navigation';
import styles from './ChartDestinationPicker.module.css';

type Entry = { id: string; title: string; section: WorkspaceSection; updatedAt: number };
const SECTION_LABELS = { chart: '个人命盘', heming: '紫微合盘', rectification: '生时校正' };

export default function ChartDestinationPicker({ target }: { target: WorkspaceDestination }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const read = async (url: string) => {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('档案加载失败，请重试。');
      return response.json();
    };
    void (async () => {
      try {
        const [conversations, rectifications] = await Promise.all([
          read(`/api/conversations?status=active&limit=100${target === 'events' ? '&type=chart' : ''}`) as Promise<{ conversations: Conversation[] }>,
          target === 'reports' ? read('/api/rectifications?limit=100') as Promise<{ sessions: RectificationSessionListItem[] }> : Promise.resolve({ sessions: [] }),
        ]);
        if (controller.signal.aborted) return;
        setEntries([
          ...conversations.conversations.filter(item => supportsDestination(item.type, target))
            .map(item => ({ id: item.id, title: item.title, section: item.type, updatedAt: item.updatedAt })),
          ...rectifications.sessions.filter(item => item.status !== 'archived')
            .map(item => ({ id: item.id, title: item.title, section: 'rectification' as const, updatedAt: item.updatedAt })),
        ].sort((a, b) => b.updatedAt - a.updatedAt));
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '档案加载失败，请重试。');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [target, retry]);

  const destination = WORKSPACE_DESTINATIONS[target];
  const visibleEntries = entries.filter(item => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return (
    <main className={styles.picker}>
      <p className={styles.eyebrow}>档案报告 / {destination.label}</p>
      <h1>{destination.label} · 选择档案</h1>
      <p>{destination.description}请先选择一份已有档案。</p>
      <label className={styles.search}>按名称筛选最近档案
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="输入档案名称" />
      </label>
      <p className={styles.hint}>{target === 'events' ? '加载最近 100 份未归档个人命盘' : '个人命盘与合盘合计加载最近 100 份未归档会话'}{target === 'reports' ? '，另加载最近 100 份校正档案并排除已归档项' : ''}。</p>
      {loading ? <p role="status">正在加载档案…</p> : error ? (
        <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>重新加载</button></div>
      ) : visibleEntries.length ? (
        <ul className={styles.entries}>
          {visibleEntries.map(item => <li key={`${item.section}-${item.id}`}>
            <Link href={destinationHref(target, item.section, item.id)}>
              <span><small>{SECTION_LABELS[item.section]}</small><strong>{item.title}</strong></span>
              <span>查看{destination.label} →</span>
            </Link>
          </li>)}
        </ul>
      ) : <p role="status">{query ? '最近档案中没有匹配项，可更换名称或前往档案列表查找。' : '暂无可用档案，先建立命盘后即可继续。'}</p>}
      <div className={styles.actions}>
        <Link href="/chart">前往个人命盘</Link>
        {target !== 'events' && <Link href="/heming">前往紫微合盘</Link>}
        {target === 'reports' && <Link href="/rectification">前往生时校正</Link>}
      </div>
    </main>
  );
}
