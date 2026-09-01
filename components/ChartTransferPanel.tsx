'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowSquareOut,
  CheckCircle,
  DownloadSimple,
  FileArrowUp,
  ShieldCheck,
  SpinnerGap,
  WarningCircle,
} from '@phosphor-icons/react';
import type { ConversationListItem } from '@/lib/conversations/types';
import { CHART_IMPORT_CONFIRMATION } from '@/lib/chart-transfer/types';
import type {
  ChartPackageContentSummary,
  ChartPackageImportResult,
  ChartPackagePreview,
} from '@/lib/chart-transfer/types';

export default function ChartTransferPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ChartPackagePreview | null>(null);
  const [title, setTitle] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState<'loading' | 'exporting' | 'inspecting' | 'importing' | ''>('loading');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ChartPackageImportResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch('/api/conversations?type=chart&limit=100', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { conversations?: ConversationListItem[]; error?: string };
        if (!response.ok) throw new Error(data.error || '命盘列表加载失败');
        if (!active) return;
        const items = data.conversations ?? [];
        setConversations(items);
        setConversationId(items[0]?.id ?? '');
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : '命盘列表加载失败');
      })
      .finally(() => { if (active) setBusy(''); });
    return () => { active = false; controller.abort(); };
  }, []);

  async function exportChart() {
    if (!conversationId) return;
    setBusy('exporting');
    setError('');
    try {
      const response = await fetch(`/api/chart-packages/export?conversationId=${encodeURIComponent(conversationId)}`, { cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || '单命盘导出失败');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = downloadName(response.headers.get('content-disposition'));
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '单命盘导出失败');
    } finally {
      setBusy('');
    }
  }

  async function inspectFile(selected: File | null) {
    setFile(selected);
    setPreview(null);
    setTitle('');
    setConfirmation('');
    setResult(null);
    setError('');
    if (!selected) return;
    setBusy('inspecting');
    try {
      const form = new FormData();
      form.set('chartPackage', selected);
      const response = await fetch('/api/chart-packages/inspect', { method: 'POST', body: form });
      const data = await response.json() as { preview?: ChartPackagePreview; error?: string };
      if (!response.ok || !data.preview) throw new Error(data.error || '单命盘数据包预检失败');
      setPreview(data.preview);
      setTitle(data.preview.suggestedTitle);
    } catch (inspectError) {
      setError(inspectError instanceof Error ? inspectError.message : '单命盘数据包预检失败');
    } finally {
      setBusy('');
    }
  }

  async function importChart() {
    if (!file || !preview?.compatible || confirmation !== CHART_IMPORT_CONFIRMATION) return;
    setBusy('importing');
    setError('');
    setResult(null);
    try {
      const form = new FormData();
      form.set('chartPackage', file);
      form.set('title', title);
      form.set('confirmation', confirmation);
      const response = await fetch('/api/chart-packages/import', { method: 'POST', body: form });
      const data = await response.json() as { result?: ChartPackageImportResult; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || '单命盘数据包导入失败');
      setResult(data.result);
      setFile(null);
      setPreview(null);
      setConfirmation('');
      if (inputRef.current) inputRef.current.value = '';
      window.dispatchEvent(new Event('conversation-updated'));
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '单命盘数据包导入失败');
    } finally {
      setBusy('');
    }
  }

  return <section className="space-y-5">
    {error && <div className="flex items-start gap-2 rounded-xl p-4 text-xs leading-6 text-red-500" style={{ border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.05)' }}><WarningCircle className="mt-1 shrink-0" size={16} />{error}</div>}
    {result && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 text-xs leading-6 text-green-500" style={{ border: '1px solid rgba(34,197,94,.3)', background: 'rgba(34,197,94,.05)' }}><span className="flex items-start gap-2"><CheckCircle className="mt-1 shrink-0" size={16} />“{result.title}”已作为新命盘导入，共写入 {result.importedRows} 条关联记录并重新映射 {result.remappedIds} 个编号。</span><Link href={`/chart/${result.conversationId}`} className="inline-flex items-center gap-1 underline underline-offset-4">打开命盘 <ArrowSquareOut size={13} /></Link></div>}

    <div className="grid gap-5 lg:grid-cols-2">
      <article className="card-glass rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3"><DownloadSimple size={21} style={{ color: 'var(--t-gold)' }} /><div><h2 className="text-base font-semibold" style={{ color: 'var(--t-text)' }}>导出一份命盘</h2><p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>生成透明可检查的 JSON 数据包，适合把命盘复制到另一台本地部署设备。</p></div></div>
        <label className="mt-6 block text-[10px]" style={{ color: 'var(--t-text2)' }}>选择单人命盘
          <select value={conversationId} onChange={event => setConversationId(event.target.value)} disabled={busy === 'loading'} className="field-control mt-2">
            <option value="">请选择命盘</option>
            {conversations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        {!conversations.length && busy !== 'loading' && <p className="mt-3 text-[10px]" style={{ color: 'var(--t-faint)' }}>还没有可导出的单人命盘，请先完成一次起盘。</p>}
        <button type="button" onClick={() => void exportChart()} disabled={!conversationId || Boolean(busy)} className="btn-primary mt-5 w-full justify-center !py-3 disabled:opacity-40">{busy === 'exporting' ? <SpinnerGap className="animate-spin" size={15} /> : <DownloadSimple size={15} />}{busy === 'exporting' ? '正在整理关联数据…' : '导出 .ziweichart.json'}</button>
        <div className="mt-6 rounded-xl p-4" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}><div className="flex items-center gap-2 text-[10px] font-medium" style={{ color: '#22c55e' }}><ShieldCheck size={14} />导出边界</div><ul className="mt-3 space-y-2 text-[9px] leading-5" style={{ color: 'var(--t-faint)' }}><li>包含聊天、记忆、运限、事件、报告、学习笔记、提醒和复盘。</li><li>不包含匿名案例、校时工程、派生八字档案和可重建 PDF。</li><li>文件含个人出生资料和对话内容，请自行妥善保管。</li></ul></div>
      </article>

      <article className="card-glass rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3"><FileArrowUp size={21} style={{ color: 'var(--t-gold)' }} /><div><h2 className="text-base font-semibold" style={{ color: 'var(--t-text)' }}>预检并导入副本</h2><p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>不覆盖现有命盘；即使原编号冲突，也会为全部记录生成新编号并保持内部关联。</p></div></div>
        <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-7 text-center" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--ac-bg)' }}>
          {busy === 'inspecting' ? <SpinnerGap className="animate-spin" size={25} style={{ color: 'var(--t-gold)' }} /> : <FileArrowUp size={25} style={{ color: 'var(--t-gold)' }} />}
          <strong className="mt-3 text-xs" style={{ color: 'var(--t-text)' }}>{file?.name || '选择 .ziweichart.json 文件'}</strong>
          <span className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>{file ? formatBytes(file.size) : '最大 64 MB，选择后先执行只读预检'}</span>
          <input ref={inputRef} type="file" accept=".json,.ziweichart.json,application/json" className="sr-only" disabled={Boolean(busy)} onChange={event => void inspectFile(event.target.files?.[0] ?? null)} />
        </label>
        {preview && <ChartPackagePreviewCard preview={preview} title={title} confirmation={confirmation} onTitle={setTitle} onConfirmation={setConfirmation} onImport={() => void importChart()} importing={busy === 'importing'} />}
      </article>
    </div>
  </section>;
}

function ChartPackagePreviewCard({ preview, title, confirmation, onTitle, onConfirmation, onImport, importing }: { preview: ChartPackagePreview; title: string; confirmation: string; onTitle: (value: string) => void; onConfirmation: (value: string) => void; onImport: () => void; importing: boolean }) {
  return <section className="mt-5 rounded-2xl p-4" style={{ border: `1px solid ${preview.compatible ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.35)'}`, background: preview.compatible ? 'rgba(34,197,94,.05)' : 'rgba(239,68,68,.05)' }}>
    <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: preview.compatible ? '#22c55e' : '#ef4444' }}>{preview.compatible ? <CheckCircle size={15} /> : <WarningCircle size={15} />}{preview.compatible ? '预检通过：将创建独立副本' : '数据库版本不兼容，已阻止导入'}</div>
    <dl className="mt-4 grid grid-cols-2 gap-3 text-[10px]"><Info label="来源命盘" value={preview.sourceTitle} /><Info label="数据包时间" value={formatDate(preview.createdAt)} /><Info label="关联记录" value={`${preview.totalRows} 条 / ${preview.tableCount} 张表`} /><Info label="原编号冲突" value={`${preview.idConflictCount} 条，全部自动重映射`} /><Info label="数据库版本" value={`v${preview.schemaVersion} / 当前 v${preview.currentSchemaVersion}`} /><Info label="指纹" value={preview.fingerprint} /></dl>
    <TransferContent content={preview.content} />
    {preview.compatible && <div className="mt-5 space-y-4 border-t pt-5" style={{ borderColor: 'var(--t-border)' }}><label className="block text-[10px]" style={{ color: 'var(--t-text2)' }}>新命盘名称<input className="field-control mt-2" maxLength={80} value={title} onChange={event => onTitle(event.target.value)} /></label><label className="block text-[10px] leading-5" style={{ color: 'var(--t-text2)' }}>请输入“{CHART_IMPORT_CONFIRMATION}”确认<input className="field-control mt-2" autoComplete="off" value={confirmation} onChange={event => onConfirmation(event.target.value)} /></label><button type="button" onClick={onImport} disabled={importing || !title.trim() || confirmation !== CHART_IMPORT_CONFIRMATION} className="btn-primary w-full justify-center !py-3 disabled:opacity-40">{importing ? <SpinnerGap className="animate-spin" size={15} /> : <FileArrowUp size={15} />}{importing ? '正在映射编号并写入…' : '导入为全新命盘副本'}</button></div>}
  </section>;
}

function TransferContent({ content }: { content: ChartPackageContentSummary }) {
  const values = [['消息上下文', content.messages], ['长期记忆', content.memories], ['运限记录', content.transitRecords], ['事件资料', content.events], ['报告版本', content.reports], ['学习资料', content.learningRecords], ['提醒', content.reminders], ['月度复盘', content.monthlyReviews]];
  return <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{values.map(([label, value]) => <div key={label} className="rounded-lg px-2.5 py-2" style={{ border: '1px solid var(--t-border)' }}><strong className="text-sm" style={{ color: 'var(--t-text)' }}>{value}</strong><span className="mt-1 block text-[8px]" style={{ color: 'var(--t-faint)' }}>{label}</span></div>)}</div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><dt style={{ color: 'var(--t-faint)' }}>{label}</dt><dd className="mt-1 break-all" style={{ color: 'var(--t-text2)' }}>{value}</dd></div>; }
function downloadName(disposition: string | null): string { const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]; try { return encoded ? decodeURIComponent(encoded) : '紫微命盘.ziweichart.json'; } catch { return '紫微命盘.ziweichart.json'; } }
function formatBytes(value: number): string { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB`; }
function formatDate(value: string): string { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
