'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowClockwise, CalendarDots, CaretDown, CaretUp, CheckCircle, FileText, WarningCircle } from '@phosphor-icons/react';
import type { Conversation, ConversationMessage } from '@/lib/conversations/types';
import {
  HEMING_METHODOLOGY,
  getRelationshipDefinition,
  type HemingEvaluationResult,
  type HemingPalaceFact,
  type HemingRelationshipContext,
  type RelationshipType,
} from '@/lib/heming';
import HemingChatPanel from './HemingChatPanel';

interface HemingWorkbenchProps {
  conversation: Conversation;
  initialMessages: ConversationMessage[];
  onConversationUpdated: (conversation: Conversation) => void;
}

const FIELD_LABELS: Record<string, string> = {
  observed_communication_pattern: '实际沟通模式', relationship_stage: '当前关系阶段',
  relationship_status: '关系状态', relationship_duration: '相处时长', observed_emotional_needs: '已观察到的情绪需求',
  living_arrangement: '居住安排', financial_arrangement: '财务安排', planned_roles: '计划分工', decision_process: '决策方式',
  equity_plan: '股权方案', budget_authority: '预算权限', exit_mechanism: '退出机制', team_size: '团队规模', customer_type: '客户类型',
  child_age: '子女年龄', caregiving_arrangement: '照顾安排', current_growth_challenge: '当前成长课题', reporting_line: '汇报关系',
  feedback_process: '反馈方式', role_scope: '职责范围', decision_authority: '决策权限', friendship_duration: '相识时长',
  resource_exchange: '资源往来', shared_activities: '共同活动', custom_relationship_label: '关系名称', owner_a_role: '甲方角色', owner_b_role: '乙方角色',
};

const LEVEL_STYLE = {
  supportive: { label: '支持性', color: '#4f9a72' }, mixed: { label: '双向影响', color: '#b98734' },
  challenging: { label: '需要经营', color: '#c56d5c' }, observe: { label: '重点观察', color: '#718eb5' },
  insufficient: { label: '信息不足', color: '#8a8590' },
} as const;

