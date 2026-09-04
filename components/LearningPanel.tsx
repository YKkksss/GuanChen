'use client';

import { ArrowSquareOut, BookOpen, CheckCircle, FloppyDisk, NotePencil, WarningCircle } from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { LearningLessonResponse } from '@/lib/learning/types';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

export default function LearningPanel({
  conversationId,
  branch,
  onNavigate,
  onDirtyChange,
}: {
  conversationId: string;
  branch: number;
  onNavigate: (branch: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<LearningLessonResponse | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [noteDirty, setNoteDirty] = useState(false);
  useUnsavedChanges(noteDirty, '当前学习笔记尚未保存，确定离开吗？草稿仍会保存在这个浏览器中。');

  const draftKey = `ziwei-learning-note-draft:${conversationId}:${branch}`;

  useEffect(() => {
    onDirtyChange?.(noteDirty);
    return () => onDirtyChange?.(false);
  }, [noteDirty, onDirtyChange]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setSaved(false);
    fetch(`/api/conversations/${conversationId}/learning?branch=${branch}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json() as LearningLessonResponse & { error?: string };
        if (!response.ok || !result.lesson) throw new Error(result.error || '学习讲解加载失败');
        const localDraft = window.localStorage.getItem(draftKey);
        setData(result);
        setNote(localDraft ?? result.note?.content ?? '');
        setNoteDirty(localDraft !== null && localDraft !== (result.note?.content ?? ''));
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '学习讲解加载失败');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [branch, conversationId, draftKey]);

  const updateNote = (value: string) => {
    setNote(value);
    setSaved(false);
    setNoteDirty(true);
    window.localStorage.setItem(draftKey, value);
  };

  const save = async () => {
    setSaving(true); setSaved(false); setError('');
    try {
      const response = await fetch(`/api/conversations/${conversationId}/learning/notes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, content: note }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '学习笔记保存失败');
      setSaved(true);
      setNoteDirty(false);
      window.localStorage.removeItem(draftKey);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : '学习笔记保存失败'); }
    finally { setSaving(false); }
  };

  return (
    <aside className="flex max-h-[calc(100dvh-2rem)] min-h-[640px] flex-col overflow-hidden rounded-xl border" style={{ borderColor: 'var(--t-border)', background: 'var(--t-card)' }}>
      <header className="border-b px-4 py-4" style={{ borderColor: 'var(--t-border)', background: 'linear-gradient(135deg,rgba(212,168,67,.09),transparent)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><BookOpen size={19} style={{ color: 'var(--t-gold)' }} /><h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>命盘结构学习</h2></div>
          <span className="rounded-full px-2 py-1 text-[9px]" style={{ color: 'var(--t-gold)', background: 'rgba(212,168,67,.08)' }}>M6 · 基础</span>
        </div>
        <p className="mt-2 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>点击左侧任意宫位，按照固定步骤学习。页面只读取命盘事实，不调用 AI 下吉凶结论。</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading && <div className="py-20 text-center text-xs" style={{ color: 'var(--t-faint)' }}>正在组织命盘结构讲解…</div>}
        {error && <div className="mb-4 flex gap-2 rounded-lg border px-3 py-3 text-xs" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,.25)' }}><WarningCircle className="mt-0.5 shrink-0" size={16} />{error}</div>}
        {!loading && data && (
          <>
            <section>
              <p className="text-[9px] tracking-[.22em]" style={{ color: 'var(--t-gold)' }}>当前学习对象</p>
              <h3 className="mt-2 text-lg font-semibold" style={{ color: 'var(--t-text)' }}>{data.lesson.title}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.lesson.facts.relations.map(item => (
                  <button key={`${item.relation}-${item.branch}`} type="button" onClick={() => onNavigate(item.branch)} className="rounded-lg border px-2.5 py-1.5 text-[10px]" style={{ borderColor: item.relation === 'self' ? 'rgba(212,168,67,.35)' : 'var(--t-border)', color: item.relation === 'self' ? 'var(--t-gold)' : 'var(--t-faint)' }}>
                    {item.relation === 'self' ? '本宫' : item.relation === 'opposite' ? '对宫' : '三合'} · {item.palaceName}
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-5 space-y-3">
              {data.lesson.steps.map(step => (
                <article key={step.key} className="rounded-lg border p-3" style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg2)' }}>
                  <div className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px]" style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.28)' }}>{step.order}</span><h4 className="text-xs font-semibold" style={{ color: 'var(--t-text)' }}>{step.title}</h4></div>
                  <p className="mt-2 text-[11px] leading-6" style={{ color: 'var(--t-text2)' }}>{step.fact}</p>
                  <p className="mt-2 border-l-2 pl-2 text-[10px] leading-5" style={{ color: 'var(--t-faint)', borderColor: 'rgba(212,168,67,.28)' }}>{step.teaching}</p>
                </article>
              ))}
            </section>

            <details className="mt-5 rounded-lg border px-3 py-3" style={{ borderColor: 'var(--t-border)' }}>
              <summary className="cursor-pointer text-xs font-medium" style={{ color: 'var(--t-gold)' }}>本节知识点与常见错误</summary>
              <div className="mt-3 space-y-3">{data.lesson.knowledgePoints.map(point => <div key={point.id}><p className="text-[11px] font-medium" style={{ color: 'var(--t-text)' }}>{point.title}</p><p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>{point.explanation}</p><p className="mt-1 text-[9px] leading-5" style={{ color: '#ef8b73' }}>常见错误：{point.commonMistakes.join('；')}</p></div>)}</div>
            </details>

            <section className="mt-5 rounded-lg border p-3" style={{ borderColor: 'var(--t-border)' }}>
              <div className="flex items-center gap-2"><NotePencil size={16} style={{ color: 'var(--t-gold)' }} /><h3 className="text-xs font-semibold" style={{ color: 'var(--t-text)' }}>我的学习笔记</h3></div>
              <textarea value={note} onChange={event => updateNote(event.target.value)} maxLength={4000} rows={5} placeholder="记录你对这个宫位的观察、疑问或自己的分析步骤…" className="mt-3 w-full resize-y rounded-lg border px-3 py-2 text-xs leading-6 outline-none" style={{ color: 'var(--t-text)', background: 'var(--t-bg)', borderColor: 'var(--t-border)' }} />
              <div className="mt-2 flex items-center justify-between gap-3"><span className="text-[9px]" style={{ color: saved ? '#4ade80' : noteDirty ? '#f59e0b' : 'var(--t-faint)' }}>{saved ? <span className="inline-flex items-center gap-1"><CheckCircle size={12} />已保存到本地</span> : noteDirty ? `草稿已暂存在本浏览器 · ${note.length}/4000` : `${note.length}/4000`}</span><button type="button" disabled={saving || !noteDirty} onClick={() => void save()} className="rounded-lg px-3 py-1.5 text-[10px] disabled:opacity-50" style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.28)' }}><FloppyDisk className="mr-1 inline" size={13} />{saving ? '保存中…' : note.trim() ? '保存笔记' : '清空笔记'}</button></div>
            </section>

            <section className="mt-5">
              <h3 className="text-xs font-semibold" style={{ color: 'var(--t-text)' }}>依据来源</h3>
              <div className="mt-2 space-y-2">{data.lesson.sources.map(source => source.href ? <Link key={source.id} href={source.href} target="_blank" className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-[10px]" style={{ color: 'var(--t-faint)', borderColor: 'var(--t-border)' }}><span><strong style={{ color: 'var(--t-text)' }}>{source.title}</strong><br />{source.note}</span><ArrowSquareOut className="mt-0.5 shrink-0" size={13} /></Link> : <div key={source.id} className="rounded-lg border px-3 py-2 text-[10px] leading-5" style={{ color: 'var(--t-faint)', borderColor: 'var(--t-border)' }}><strong style={{ color: 'var(--t-text)' }}>{source.title}</strong><br />{source.note}</div>)}</div>
            </section>

            <footer className="mt-5 rounded-lg px-3 py-3 text-[9px] leading-5" style={{ color: 'var(--t-faint)', background: 'rgba(212,168,67,.04)' }}>{data.lesson.boundary}<br />方法版本：{data.lesson.methodologyVersion} · 知识版本：{data.lesson.knowledgeVersion}</footer>
          </>
        )}
      </div>
    </aside>
  );
}
