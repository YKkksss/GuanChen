'use client';

import {
  ArrowCounterClockwise,
  CheckCircle,
  FloppyDisk,
  NotePencil,
  PencilSimple,
  SpinnerGap,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import type { ReportContent } from '@/lib/reports/types';
import type { ReportExportKind } from '@/lib/report-exports/types';
import type {
  ReportEditableContent,
  ReportReviewStatus,
  ReportUserRevision,
} from '@/lib/report-revisions/types';

export default function ReportReviewPanel({
  sourceKind,
  reportId,
  version,
  originalContent,
  onRevisionChange,
}: {
  sourceKind: ReportExportKind;
  reportId: string;
  version: number;
  originalContent: ReportEditableContent;
  onRevisionChange: (revision: ReportUserRevision | null) => void;
}) {
  const [revision, setRevision] = useState<ReportUserRevision | null>(null);
  const [note, setNote] = useState('');
  const [editDraft, setEditDraft] = useState<ReportEditableContent | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const editDirty = editing && Boolean(editDraft) && JSON.stringify(editDraft) !== JSON.stringify(revision?.editedContent ?? originalContent);
  const noteDirty = note !== savedNote;
  const hasUnsavedChanges = editDirty || noteDirty;
  useUnsavedChanges(hasUnsavedChanges, '当前报告备注或人工修订尚未保存，确定离开吗？草稿仍会保存在这个浏览器中。');

  const draftKey = `ziwei-report-review-draft:${sourceKind}:${reportId}:${version}`;

  const keepLocalDraft = (nextNote: string, nextEditDraft: ReportEditableContent | null, nextEditing: boolean) => {
    window.localStorage.setItem(draftKey, JSON.stringify({ note: nextNote, editDraft: nextEditDraft, editing: nextEditing }));
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setRevision(null);
    setNote('');
    setEditing(false);
    setEditDraft(null);
    onRevisionChange(null);
    fetch(`/api/report-user-revisions?sourceKind=${sourceKind}&reportId=${encodeURIComponent(reportId)}&version=${version}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as { revision?: ReportUserRevision | null; error?: string };
        if (!response.ok) throw new Error(data.error || '报告确认信息加载失败');
        const next = data.revision ?? null;
        const nextSavedNote = next?.note ?? '';
        const localDraft = readReportDraft(draftKey);
        setRevision(next);
        setSavedNote(nextSavedNote);
        setNote(localDraft?.note ?? nextSavedNote);
        setEditDraft(localDraft?.editDraft ?? null);
        setEditing(Boolean(localDraft?.editing && localDraft.editDraft));
        onRevisionChange(next);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '报告确认信息加载失败');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [draftKey, onRevisionChange, reportId, sourceKind, version]);

  const persist = async (input: {
    action: string;
    reviewStatus: ReportReviewStatus;
    editedContent: ReportEditableContent | null;
    noteValue?: string;
  }) => {
    setBusy(input.action);
    setError('');
    try {
      const response = await fetch('/api/report-user-revisions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceKind,
          reportId,
          version,
          reviewStatus: input.reviewStatus,
          note: input.noteValue ?? note,
          editedContent: input.editedContent,
        }),
      });
      const data = await response.json().catch(() => ({})) as { revision?: ReportUserRevision; error?: string };
      if (!response.ok || !data.revision) throw new Error(data.error || '保存失败');
      setRevision(data.revision);
      setNote(data.revision.note);
      setSavedNote(data.revision.note);
      window.localStorage.removeItem(draftKey);
      onRevisionChange(data.revision);
      return data.revision;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败');
      return null;
    } finally {
      setBusy('');
    }
  };

  const effectiveContent = revision?.editedContent ?? originalContent;
  const openEditor = () => {
    const nextDraft = cloneEditableContent(effectiveContent);
    setEditDraft(nextDraft);
    setEditing(true);
    keepLocalDraft(note, nextDraft, true);
  };
  const saveEdits = async () => {
    if (!editDraft) return;
    const saved = await persist({ action: 'edit', reviewStatus: 'draft', editedContent: editDraft });
    if (saved) {
      setEditing(false);
      setEditDraft(null);
    }
  };
  const restoreOriginal = async () => {
    if (!window.confirm('确定恢复 AI 原文吗？当前人工修订内容将从正在使用的版本中移除，但 AI 原始版本仍会保留。')) return;
    const saved = await persist({ action: 'restore', reviewStatus: 'draft', editedContent: null });
    if (saved) {
      setEditing(false);
      setEditDraft(null);
    }
  };
  const changeStatus = (reviewStatus: ReportReviewStatus) => persist({
    action: reviewStatus,
    reviewStatus,
    editedContent: revision?.editedContent ?? null,
  });

  const status = revision?.reviewStatus;
  return (
    <section className="report-controls mb-5 overflow-hidden rounded-xl" style={{ border: '1px solid var(--t-border, var(--bdr))', background: 'var(--t-bg2, var(--bg-card))' }}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <NotePencil size={17} style={{ color: 'var(--t-gold, var(--ac-dim))' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--t-text, var(--tx-1))' }}>报告确认与个人修订</h2>
            <StatusBadge status={status} loading={loading} />
            {revision?.editedContent && (
              <span className="rounded-full px-2 py-0.5 text-[9px]" style={{ color: 'var(--t-gold, var(--ac-dim))', background: 'rgba(212,168,67,.08)' }}>
                人工修订第 {revision.editRevision} 稿
              </span>
            )}
          </div>
          <p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--t-faint, var(--tx-3))' }}>
            AI 原始版本保持不变；确认、备注与人工修订只绑定当前 v{version}，切换版本不会串用。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton onClick={() => void changeStatus('confirmed')} disabled={loading || Boolean(busy) || editing} active={status === 'confirmed'}>
            <CheckCircle size={14} />{busy === 'confirmed' ? '正在确认…' : '确认此版本'}
          </ActionButton>
          <ActionButton onClick={() => void changeStatus('needs_revision')} disabled={loading || Boolean(busy) || editing} active={status === 'needs_revision'} danger>
            <WarningCircle size={14} />{busy === 'needs_revision' ? '正在标记…' : '标记待调整'}
          </ActionButton>
          {!editing && (
            <ActionButton onClick={openEditor} disabled={loading || Boolean(busy)}>
              <PencilSimple size={14} />编辑人工副本
            </ActionButton>
          )}
          {revision?.editedContent && !editing && (
            <ActionButton onClick={() => void restoreOriginal()} disabled={Boolean(busy)}>
              <ArrowCounterClockwise size={14} />{busy === 'restore' ? '正在恢复…' : '恢复 AI 原文'}
            </ActionButton>
          )}
        </div>
      </div>

      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-[1fr_auto] sm:px-5">
        <textarea
          value={note}
          onChange={event => {
            const value = event.target.value;
            setNote(value);
            keepLocalDraft(value, editDraft, editing);
          }}
          maxLength={4000}
          rows={2}
          placeholder="记录你对这个版本的个人看法、待核实信息或现实反馈……"
          className="min-h-20 w-full resize-y rounded-lg px-3 py-2 text-xs outline-none"
          style={{ color: 'var(--t-text, var(--tx-1))', background: 'var(--t-bg, var(--bg-0))', border: '1px solid var(--t-border, var(--bdr))' }}
        />
        <ActionButton
          onClick={() => void persist({
            action: 'note',
            reviewStatus: revision?.reviewStatus ?? 'draft',
            editedContent: revision?.editedContent ?? null,
          })}
          disabled={loading || Boolean(busy) || editing}
        >
          {busy === 'note' ? <SpinnerGap className="animate-spin" size={14} /> : <FloppyDisk size={14} />}
          保存备注
        </ActionButton>
      </div>

      {editing && editDraft && (
        <div className="border-t px-4 py-5 sm:px-5" style={{ borderColor: 'var(--t-border, var(--bdr))', background: 'rgba(212,168,67,.025)' }}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold" style={{ color: 'var(--t-text, var(--tx-1))' }}>编辑人工副本</h3>
              <p className="mt-1 text-[9px]" style={{ color: 'var(--t-faint, var(--tx-3))' }}>章节结构、证据映射和免责声明由系统锁定，只编辑解释文字与行动清单。</p>
            </div>
            <div className="flex gap-2">
              <ActionButton onClick={() => {
                if (editDirty && !window.confirm('确定放弃尚未保存的人工修订吗？')) return;
                setEditing(false);
                setEditDraft(null);
                if (noteDirty) keepLocalDraft(note, null, false);
                else window.localStorage.removeItem(draftKey);
              }} disabled={Boolean(busy)}><X size={14} />取消</ActionButton>
              <ActionButton onClick={() => void saveEdits()} disabled={Boolean(busy)} active><FloppyDisk size={14} />{busy === 'edit' ? '正在保存…' : '保存修订稿'}</ActionButton>
            </div>
          </div>
          {editDraft.format === 'plain_text'
            ? <PlainTextEditor draft={editDraft} onChange={next => { setEditDraft(next); keepLocalDraft(note, next, true); }} />
            : <StructuredEditor draft={editDraft.content} onChange={content => { const next = { format: 'structured' as const, content }; setEditDraft(next); keepLocalDraft(note, next, true); }} />}
        </div>
      )}

      {error && <div role="alert" className="border-t px-4 py-3 text-[10px] text-red-500 sm:px-5" style={{ borderColor: 'rgba(239,68,68,.2)' }}>{error}</div>}
    </section>
  );
}

function readReportDraft(key: string): { note: string; editDraft: ReportEditableContent | null; editing: boolean } | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as { note?: unknown; editDraft?: unknown; editing?: unknown };
    return {
      note: typeof value.note === 'string' ? value.note : '',
      editDraft: value.editDraft && typeof value.editDraft === 'object' ? value.editDraft as ReportEditableContent : null,
      editing: value.editing === true,
    };
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

function StructuredEditor({ draft, onChange }: { draft: ReportContent; onChange: (content: ReportContent) => void }) {
  return (
    <div className="space-y-4">
      <EditorField label="核心结论摘要" value={draft.summary} rows={4} onChange={summary => onChange({ ...draft, summary })} />
      {draft.sections.map((section, index) => (
        <EditorField
          key={section.key}
          label={`【${section.title}】`}
          value={section.content}
          rows={5}
          onChange={content => onChange({
            ...draft,
            sections: draft.sections.map((item, itemIndex) => itemIndex === index ? { ...item, content } : item),
          })}
        />
      ))}
      <EditorField label="执行清单（每行一项）" value={draft.actionItems.join('\n')} rows={4} onChange={value => onChange({ ...draft, actionItems: splitLines(value) })} />
      <EditorField label="待确认问题（每行一项）" value={draft.openQuestions.join('\n')} rows={4} onChange={value => onChange({ ...draft, openQuestions: splitLines(value) })} />
    </div>
  );
}

function PlainTextEditor({ draft, onChange }: {
  draft: Extract<ReportEditableContent, { format: 'plain_text' }>;
  onChange: (content: ReportEditableContent) => void;
}) {
  return <EditorField label="年度报告正文" value={draft.content} rows={20} onChange={content => onChange({ format: 'plain_text', content })} />;
}

function EditorField({ label, value, rows, onChange }: { label: string; value: string; rows: number; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-medium" style={{ color: 'var(--t-gold, var(--ac-dim))' }}>{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={event => onChange(event.target.value)}
        className="w-full resize-y rounded-lg px-3 py-2 text-xs leading-6 outline-none"
        style={{ color: 'var(--t-text, var(--tx-1))', background: 'var(--t-bg, var(--bg-0))', border: '1px solid var(--t-border, var(--bdr))' }}
      />
    </label>
  );
}

function ActionButton({ children, onClick, disabled, active = false, danger = false }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[10px] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        color: danger ? '#c05b50' : active ? 'var(--t-gold, var(--ac-dim))' : 'var(--t-text2, var(--tx-2))',
        border: `1px solid ${danger ? 'rgba(192,91,80,.28)' : active ? 'rgba(212,168,67,.32)' : 'var(--t-border, var(--bdr))'}`,
        background: active ? 'rgba(212,168,67,.07)' : 'transparent',
      }}
    >{children}</button>
  );
}

function StatusBadge({ status, loading }: { status?: ReportReviewStatus; loading: boolean }) {
  const label = loading ? '读取中' : status === 'confirmed' ? '已确认' : status === 'needs_revision' ? '待调整' : status === 'draft' ? '修订中' : '未确认';
  const color = status === 'confirmed' ? '#2f9e78' : status === 'needs_revision' ? '#c05b50' : 'var(--t-faint, var(--tx-3))';
  return <span className="rounded-full px-2 py-0.5 text-[9px]" style={{ color, border: `1px solid color-mix(in srgb, ${color} 28%, transparent)` }}>{label}</span>;
}

function cloneEditableContent(content: ReportEditableContent): ReportEditableContent {
  return JSON.parse(JSON.stringify(content)) as ReportEditableContent;
}

function splitLines(value: string): string[] {
  return value.split('\n').map(item => item.trim()).filter(Boolean);
}