function PalaceColumn({ role, facts }: { role: string; facts: HemingPalaceFact[] }) {
  return (
    <div className="min-w-0 rounded-xl p-3.5" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
      <div className="mb-3 text-[10px] font-medium tracking-[0.18em]" style={{ color: 'var(--t-gold)' }}>{role}</div>
      <div className="space-y-2">
        {facts.map(fact => {
          const stars = fact.stars.filter(star => star.type === 'major').map(star => `${star.name}${star.siHua ? `化${star.siHua}` : ''}`);
          return (
            <div key={fact.palace} className="rounded-lg px-3 py-2" style={{ border: '1px solid var(--t-border)' }}>
              <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-medium" style={{ color: 'var(--t-text)' }}>{fact.palace}</span><span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{fact.branch}</span></div>
              <div className="mt-1 text-[10px] leading-relaxed" style={{ color: 'var(--t-text2)' }}>{stars.length ? stars.join(' · ') : '主星空宫（仅作结构提示）'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HemingWorkbench({ conversation, initialMessages, onConversationUpdated }: HemingWorkbenchProps) {
  const router = useRouter();
  const [evaluation, setEvaluation] = useState<HemingEvaluationResult | null>(null);
  const [evaluationError, setEvaluationError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedDimension, setSelectedDimension] = useState('');
  const [relationshipType, setRelationshipType] = useState<RelationshipType>(conversation.relationshipType ?? 'custom');
  const [context, setContext] = useState<HemingRelationshipContext>(conversation.relationshipContext ?? {
    ownerARole: '甲方', ownerBRole: '乙方', customRelationshipLabel: null, mainConcern: null, confirmedFacts: {},
  });

  const definition = useMemo(() => getRelationshipDefinition(relationshipType), [relationshipType]);
  const realityFields = useMemo(() => Array.from(new Set([
    ...definition.requiredRealityContext,
    ...definition.dimensions.flatMap(dimension => dimension.requiredContextFields),
  ])).filter(field => !['main_concern', 'custom_relationship_label', 'owner_a_role', 'owner_b_role'].includes(field)), [definition]);

  const loadEvaluation = useCallback(async () => {
    setLoading(true);
    setEvaluationError('');
    try {
      const response = await fetch(`/api/conversations/${conversation.id}/heming-evaluation`, { cache: 'no-store' });
      const payload = await response.json() as { evaluation?: HemingEvaluationResult; error?: string };
      if (!response.ok || !payload.evaluation) throw new Error(payload.error || '规则评估加载失败');
      setEvaluation(payload.evaluation);
      setSelectedDimension(current => payload.evaluation?.dimensions.some(item => item.dimensionId === current)
        ? current
        : payload.evaluation?.dimensions[0]?.dimensionId ?? '');
    } catch (error) {
      setEvaluationError(error instanceof Error ? error.message : '规则评估加载失败');
    } finally {
      setLoading(false);
    }
  }, [conversation.id]);

  useEffect(() => { void loadEvaluation(); }, [loadEvaluation]);

  function changeRelationshipType(nextType: RelationshipType) {
    const nextDefinition = getRelationshipDefinition(nextType);
    setRelationshipType(nextType);
    setContext(previous => ({
      ownerARole: nextDefinition.roles[0].label,
      ownerBRole: nextDefinition.roles[1].label,
      customRelationshipLabel: nextType === 'custom' ? previous.customRelationshipLabel : null,
      mainConcern: previous.mainConcern,
      confirmedFacts: {},
    }));
    setSaved(false);
  }

  async function saveRelationshipContext() {
    if (!context.ownerARole.trim() || !context.ownerBRole.trim()) return;
    if (relationshipType === 'custom' && !context.customRelationshipLabel?.trim()) return;
    setSaving(true);
    setSaved(false);
    setEvaluationError('');
    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationshipType, relationshipContext: context }),
      });
      const payload = await response.json() as { conversation?: Conversation; error?: string };
      if (!response.ok || !payload.conversation) throw new Error(payload.error || '关系背景保存失败');
      onConversationUpdated(payload.conversation);
      setContext(payload.conversation.relationshipContext ?? context);
      setSaved(true);
      await loadEvaluation();
      window.dispatchEvent(new Event('conversation-updated'));
    } catch (error) {
      setEvaluationError(error instanceof Error ? error.message : '关系背景保存失败');
    } finally {
      setSaving(false);
    }
  }

  const activeDimension = evaluation?.dimensions.find(item => item.dimensionId === selectedDimension) ?? null;
  const activeDefinition = definition.dimensions.find(item => item.id === selectedDimension) ?? definition.dimensions[0];
  const factsA = activeDefinition && evaluation
    ? activeDefinition.ownerAPalaces.map(name => evaluation.facts.A.palaces[name]).filter(Boolean)
    : [];
  const factsB = activeDefinition && evaluation
    ? activeDefinition.ownerBPalaces.map(name => evaluation.facts.B.palaces[name]).filter(Boolean)
    : [];
  const activeResults = activeDimension ? [...activeDimension.baselineResults, ...activeDimension.stageResults] : [];

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-xl p-4 card-glass">
          <div className="flex items-start justify-between gap-3">
            <button type="button" onClick={() => setEditorOpen(value => !value)} className="flex min-w-0 flex-1 items-start justify-between gap-4 text-left">
              <div className="min-w-0"><div className="truncate text-sm font-semibold" style={{ color: 'var(--t-text)' }}>{conversation.title}</div><div className="mt-1 text-[10px]" style={{ color: 'var(--t-faint)' }}>{definition.label} · {context.ownerARole} / {context.ownerBRole}{context.mainConcern ? ` · 关注：${context.mainConcern}` : ''}</div></div>
              <span className="flex shrink-0 items-center gap-1 text-[10px]" style={{ color: 'var(--t-gold)' }}>关系背景 {editorOpen ? <CaretUp size={12} /> : <CaretDown size={12} />}</span>
            </button>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <button type="button" onClick={() => router.push(`/heming/${conversation.id}/timeline`)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px]" style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.28)' }}><CalendarDots size={13} />双人运限</button>
              <button type="button" onClick={() => router.push(`/heming/${conversation.id}/reports`)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px]" style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.28)' }}><FileText size={13} />合盘报告</button>
            </div>
          </div>
          {editorOpen && (
            <div className="mt-4 space-y-4 border-t pt-4" style={{ borderColor: 'var(--t-border)' }}>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-[10px]" style={{ color: 'var(--t-faint)' }}>关系类型<select className="input-base mt-1.5 block w-full" value={relationshipType} onChange={event => changeRelationshipType(event.target.value as RelationshipType)}>{HEMING_METHODOLOGY.relationships.map(item => <option key={item.type} value={item.type}>{item.label}</option>)}</select></label>
                <label className="text-[10px]" style={{ color: 'var(--t-faint)' }}>甲方角色<input className="input-base mt-1.5 block w-full" value={context.ownerARole} maxLength={30} onChange={event => setContext(previous => ({ ...previous, ownerARole: event.target.value }))} /></label>
                <label className="text-[10px]" style={{ color: 'var(--t-faint)' }}>乙方角色<input className="input-base mt-1.5 block w-full" value={context.ownerBRole} maxLength={30} onChange={event => setContext(previous => ({ ...previous, ownerBRole: event.target.value }))} /></label>
              </div>
              {relationshipType === 'custom' && <label className="block text-[10px]" style={{ color: 'var(--t-faint)' }}>自定义关系名称<input className="input-base mt-1.5 block w-full" value={context.customRelationshipLabel ?? ''} maxLength={40} onChange={event => setContext(previous => ({ ...previous, customRelationshipLabel: event.target.value }))} /></label>}
              <label className="block text-[10px]" style={{ color: 'var(--t-faint)' }}>当前最关注的问题<input className="input-base mt-1.5 block w-full" value={context.mainConcern ?? ''} maxLength={300} onChange={event => setContext(previous => ({ ...previous, mainConcern: event.target.value }))} placeholder="只记录用户明确确认的现实问题" /></label>
              <div>
                <div className="mb-2 text-[10px]" style={{ color: 'var(--t-faint)' }}>已确认的现实背景（留空表示未知，不会被系统猜测）</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {realityFields.map(field => <label key={field} className="text-[10px]" style={{ color: 'var(--t-faint)' }}>{FIELD_LABELS[field] ?? field}<input className="input-base mt-1 block w-full" value={context.confirmedFacts[field] ?? ''} maxLength={300} onChange={event => setContext(previous => ({ ...previous, confirmedFacts: { ...previous.confirmedFacts, [field]: event.target.value } }))} /></label>)}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3"><span className="text-[10px]" style={{ color: saved ? '#4f9a72' : 'var(--t-faint)' }}>{saved ? '已保存并重新评估' : '修改后需要保存'}</span><button disabled={saving || !context.ownerARole.trim() || !context.ownerBRole.trim()} onClick={() => void saveRelationshipContext()} className="rounded-lg px-4 py-2 text-[10px] disabled:opacity-40" style={{ color: '#fffaf3', background: 'var(--ac)' }}>{saving ? '保存中…' : '保存关系背景'}</button></div>
            </div>
          )}
        </section>

        {evaluationError && <div className="rounded-xl px-4 py-3 text-[11px]" style={{ color: '#c56d5c', border: '1px solid rgba(197,109,92,.3)' }}>{evaluationError}</div>}
        {loading && !evaluation && <div className="rounded-xl p-8 text-center text-[11px] card-glass" style={{ color: 'var(--t-faint)' }}>正在构建双命盘事实与规则评估…</div>}

        {evaluation && (
          <>
            {evaluation.observation && <p className="text-xs leading-relaxed" style={{ color: 'var(--t-text2)' }}>
              当前观察截至 {evaluation.observation.asOfDate}（北京时间）· {evaluation.observation.ageConvention}。
              甲方 {evaluation.observation.ages.A} 岁，乙方 {evaluation.observation.ages.B} 岁。指定年度另按当年 7 月 1 日分析。
            </p>}
            <section className="rounded-xl p-4 card-glass">
              <div className="mb-3 flex items-center justify-between"><div><h2 className="text-[12px] font-semibold" style={{ color: 'var(--t-text)' }}>双命盘结构对照</h2><p className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>只展示当前维度需要的宫位；甲乙数据始终隔离</p></div><span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{evaluation.methodologyVersion}</span></div>
              <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">{evaluation.dimensions.map(item => <button key={item.dimensionId} onClick={() => setSelectedDimension(item.dimensionId)} className="shrink-0 rounded-full px-3 py-1.5 text-[9px]" style={{ color: item.dimensionId === selectedDimension ? 'var(--t-gold)' : 'var(--t-faint)', border: `1px solid ${item.dimensionId === selectedDimension ? 'rgba(212,168,67,.35)' : 'var(--t-border)'}`, background: item.dimensionId === selectedDimension ? 'rgba(212,168,67,.08)' : 'transparent' }}>{item.label}</button>)}</div>
              <div className="grid gap-3 md:grid-cols-2"><PalaceColumn role={`甲方 · ${evaluation.roles.A}`} facts={factsA} /><PalaceColumn role={`乙方 · ${evaluation.roles.B}`} facts={factsB} /></div>
            </section>

            <section className="rounded-xl p-4 card-glass">
              <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="text-[12px] font-semibold" style={{ color: 'var(--t-text)' }}>{activeDimension?.label ?? '规则评估'}</h2><p className="mt-1 text-[9px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>{activeDimension?.description}</p></div><button onClick={() => void loadEvaluation()} title="重新评估" className="rounded-lg p-2" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}><ArrowClockwise size={13} className={loading ? 'animate-spin' : ''} /></button></div>
              {activeDimension?.missingContextFields.length ? <div className="mb-3 flex gap-2 rounded-lg p-3 text-[10px] leading-relaxed" style={{ color: '#b98734', border: '1px solid rgba(185,135,52,.28)' }}><WarningCircle size={15} className="mt-0.5 shrink-0" /><span>尚缺现实信息：{activeDimension.missingContextFields.map(field => FIELD_LABELS[field] ?? field).join('、')}。相关判断会保持低置信度。</span></div> : <div className="mb-3 flex items-center gap-2 text-[10px]" style={{ color: '#4f9a72' }}><CheckCircle size={14} />当前维度所需现实背景已补齐</div>}
              <div className="space-y-2.5">
                {activeResults.length === 0 && <div className="rounded-lg p-4 text-[10px]" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>当前规则库没有命中该维度的结构条件。未命中不等于关系好或坏，可继续结合现实互动观察。</div>}
                {activeResults.map(result => {
                  const level = LEVEL_STYLE[result.level];
                  return <article key={`${result.phase}-${result.ruleId}`} className="rounded-lg p-3" style={{ border: '1px solid var(--t-border)' }}><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full px-2 py-0.5 text-[9px]" style={{ color: level.color, border: `1px solid ${level.color}55` }}>{level.label}</span><span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{result.phase === 'natal' ? '本命基线' : result.phase === 'stage' ? '阶段影响' : '安全降级'} · {result.confidence === 'high' ? '高' : result.confidence === 'medium' ? '中' : '低'}置信度 · {result.ruleId}</span></div><p className="text-[11px] leading-relaxed" style={{ color: 'var(--t-text2)' }}>{result.conclusion}</p><p className="mt-2 text-[10px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>建议：{result.advice}</p><div className="mt-2 text-[9px]" style={{ color: 'var(--t-faint)' }}>证据 {result.evidenceIds.length} 条 · 规则 v{result.ruleVersion}</div></article>;
                })}
              </div>
              {evaluation.warnings.length > 0 && <div className="mt-3 space-y-1 border-t pt-3" style={{ borderColor: 'var(--t-border)' }}>{evaluation.warnings.map(warning => <p key={warning} className="text-[9px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>※ {warning}</p>)}</div>}
            </section>
          </>
        )}
      </div>

      <aside className="min-w-0 xl:sticky xl:top-[72px] xl:self-start"><HemingChatPanel conversationId={conversation.id} initialMessages={initialMessages} relationshipType={conversation.relationshipType ?? 'custom'} /></aside>
    </div>
  );
}
