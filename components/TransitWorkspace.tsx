'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import AnnualReportPanel from '@/components/AnnualReportPanel';
import AnnualTransitPanel from '@/components/AnnualTransitPanel';
import ChartBoard from '@/components/ChartBoard';
import ConversationHistory from '@/components/ConversationHistory';
import InsightPanel from '@/components/InsightPanel';
import type { Conversation, ConversationMessage } from '@/lib/conversations/types';
import type { AnnualTransitReport, AnnualTransitReportVersion, AnnualTransitSnapshot, TransitSnapshotRecord } from '@/lib/transits/types';
import type { Palace, ZiweiChart } from '@/lib/ziwei/types';
import type { TimeView } from '@/components/TimeNav';

export default function TransitWorkspace({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [snapshot, setSnapshot] = useState<AnnualTransitSnapshot | null>(null);
  const [report, setReport] = useState<AnnualTransitReport | null>(null);
  const [reportVersions, setReportVersions] = useState<AnnualTransitReportVersion[]>([]);
  const requestedYear = Number.parseInt(searchParams.get('year') ?? '', 10);
  const [year, setYear] = useState(Number.isInteger(requestedYear) ? requestedYear : new Date().getFullYear());
  const [timeView, setTimeView] = useState<TimeView>('liunian');
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  const [selectedSiHua, setSelectedSiHua] = useState<{ starName: string; siHua: string; view: TimeView } | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(true);
  const [loadingTransit, setLoadingTransit] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState('');
  const [error, setError] = useState('');
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const reportRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setHistoryCollapsed(window.localStorage.getItem('ziwei-history-collapsed') === 'true');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingConversation(true);
    fetch(`/api/conversations/${conversationId}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { conversation?: Conversation; messages?: ConversationMessage[]; error?: string };
        if (!response.ok || !data.conversation?.chartSnapshot) throw new Error(data.error || '命盘加载失败');
        return data;
      })
      .then(data => {
        setChart(data.conversation!.chartSnapshot);
        setMessages(data.messages ?? []);
        const birthYear = data.conversation!.birthInfo?.year ?? year;
        setYear(current => Math.max(birthYear, Math.min(birthYear + 130, current)));
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '命盘加载失败');
      })
      .finally(() => setLoadingConversation(false));
    return () => controller.abort();
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!chart) return;
    const controller = new AbortController();
    setLoadingTransit(true);
    setError('');
    setSnapshot(null);
    setReport(null);
    setReportVersions([]);
    setReportError('');
    fetch(`/api/conversations/${conversationId}/transits?level=year&date=${year}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async response => {
        const data = await response.json() as { transit?: TransitSnapshotRecord; error?: string };
        if (!response.ok || !data.transit) throw new Error(data.error || '年度分析加载失败');
        return data.transit.snapshot;
      })
      .then(setSnapshot)
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setSnapshot(null);
        setError(loadError instanceof Error ? loadError.message : '年度分析加载失败');
      })
      .finally(() => setLoadingTransit(false));
    return () => controller.abort();
  }, [chart, conversationId, year]);

  useEffect(() => {
    if (!snapshot || snapshot.selectedYear !== year) return;
    const controller = new AbortController();
    reportRequestRef.current?.abort();
    reportRequestRef.current = controller;
    setReport(null);
    setReportError('');
    setLoadingReport(true);
    ensureAnnualReport(conversationId, year, false, controller.signal, setReport, setReportVersions)
      .then(nextReport => {
        if (!controller.signal.aborted) setReport(nextReport);
      })
      .catch(loadError => {
        if (controller.signal.aborted) return;
        setReportError(loadError instanceof Error ? loadError.message : '年度报告生成失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingReport(false);
      });
    return () => controller.abort();
  }, [conversationId, snapshot, year]);

  const toggleHistory = () => {
    setHistoryCollapsed(current => {
      const next = !current;
      window.localStorage.setItem('ziwei-history-collapsed', String(next));
      return next;
    });
  };

  const minYear = chart?.birthInfo.year ?? year;
  const maxYear = Math.min(minYear + 130, 2200);
  const selectedNominalAge = chart ? year - chart.birthInfo.year + 1 : 0;
  const selectedDaXian = chart?.daXians.find(item => (
    selectedNominalAge >= item.startAge && selectedNominalAge <= item.endAge
  ));

  const regenerateReport = () => {
    if (!snapshot || snapshot.selectedYear !== year || loadingReport) return;
    const controller = new AbortController();
    reportRequestRef.current?.abort();
    reportRequestRef.current = controller;
    setReportError('');
    setLoadingReport(true);
    ensureAnnualReport(conversationId, year, true, controller.signal, setReport, setReportVersions)
      .then(nextReport => {
        if (!controller.signal.aborted) setReport(nextReport);
      })
      .catch(loadError => {
        if (controller.signal.aborted) return;
        setReportError(loadError instanceof Error ? loadError.message : '年度报告重新生成失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingReport(false);
      });
  };

  const selectReportVersion = (version: number) => {
    if (loadingReport || report?.version === version) return;
    const controller = new AbortController();
    reportRequestRef.current?.abort();
    reportRequestRef.current = controller;
    setReportError('');
    setLoadingReport(true);
    fetchAnnualReport(conversationId, year, controller.signal, version)
      .then(detail => {
        if (controller.signal.aborted) return;
        setReport(detail.report);
        setReportVersions(detail.versions);
      })
      .catch(loadError => {
        if (controller.signal.aborted) return;
        setReportError(loadError instanceof Error ? loadError.message : '年度报告版本加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingReport(false);
      });
  };

  return (
    <main className="mx-auto max-w-[1800px] px-3 py-4 md:px-4">
      <div className={`grid grid-cols-1 items-start gap-4 ${historyCollapsed ? 'xl:grid-cols-[64px_minmax(0,1fr)]' : 'xl:grid-cols-[260px_minmax(0,1fr)]'}`}>
        <ConversationHistory activeConversationId={conversationId} collapsed={historyCollapsed} onToggle={toggleHistory} />
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => router.push(`/chart/${conversationId}`)}
                className="rounded-lg px-3 py-1.5 text-xs"
                style={{ border: '1px solid var(--t-border)', color: 'var(--t-text)' }}
              >
                ← 返回命盘
              </button>
              <button
                type="button"
                onClick={() => router.push(`/chart/${conversationId}/events`)}
                className="rounded-lg px-3 py-1.5 text-xs"
                style={{ border: '1px solid var(--t-border)', color: 'var(--t-faint)' }}
              >
                人生事件
              </button>
            </div>
            <div className="text-right">
              <h1 className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>年度时间运势</h1>
              <p className="mt-0.5 text-[9px]" style={{ color: 'var(--t-faint)' }}>M1 第一版 · 年度确定性快照</p>
            </div>
          </div>

          {loadingConversation && (
            <div className="rounded-xl card-glass py-24 text-center text-sm" style={{ color: 'var(--t-faint)' }}>正在加载命盘…</div>
          )}

          {!loadingConversation && chart && (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,390px)]">
              <div className="min-w-0">
                <ChartBoard
                  chart={chart}
                  timeView={timeView}
                  liunianYear={year}
                  onTimeViewChange={setTimeView}
                  onLiunianYearChange={next => setYear(Math.min(maxYear, Math.max(minYear, next)))}
                  activeDaXian={selectedDaXian}
                  onPalaceSelect={setSelectedPalace}
                  onSiHuaClick={(starName, siHua, view) => setSelectedSiHua({ starName, siHua, view })}
                />
                <AnnualTransitPanel
                  snapshot={snapshot}
                  year={year}
                  minYear={minYear}
                  maxYear={maxYear}
                  loading={loadingTransit}
                  error={error}
                  onYearChange={setYear}
                />
                {snapshot?.selectedYear === year && (
                  <AnnualReportPanel
                    year={year}
                    report={report}
                    versions={reportVersions}
                    loading={loadingReport}
                    error={reportError}
                    onRegenerate={regenerateReport}
                    onVersionChange={selectReportVersion}
                  />
                )}
              </div>
              <div className="min-w-0 lg:sticky lg:top-4">
                <InsightPanel
                  key={conversationId}
                  chart={chart}
                  conversationId={conversationId}
                  initialMessages={messages}
                  selectedPalace={selectedPalace}
                  selectedSiHua={selectedSiHua}
                  transitContext={{ level: 'year', targetDate: String(year) }}
                  autoGenerate={false}
                />
              </div>
            </div>
          )}

          {!loadingConversation && !chart && (
            <div className="rounded-xl card-glass px-6 py-20 text-center text-sm text-red-500">{error || '命盘加载失败'}</div>
          )}
        </section>
      </div>
    </main>
  );
}

