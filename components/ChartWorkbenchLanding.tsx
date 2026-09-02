'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ClockCounterClockwise,
  Eye,
  Plus,
  SpinnerGap,
  UserCircle,
} from '@phosphor-icons/react';
import HomeBirthForm from '@/components/HomeBirthForm';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { Conversation, ConversationListItem } from '@/lib/conversations/types';
import type { BirthInfo } from '@/lib/ziwei/types';
import styles from './ChartWorkbenchLanding.module.css';

export default function ChartWorkbenchLanding() {
  const router = useRouter();
  const formPanelRef = useRef<HTMLElement>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadConversations = useCallback(async () => {
    try {
      setError('');
      const response = await fetch('/api/conversations?type=chart&status=active&limit=20', { cache: 'no-store' });
      if (!response.ok) throw new Error('最近命盘读取失败');
      const data = await response.json() as { conversations?: ConversationListItem[] };
      setConversations(data.conversations ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '最近命盘读取失败');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    const refresh = () => void loadConversations();
    window.addEventListener('conversation-updated', refresh);
    return () => window.removeEventListener('conversation-updated', refresh);
  }, [loadConversations]);

  const createChartConversation = async (birthInfo: BirthInfo) => {
    setCreating(true);
    setError('');
    try {
      const chartSnapshot = generateChart(birthInfo);
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'chart', birthInfo, chartSnapshot }),
      });
      const data = await response.json() as { conversation?: Conversation; error?: string };
      if (!response.ok || !data.conversation) throw new Error(data.error || '命盘创建失败，请稍后再试');
      window.dispatchEvent(new Event('conversation-updated'));
      router.push(`/chart/${data.conversation.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '命盘创建失败，请稍后再试');
    } finally {
      setCreating(false);
    }
  };

  const focusQuickStart = () => {
    formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => formPanelRef.current?.querySelector<HTMLInputElement>('input')?.focus(), 350);
  };

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>命盘工作台</h1>
          <p>管理命盘、继续解读与回看历史记录</p>
        </div>
        <button type="button" className={styles.newButton} onClick={focusQuickStart}>
          <Plus size={20} weight="bold" aria-hidden="true" />
          新建命盘
        </button>
      </header>

      <div className={styles.workspaceGrid}>
        <section className={styles.recentSection} aria-labelledby="recent-chart-title">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="recent-chart-title">最近命盘</h2>
              <p>继续上次的命盘分析和对话</p>
            </div>
            <span>{conversations.length} 条</span>
          </div>

          <div className={styles.table} role="table" aria-label="最近命盘">
            <div className={styles.tableHead} role="row">
              <span role="columnheader">姓名</span>
              <span role="columnheader">出生信息</span>
              <span role="columnheader">最近查看</span>
              <span role="columnheader">操作</span>
            </div>

            {loadingHistory && (
              <div className={styles.state} role="status">
                <SpinnerGap className={styles.spinner} size={22} aria-hidden="true" />
                正在读取本地命档
              </div>
            )}

            {!loadingHistory && error && conversations.length === 0 && (
              <div className={styles.state} role="alert">
                <span>{error}</span>
                <button type="button" onClick={() => void loadConversations()}>重新读取</button>
              </div>
            )}

            {!loadingHistory && !error && conversations.length === 0 && (
              <div className={styles.emptyState}>
                <ClockCounterClockwise size={34} weight="thin" aria-hidden="true" />
                <strong>还没有命盘记录</strong>
                <span>填写右侧出生信息，建立第一份本地命档。</span>
                <button type="button" onClick={focusQuickStart}>开始起盘</button>
              </div>
            )}

            {!loadingHistory && conversations.slice(0, 6).map(item => (
              <article key={item.id} className={styles.tableRow} role="row">
                <div className={styles.ownerCell} role="cell">
                  <span className={styles.avatar}>{getInitial(item)}</span>
                  <span>
                    <strong>{getOwnerName(item)}</strong>
                    <small>{item.birthInfo?.gender === 'female' ? '女' : '男'}</small>
                  </span>
                </div>
                <div className={styles.birthCell} role="cell">
                  <strong>{formatBirthDate(item.birthInfo)}</strong>
                  <small>{formatBirthPlace(item.birthInfo)}</small>
                </div>
                <time role="cell" dateTime={new Date(item.updatedAt).toISOString()}>{formatUpdatedAt(item.updatedAt)}</time>
                <div className={styles.actionsCell} role="cell">
                  <button type="button" onClick={() => router.push(`/chart/${item.id}`)}>
                    <Eye size={16} aria-hidden="true" />查看
                  </button>
                  <button type="button" onClick={() => router.push(`/chart/${item.id}`)}>
                    解读<ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section ref={formPanelRef} className={styles.quickStart} aria-labelledby="quick-start-title">
          <div className={styles.quickHeading}>
            <span><UserCircle size={22} aria-hidden="true" /></span>
            <div>
              <h2 id="quick-start-title">快速开始</h2>
              <p>填写出生信息，立即生成你的命盘</p>
            </div>
          </div>
          <HomeBirthForm
            variant="workbench"
            loading={creating}
            error={error}
            onSubmit={birthInfo => void createChartConversation(birthInfo)}
          />
        </section>
      </div>
    </main>
  );
}

function getOwnerName(item: ConversationListItem): string {
  return item.birthInfo?.name?.trim() || item.title.split('·')[0]?.replace(/的命盘$/, '').trim() || '未命名';
}

function getInitial(item: ConversationListItem): string {
  const name = getOwnerName(item);
  return name === '未命名' ? '命' : name.slice(0, 1);
}

function formatBirthDate(birthInfo: BirthInfo | null): string {
  if (!birthInfo) return '出生信息未记录';
  return `${birthInfo.year}-${String(birthInfo.month).padStart(2, '0')}-${String(birthInfo.day).padStart(2, '0')}`;
}

function formatBirthPlace(birthInfo: BirthInfo | null): string {
  if (!birthInfo) return '本地命档';
  return [birthInfo.province, birthInfo.city].filter(Boolean).join(' ') || '出生地未填写';
}

function formatUpdatedAt(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
