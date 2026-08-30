'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import ConversationHistory from '@/components/ConversationHistory';
import HemingWorkbench from '@/components/HemingWorkbench';
import { formToBirthInfo } from '@/lib/ziwei/share';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import type { Conversation, ConversationMessage } from '@/lib/conversations/types';
import {
  HEMING_METHODOLOGY,
  getRelationshipDefinition,
  type HemingRelationshipContext,
  type RelationshipType,
} from '@/lib/heming';

interface HemingWorkspaceProps { conversationId?: string }

export default function HemingWorkspace({ conversationId }: HemingWorkspaceProps) {
  const router = useRouter();
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(Boolean(conversationId));
  const [loadError, setLoadError] = useState('');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [relationshipType, setRelationshipType] = useState<RelationshipType>('romantic');
  const [mainConcern, setMainConcern] = useState('');
  const [customRelationshipLabel, setCustomRelationshipLabel] = useState('');
  const [formA, setFormA] = useState<BirthFormState | null>(null);
  const [formB, setFormB] = useState<BirthFormState | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) { setLoadingConversation(false); return; }
    let cancelled = false;
    setLoadingConversation(true);
    setLoadError('');
    fetch(`/api/conversations/${conversationId}`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 404 ? '合盘记录不存在或已删除' : '合盘记录加载失败');
        return response.json() as Promise<{ conversation: Conversation; messages: ConversationMessage[] }>;
      })
      .then(data => {
        if (cancelled) return;
        if (data.conversation.type !== 'heming' || !data.conversation.chartSnapshotA || !data.conversation.chartSnapshotB) throw new Error('这条记录不是有效的合盘会话');
        setConversation(data.conversation);
        setMessages(data.messages);
      })
      .catch(error => { if (!cancelled) setLoadError(error instanceof Error ? error.message : '合盘记录加载失败'); })
      .finally(() => { if (!cancelled) setLoadingConversation(false); });
    return () => { cancelled = true; };
  }, [conversationId]);

  const generateChart = useCallback(async (info: BirthInfo): Promise<ZiweiChart | null> => {
    try {
      const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(info) });
      return response.ok ? await response.json() as ZiweiChart : null;
    } catch { return null; }
  }, []);

  const isFormReady = (form: BirthFormState | null): boolean => Boolean(form && form.year && form.month && form.day && form.gender && (form.unknownTime || (form.clockHour !== '' && form.clockMinute !== '')));

  const createHemingConversation = useCallback(async () => {
    setFormError(null);
    if (!isFormReady(formA) || !isFormReady(formB)) { setFormError('请先填写双方完整出生信息'); return; }
    if (relationshipType === 'custom' && !customRelationshipLabel.trim()) { setFormError('请填写自定义关系名称'); return; }
    setCreating(true);
    try {
      const birthInfoA = formToBirthInfo(formA!);
      const birthInfoB = formToBirthInfo(formB!);
      const [chartSnapshotA, chartSnapshotB] = await Promise.all([generateChart(birthInfoA), generateChart(birthInfoB)]);
      if (!chartSnapshotA || !chartSnapshotB) throw new Error('双方命盘生成失败，请稍后重试');
      const definition = getRelationshipDefinition(relationshipType);
      const relationshipContext: HemingRelationshipContext = {
        ownerARole: definition.roles[0].label, ownerBRole: definition.roles[1].label,
        customRelationshipLabel: relationshipType === 'custom' ? customRelationshipLabel.trim() : null,
        mainConcern: mainConcern.trim() || null, confirmedFacts: {},
      };
      const response = await fetch('/api/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'heming', birthInfoA, birthInfoB, chartSnapshotA, chartSnapshotB, relationshipType, relationshipContext }),
      });
      const data = await response.json() as { conversation?: Conversation; error?: string };
      if (!response.ok || !data.conversation) throw new Error(data.error || '合盘记录保存失败');
      window.dispatchEvent(new Event('conversation-updated'));
      router.push(`/heming/${data.conversation.id}`);
    } catch (error) { setFormError(error instanceof Error ? error.message : '合盘记录创建失败'); }
    finally { setCreating(false); }
  }, [customRelationshipLabel, formA, formB, generateChart, mainConcern, relationshipType, router]);

  const cardStyle = {
    background: 'rgba(255,253,248,0.78)',
    border: '1px solid rgba(121,91,61,0.17)',
    borderRadius: '7px', padding: '24px',
  };
  const labelStyle = { fontSize: '10px', letterSpacing: '0.4em', color: 'var(--ac)', opacity: 0.7, marginBottom: '16px', display: 'block' };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-0)' }}>
      <header style={{ position: 'relative', zIndex: 20, background: 'rgba(255,253,248,.5)', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', padding: '0 24px', height: '52px', gap: '16px' }}>
        <button onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--tx-3)', background: 'none', border: 'none', cursor: 'pointer' }}><span style={{ fontSize: '16px' }}>‹</span><span>返回</span></button>
        <div style={{ width: '1px', height: '20px', background: 'var(--bdr-med)' }} />
        <span style={{ fontSize: '12px', color: 'var(--ac)', letterSpacing: '0.2em' }}>合盘分析</span><div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'var(--tx-3)' }}>双盘隔离 · 规则可追溯 · 对话可恢复</span>
      </header>

      <div className={`heming-shell ${historyCollapsed ? 'history-collapsed' : ''}`} style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px 20px 72px' }}>
        <ConversationHistory conversationType="heming" activeConversationId={conversationId} collapsed={historyCollapsed} onToggle={() => setHistoryCollapsed(value => !value)} />
        <main style={{ minWidth: 0 }}>
          {!conversationId && (
            <>
              <div className="mb-7 text-center"><div className="mb-2 text-[10px] tracking-[.34em]" style={{ color: 'var(--ac)' }}>关系命理研析</div><h1 className="mb-2 text-[28px] font-semibold tracking-[.15em]" style={{ color: 'var(--tx-0)' }}>紫微合盘</h1><p className="text-[13px]" style={{ color: 'var(--tx-3)' }}>洞察关系本质，明了情缘方向</p></div>
              <div style={{ ...cardStyle, marginBottom: '20px' }}>
                <span style={labelStyle}>关系背景</span>
                <div className="heming-relation-grid">
                  <label className="text-xs" style={{ color: 'var(--tx-2)' }}>关系类型<select className="input-base mt-2 block w-full" value={relationshipType} onChange={event => setRelationshipType(event.target.value as RelationshipType)}>{HEMING_METHODOLOGY.relationships.map(item => <option key={item.type} value={item.type}>{item.label}</option>)}</select></label>
                  <label className="text-xs" style={{ color: 'var(--tx-2)' }}>当前最关注的问题（可选）<input className="input-base mt-2 block w-full" value={mainConcern} maxLength={300} onChange={event => setMainConcern(event.target.value)} placeholder="例如：沟通冲突、合作分工、亲子互动" /></label>
                </div>
                {relationshipType === 'custom' && <label className="mt-3.5 block text-xs" style={{ color: 'var(--tx-2)' }}>自定义关系名称<input className="input-base mt-2 block w-full" value={customRelationshipLabel} maxLength={40} onChange={event => setCustomRelationshipLabel(event.target.value)} placeholder="例如：师生、长期室友" /></label>}
              </div>
              <div className="heming-grid mb-5 grid grid-cols-2 gap-5">
                <div style={cardStyle}><span style={labelStyle}>{getRelationshipDefinition(relationshipType).roles[0].label} · A</span><BirthForm hideSubmit onSubmit={() => {}} onFormSave={setFormA} /></div>
                <div style={cardStyle}><span style={labelStyle}>{getRelationshipDefinition(relationshipType).roles[1].label} · B</span><BirthForm hideSubmit onSubmit={() => {}} onFormSave={setFormB} /></div>
              </div>
              <div className="rounded-2xl p-7 text-center" style={cardStyle}>
                <p className="mb-5 text-[12px] leading-relaxed" style={{ color: 'var(--tx-3)' }}>创建时会固化双方命盘快照。之后刷新页面、退出再进入，都能恢复规则评估与完整聊天记录。</p>
                <button onClick={() => void createHemingConversation()} disabled={creating} className="rounded px-10 py-3.5 text-sm font-semibold tracking-[.15em] disabled:opacity-50" style={{ border: 'none', background: '#b42b22', color: '#fffaf3' }}>{creating ? '正在生成并保存…' : '创建并保存合盘'}</button>
                {formError && <div className="mt-4 text-[13px] text-red-600">{formError}</div>}
              </div>
            </>
          )}

          {loadingConversation && <div className="rounded-xl p-8 text-center card-glass" style={{ color: 'var(--tx-3)' }}>正在恢复合盘工作台…</div>}
          {loadError && <div className="rounded-xl p-8 text-center card-glass" style={{ color: '#dc2626' }}>{loadError}<div><button onClick={() => router.push('/heming')} className="mt-4" style={{ color: 'var(--ac)' }}>新建合盘</button></div></div>}
          {conversation && <HemingWorkbench conversation={conversation} initialMessages={messages} onConversationUpdated={setConversation} />}
        </main>
      </div>

      <style>{`
        .heming-shell { display:grid; grid-template-columns:260px minmax(0,1fr); gap:20px; transition:grid-template-columns .2s ease; }
        .heming-shell.history-collapsed { grid-template-columns:56px minmax(0,1fr); }
        .heming-relation-grid { display:grid; grid-template-columns:minmax(180px,.55fr) minmax(260px,1.45fr); gap:14px; }
        @media (max-width:1100px) { .heming-shell,.heming-shell.history-collapsed { grid-template-columns:1fr; } }
        @media (max-width:680px) { .heming-grid,.heming-relation-grid { grid-template-columns:1fr !important; } .heming-shell { padding-left:12px !important; padding-right:12px !important; } }
      `}</style>
    </div>
  );
}