async function ensureAnnualReport(
  conversationId: string,
  year: number,
  regenerate: boolean,
  signal: AbortSignal,
  onProgress: (report: AnnualTransitReport | null) => void,
  onVersions: (versions: AnnualTransitReportVersion[]) => void,
): Promise<AnnualTransitReport> {
  let report: AnnualTransitReport | null = null;
  if (!regenerate) {
    const detail = await fetchAnnualReport(conversationId, year, signal);
    report = detail.report;
    onProgress(report);
    onVersions(detail.versions);
    if (report?.status === 'completed' && report.content.trim()) return report;
  }

  if (!report || report.status === 'failed' || regenerate) {
    const detail = await requestAnnualReport(conversationId, year, regenerate, signal);
    report = detail.report;
    onProgress(report);
    onVersions(detail.versions);
    if (report.status === 'completed' && report.content.trim()) return report;
  }

  for (let attempt = 0; attempt < 80; attempt += 1) {
    await abortableDelay(1_500, signal);
    const detail = await fetchAnnualReport(conversationId, year, signal);
    report = detail.report;
    onProgress(report);
    onVersions(detail.versions);
    if (report?.status === 'completed' && report.content.trim()) return report;
    if (report?.status === 'failed') throw new Error('年度报告生成失败，请点击重新生成再试');
  }
  throw new Error('年度报告仍在后台生成，请稍后重新进入当前年份查看');
}

