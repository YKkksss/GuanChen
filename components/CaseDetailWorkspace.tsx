'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CaseConfidence, CaseConsentScope, CaseRecord, CaseStatus } from '@/lib/cases/types';
import { LIFE_EVENT_CATEGORY_LABELS } from '@/lib/events/types';
import { ScopeBadge, StatusBadge } from './CaseLibraryWorkspace';

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

export default function CaseDetailWorkspace({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [record, setRecord] = useState<CaseRecord | null>(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/cases/${caseId}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as { case?: CaseRecord; error?: string };
      if (!response.ok || !data.case) throw new Error(data.error || '案例加载失败');
      setRecord(data.case);
      setTitle(data.case.title);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '案例加载失败');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { void load(); }, [load]);

  async function updateCase(input: { title?: string; status?: CaseStatus; confidence?: CaseConfidence }) {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/cases/${caseId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      const data = await response.json().catch(() => ({})) as { case?: CaseRecord; error?: string };
      if (!response.ok || !data.case) throw new Error(data.error || '案例更新失败');
      setRecord(data.case);
      setTitle(data.case.title);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : '案例更新失败');
    } finally {
      setSaving(false);
    }
  }

  async function updateConsent(scope: CaseConsentScope, active: boolean) {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/cases/${caseId}/consent`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, active }),
      });
      const data = await response.json().catch(() => ({})) as { case?: CaseRecord; error?: string };
      if (!response.ok || !data.case) throw new Error(data.error || '授权更新失败');
      setRecord(data.case);
    } catch (consentError) {
      setError(consentError instanceof Error ? consentError.message : '授权更新失败');
    } finally {
      setSaving(false);
    }
  }

  async function exportCase() {
    setError('');
    try {
      const response = await fetch(`/api/cases/${caseId}/export`, { cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || '导出失败');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${record?.caseCode ?? 'anonymous-case'}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      await load();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '导出失败');
    }
  }

  async function deleteCase() {
    if (!record || !window.confirm(`确认永久删除 ${record.caseCode}？此操作会同时删除该案例的授权和审计记录，但不会删除原始命盘。`)) return;
    const response = await fetch(`/api/cases/${caseId}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseCode: record.caseCode }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      setError(data.error || '删除失败');
      return;
    }
    router.push('/cases');
  }

  if (loading) return <PageState text="正在恢复匿名案例…" />;
  if (!record) return <PageState text={error || '案例不存在'} error />;

  const activeScopes = record.consents.filter(item => item.status === 'active').map(item => item.scope);
  const canExport = record.status === 'reviewed' && activeScopes.includes('anonymous_export');
  const canTeach = record.status === 'reviewed' && activeScopes.includes('teaching');

  return (
    <main className="case-form mx-auto min-h-screen max-w-[1180px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/cases" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回案例库</Link>
          <div className="mt-5 font-mono text-[10px] tracking-[.2em]" style={{ color: 'var(--t-gold)' }}>{record.caseCode}</div>
          <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>{record.title}</h1><StatusBadge status={record.status} /></div>
          <div className="mt-3 flex flex-wrap gap-2">{activeScopes.map(scope => <ScopeBadge key={scope} scope={scope} />)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canTeach && <Link href={`/cases/${caseId}/study`} className="rounded-lg px-4 py-2.5 text-xs" style={{ color: '#fffaf3', background: 'var(--ac)' }}>打开教学详情</Link>}
          {record.sourceConversationId && <Link href={`/chart/${record.sourceConversationId}`} className="rounded-lg px-4 py-2.5 text-xs" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>查看本地来源命盘</Link>}
          <button type="button" onClick={exportCase} disabled={!canExport} title={!canExport ? '需要“已复核”状态和有效的匿名导出授权' : undefined} className="rounded-lg px-4 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-40" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}>导出匿名 JSON</button>
        </div>
      </header>

      {error && <div className="mb-5 rounded-lg px-4 py-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>{error}</div>}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <article className="rounded-2xl card-glass p-5 sm:p-6">
            <SectionHeader title="匿名命盘结构" subtitle={`脱敏版本 ${record.anonymizationVersion}`} />
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Metric label="五行局" value={record.chartSnapshot.wuxingJuName} />
              <Metric label="命宫" value={`${BRANCHES[record.chartSnapshot.mingGongBranch]}宫`} />
              <Metric label="身宫" value={`${BRANCHES[record.chartSnapshot.shenGongBranch]}宫`} />
              <Metric label="当前年龄段" value={record.chartSnapshot.profile.currentAgeBand} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {record.chartSnapshot.palaces.map(palace => (
                <div key={palace.branch} className="rounded-xl p-4" style={{ border: '1px solid var(--t-border)' }}>
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium" style={{ color: 'var(--t-text)' }}>{palace.name}</span><span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{BRANCHES[palace.branch]}宫</span></div>
                  <div className="mt-2 text-[10px] leading-5" style={{ color: 'var(--t-text2)' }}>{palace.stars.length ? palace.stars.map(star => `${star.name}${star.siHua ? `化${star.siHua}` : ''}`).join(' · ') : '空宫'}</div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl card-glass p-5 sm:p-6">
            <SectionHeader title="已概括事件" subtitle="不保存标题、描述、精确日期或自定义类别文字" />
            {!record.events.length ? <div className="mt-5 text-xs" style={{ color: 'var(--t-faint)' }}>来源命盘没有已确认事件，因此本案例未包含事件快照。</div> : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {record.events.map(event => <div key={event.id} className="rounded-xl p-4" style={{ border: '1px solid var(--t-border)' }}><div className="flex items-center justify-between"><span className="text-xs" style={{ color: 'var(--t-text)' }}>{LIFE_EVENT_CATEGORY_LABELS[event.category]}</span><span className="text-[9px]" style={{ color: 'var(--t-gold)' }}>影响 {event.impactLevel}/5</span></div><div className="mt-2 text-[10px]" style={{ color: 'var(--t-faint)' }}>{event.ageBand ?? '年龄段未知'} · {event.datePrecision === 'range' ? '跨年区间' : event.datePrecision === 'year' ? '已概括至年份层级' : '时间未知'}</div></div>)}
              </div>
            )}
          </article>

          <article className="rounded-2xl card-glass p-5 sm:p-6">
            <SectionHeader title="操作记录" subtitle="用于确认案例何时创建、复核、授权、撤销或导出" />
            <div className="mt-5 space-y-3">{record.auditLogs.map(log => <div key={log.id} className="flex items-center justify-between gap-4 border-b pb-3 text-[10px] last:border-0 last:pb-0" style={{ borderColor: 'var(--t-border)', color: 'var(--t-text2)' }}><span>{auditLabel(log.action)}</span><time style={{ color: 'var(--t-faint)' }}>{new Date(log.createdAt).toLocaleString('zh-CN')}</time></div>)}</div>
          </article>
        </div>

        <aside className="space-y-5">
          <article className="rounded-2xl card-glass p-5">
            <SectionHeader title="案例管理" subtitle="复核前请再次确认标题不含真实身份信息" />
            <label className="mt-5 block text-[10px]" style={{ color: 'var(--t-faint)' }}>匿名标题<input value={title} onChange={event => setTitle(event.target.value)} maxLength={60} className="mt-2 w-full rounded-lg px-3 py-2.5 text-xs outline-none" style={{ color: 'var(--t-text)', background: 'var(--t-card)', border: '1px solid var(--t-border)' }} /></label>
            <button type="button" onClick={() => updateCase({ title })} disabled={saving || title.trim() === record.title} className="mt-3 w-full rounded-lg px-4 py-2.5 text-xs disabled:opacity-40" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>保存标题</button>
            <label className="mt-4 block text-[10px]" style={{ color: 'var(--t-faint)' }}>资料可信度<select value={record.confidence} onChange={event => updateCase({ confidence: event.target.value as CaseConfidence })} disabled={saving} className="mt-2 w-full rounded-lg px-3 py-2.5 text-xs outline-none" style={{ color: 'var(--t-text)', background: 'var(--t-card)', border: '1px solid var(--t-border)' }}><option value="low">较低</option><option value="medium">中等</option><option value="high">较高</option></select></label>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => updateCase({ status: record.status === 'reviewed' ? 'draft' : 'reviewed' })} disabled={saving || record.status === 'archived'} className="rounded-lg px-3 py-2.5 text-[10px] disabled:opacity-40" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)' }}>{record.status === 'reviewed' ? '退回待复核' : '标记为已复核'}</button>
              <button type="button" onClick={() => updateCase({ status: record.status === 'archived' ? 'draft' : 'archived' })} disabled={saving} className="rounded-lg px-3 py-2.5 text-[10px] disabled:opacity-40" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>{record.status === 'archived' ? '恢复案例' : '归档案例'}</button>
            </div>
          </article>

          <article className="rounded-2xl card-glass p-5">
            <SectionHeader title="用途授权" subtitle="授权按用途分别记录，撤销立即生效" />
            <div className="mt-4 space-y-3">
              <ConsentToggle title="仅本地保存" description="案例存在所必需" checked disabled />
              <ConsentToggle title="本地教学使用" description="用于后续案例教学与对比" checked={activeScopes.includes('teaching')} disabled={saving} onChange={active => updateConsent('teaching', active)} />
              <ConsentToggle title="匿名 JSON 导出" description="还需要案例通过复核" checked={activeScopes.includes('anonymous_export')} disabled={saving} onChange={active => updateConsent('anonymous_export', active)} />
              <ConsentToggle title="公开发布" description="M7-0 暂不提供" checked={false} disabled />
            </div>
          </article>

          <article className="rounded-2xl p-5" style={{ border: '1px solid rgba(239,68,68,.22)' }}>
            <h2 className="text-xs font-semibold text-red-500">删除本地案例</h2>
            <p className="mt-2 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>删除会清除匿名快照、授权和审计记录，不影响来源命盘。</p>
            <button type="button" onClick={deleteCase} className="mt-4 w-full rounded-lg px-4 py-2.5 text-[10px] text-red-500" style={{ border: '1px solid rgba(239,68,68,.3)' }}>永久删除此案例</button>
          </article>
        </aside>
      </section>
    </main>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>{title}</h2><p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>{subtitle}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl p-4 text-center" style={{ background: 'var(--ac-bg)', border: '1px solid var(--t-border)' }}><div className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{label}</div><div className="mt-1 text-xs" style={{ color: 'var(--t-text)' }}>{value}</div></div>; }
function ConsentToggle({ title, description, checked, disabled = false, onChange }: { title: string; description: string; checked: boolean; disabled?: boolean; onChange?: (active: boolean) => void }) { return <label className="flex items-start gap-3 rounded-lg p-3" style={{ border: '1px solid var(--t-border)', opacity: disabled && !checked ? .5 : 1 }}><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange?.(event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-700" /><span><span className="block text-[11px]" style={{ color: 'var(--t-text)' }}>{title}</span><span className="mt-1 block text-[9px]" style={{ color: 'var(--t-faint)' }}>{description}</span></span></label>; }
function auditLabel(action: string) { const labels: Record<string, string> = { created: '创建匿名案例', updated: '更新案例状态或信息', consent_granted: '新增用途授权', consent_revoked: '撤销用途授权', exported: '导出匿名 JSON' }; return labels[action] ?? action; }
function PageState({ text, error = false }: { text: string; error?: boolean }) { return <main className="mx-auto min-h-screen max-w-[900px] px-5 py-20"><div className="rounded-xl card-glass px-5 py-20 text-center text-sm" style={{ color: error ? '#ef4444' : 'var(--t-faint)' }}>{text}</div></main>; }
