'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CaseTeachingDetail } from '@/lib/cases/types';
import { LIFE_EVENT_CATEGORY_LABELS } from '@/lib/events/types';

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const LEVEL_LABELS = { excellent: '上格', good: '良格', neutral: '一般结构', caution: '需谨慎' } as const;

export default function CaseTeachingWorkspace({ caseId }: { caseId: string }) {
  const [detail, setDetail] = useState<CaseTeachingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/cases/${caseId}/teaching`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as { teaching?: CaseTeachingDetail; error?: string };
        if (!response.ok || !data.teaching) throw new Error(data.error || '教学案例加载失败');
        setDetail(data.teaching);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '教学案例加载失败');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [caseId]);

  if (loading) return <PageState text="正在整理案例教学材料…" />;
  if (!detail) return <PageState text={error || '教学案例不可用'} error />;

  const snapshot = detail.chartSnapshot;
  return (
    <main className="mx-auto min-h-screen max-w-[1180px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/cases" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回案例检索</Link>
          <div className="mt-5 font-mono text-[10px] tracking-[.2em]" style={{ color: 'var(--t-gold)' }}>{detail.caseCode} · TEACHING VIEW</div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>{detail.title}</h1>
          <p className="mt-3 max-w-3xl text-xs leading-7" style={{ color: 'var(--t-text2)' }}>{detail.sourceSummary}</p>
        </div>
        <Link href={`/cases/${caseId}`} className="rounded-lg px-4 py-2.5 text-xs" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>案例授权与管理</Link>
      </header>

      <section className="mb-6 rounded-2xl p-5 sm:p-6" style={{ border: '1px solid var(--t-border-acc)', background: 'linear-gradient(145deg,var(--ac-bg),var(--t-card))' }}>
        <div className="text-[10px] tracking-[.18em]" style={{ color: 'var(--t-gold)' }}>STUDY ORDER</div>
        <h2 className="mt-2 text-lg font-semibold" style={{ color: 'var(--t-text)' }}>本案例建议学习顺序</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {detail.studySteps.map((step, index) => <div key={step} className="rounded-xl p-4" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}><div className="font-mono text-[9px]" style={{ color: 'var(--t-gold)' }}>0{index + 1}</div><p className="mt-2 text-[10px] leading-6" style={{ color: 'var(--t-text2)' }}>{step}</p></div>)}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <article className="rounded-2xl card-glass p-5 sm:p-6">
            <SectionHeader title="匿名命盘结构" subtitle={`匿名快照 ${detail.anonymizationVersion} · 不包含精确出生信息`} />
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Metric label="五行局" value={snapshot.wuxingJuName} />
              <Metric label="命宫" value={`${BRANCHES[snapshot.mingGongBranch]}宫`} />
              <Metric label="身宫" value={`${BRANCHES[snapshot.shenGongBranch]}宫`} />
              <Metric label="年龄段" value={snapshot.profile.currentAgeBand} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {snapshot.palaces.map(palace => {
                const isCore = palace.branch === snapshot.mingGongBranch || palace.branch === snapshot.shenGongBranch;
                return <div key={palace.branch} className="rounded-xl p-4" style={{ border: `1px solid ${isCore ? 'var(--t-border-acc)' : 'var(--t-border)'}`, background: isCore ? 'var(--ac-bg)' : undefined }}><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium" style={{ color: 'var(--t-text)' }}>{palace.name}</span><span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{BRANCHES[palace.branch]}宫</span></div><div className="mt-2 text-[10px] leading-5" style={{ color: 'var(--t-text2)' }}>{palace.stars.length ? palace.stars.map(star => `${star.name}${star.siHua ? `化${star.siHua}` : ''}`).join(' · ') : `空宫${palace.borrowedStars?.length ? `，借${palace.borrowedStars.join('、')}` : ''}`}</div>{isCore && <div className="mt-2 text-[9px]" style={{ color: 'var(--t-gold)' }}>{palace.branch === snapshot.mingGongBranch ? '命宫观察重点' : '身宫观察重点'}</div>}</div>;
              })}
            </div>
          </article>

          <article className="rounded-2xl card-glass p-5 sm:p-6">
            <SectionHeader title="格局规则拆解" subtitle="格局名称不是结论，必须同时查看成立、加分和破格条件" />
            {!detail.patterns.length ? <EmptyText text="严格格局引擎未识别到命名格局，可继续按宫位、星曜和四化分析。" /> : <div className="mt-5 space-y-4">{detail.patterns.map(pattern => <div key={pattern.name} className="rounded-xl p-4" style={{ border: '1px solid var(--t-border)' }}><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold" style={{ color: pattern.level === 'caution' ? '#f59e0b' : 'var(--t-text)' }}>{pattern.name}</span><span className="rounded-full px-2 py-1 text-[9px]" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)' }}>{LEVEL_LABELS[pattern.level]}</span></div><p className="mt-3 text-[10px] leading-6" style={{ color: 'var(--t-text2)' }}>{pattern.description}</p>{pattern.conditions && <div className="mt-3 grid gap-2 sm:grid-cols-3"><Condition title="成立条件" items={pattern.conditions.required} color="var(--t-gold)" /><Condition title="加分项" items={pattern.conditions.bonus ?? []} color="#22c55e" /><Condition title="破格项" items={pattern.conditions.breaking ?? []} color="#f59e0b" /></div>}<div className="mt-3 text-[9px]" style={{ color: 'var(--t-faint)' }}>规则来源：{pattern.source ?? '项目格局引擎'}</div></div>)}</div>}
          </article>

          <article className="rounded-2xl card-glass p-5 sm:p-6">
            <SectionHeader title="匿名事件回看" subtitle="事件只保留类别、年龄段和影响级别，用于练习验证思路，不证明因果" />
            {!detail.events.length ? <EmptyText text="本案例没有已确认的匿名事件，现实验证部分应保持空白。" /> : <div className="mt-5 grid gap-3 sm:grid-cols-2">{detail.events.map((event, index) => <div key={`${event.category}-${event.ageBand}-${index}`} className="rounded-xl p-4" style={{ border: '1px solid var(--t-border)' }}><div className="flex items-center justify-between"><span className="text-xs" style={{ color: 'var(--t-text)' }}>{LIFE_EVENT_CATEGORY_LABELS[event.category]}</span><span className="text-[9px]" style={{ color: 'var(--t-gold)' }}>影响 {event.impactLevel}/5</span></div><p className="mt-2 text-[10px]" style={{ color: 'var(--t-faint)' }}>{event.ageBand ?? '年龄段未知'} · {event.datePrecision === 'range' ? '跨年区间' : event.datePrecision === 'year' ? '年份层级' : '时间未知'}</p></div>)}</div>}
          </article>
        </div>

        <aside className="space-y-5">
          <article className="rounded-2xl card-glass p-5">
            <SectionHeader title="证据清单" subtitle="每一步都能回到匿名结构或确定性规则" />
            <div className="mt-4 space-y-4">{detail.evidence.map(block => <div key={block.id}><div className="text-[10px] font-medium" style={{ color: 'var(--t-gold)' }}>{block.title}</div><ul className="mt-2 space-y-1.5">{block.facts.map(fact => <li key={fact} className="text-[10px] leading-5" style={{ color: 'var(--t-text2)' }}>· {fact}</li>)}</ul><div className="mt-2 text-[8px]" style={{ color: 'var(--t-faint)' }}>{evidenceSourceLabel(block.source)}</div></div>)}</div>
          </article>

          <article className="rounded-2xl card-glass p-5">
            <SectionHeader title="讨论问题" subtitle="可以先独立作答，再回看证据清单" />
            <ol className="mt-4 space-y-3">{detail.discussionQuestions.map((question, index) => <li key={question} className="rounded-lg p-3 text-[10px] leading-6" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}><span className="mr-2 font-mono" style={{ color: 'var(--t-gold)' }}>{index + 1}.</span>{question}</li>)}</ol>
          </article>

          <article className="rounded-2xl p-5" style={{ border: '1px solid rgba(245,158,11,.3)', background: 'rgba(245,158,11,.06)' }}><h2 className="text-xs font-semibold text-amber-500">学习边界</h2><p className="mt-2 text-[10px] leading-6" style={{ color: 'var(--t-text2)' }}>{detail.boundaryNotice}</p></article>
        </aside>
      </section>
    </main>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>{title}</h2><p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>{subtitle}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl p-4 text-center" style={{ background: 'var(--ac-bg)', border: '1px solid var(--t-border)' }}><div className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{label}</div><div className="mt-1 text-xs" style={{ color: 'var(--t-text)' }}>{value}</div></div>; }
function Condition({ title, items, color }: { title: string; items: string[]; color: string }) { return <div className="rounded-lg p-3" style={{ background: 'var(--ac-bg)' }}><div className="text-[9px] font-medium" style={{ color }}>{title}</div><div className="mt-2 text-[9px] leading-5" style={{ color: 'var(--t-text2)' }}>{items.length ? items.join('；') : '本案例未触发'}</div></div>; }
function EmptyText({ text }: { text: string }) { return <div className="mt-5 rounded-lg p-4 text-xs" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>{text}</div>; }
function evidenceSourceLabel(source: string) { return source === 'pattern_engine' ? '来源：确定性格局引擎' : source === 'confirmed_events' ? '来源：已确认匿名事件' : '来源：匿名命盘快照'; }
function PageState({ text, error = false }: { text: string; error?: boolean }) { return <main className="mx-auto min-h-screen max-w-[900px] px-5 py-20"><div className="rounded-xl card-glass px-5 py-20 text-center text-sm" style={{ color: error ? '#ef4444' : 'var(--t-faint)' }}>{text}</div><div className="mt-5 text-center"><Link href="/cases" className="text-xs" style={{ color: 'var(--t-gold)' }}>返回案例库</Link></div></main>; }