async function fetchAnnualReport(
  conversationId: string,
  year: number,
  signal: AbortSignal,
  version?: number,
): Promise<{ report: AnnualTransitReport | null; versions: AnnualTransitReportVersion[] }> {
  const versionQuery = version ? `&version=${version}` : '';
  const response = await fetch(
    `/api/conversations/${conversationId}/transit-reports?level=year&date=${year}${versionQuery}`,
    { cache: 'no-store', signal },
  );
  const data = await response.json().catch(() => ({})) as { report?: AnnualTransitReport | null; versions?: AnnualTransitReportVersion[]; error?: string };
  if (!response.ok) throw new Error(data.error || '年度报告读取失败');
  return { report: data.report ?? null, versions: data.versions ?? [] };
}

async function requestAnnualReport(
  conversationId: string,
  year: number,
  regenerate: boolean,
  signal: AbortSignal,
): Promise<{ report: AnnualTransitReport; versions: AnnualTransitReportVersion[] }> {
  const response = await fetch(`/api/conversations/${conversationId}/transit-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level: 'year', date: String(year), regenerate }),
    signal,
  });
  const data = await response.json().catch(() => ({})) as { report?: AnnualTransitReport; versions?: AnnualTransitReportVersion[]; error?: string };
  if (!response.ok || !data.report) throw new Error(data.error || '年度报告生成失败');
  return { report: data.report, versions: data.versions ?? [] };
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('请求已取消', 'AbortError'));
      return;
    }
    const timeout = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException('请求已取消', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
