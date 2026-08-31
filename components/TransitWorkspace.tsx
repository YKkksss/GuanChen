'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import AnnualReportPanel from '@/components/AnnualReportPanel';
import AnnualTransitPanel from '@/components/AnnualTransitPanel';
import ChartBoard from '@/components/ChartBoard';
import ConversationHistory from '@/components/ConversationHistory';
import InsightPanel from '@/components/InsightPanel';
import MonthlyTransitPanel from '@/components/MonthlyTransitPanel';
import type { Conversation, ConversationMessage } from '@/lib/conversations/types';
import type {
  AnnualTransitReport,
  AnnualTransitReportVersion,
  TransitSnapshot,
  TransitSnapshotRecord,
} from '@/lib/transits/types';
import type { Palace, ZiweiChart } from '@/lib/ziwei/types';
import type { TimeView } from '@/components/TimeNav';

export default function TransitWorkspace({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const requestedLevel = searchParams.get('level') === 'month' ? 'month' : 'year';
  const requestedDate = normalizeObservationDate(searchParams.get('date'));
  const [analysisLevel, setAnalysisLevel] = useState<'year' | 'month'>(requestedLevel);
  const [snapshot, setSnapshot] = useState<TransitSnapshot | null>(null);
  const [report, setReport] = useState<AnnualTransitReport | null>(null);
  const [reportVersions, setReportVersions] = useState<AnnualTransitReportVersion[]>([]);
  const requestedYear = Number.parseInt(searchParams.get('year') ?? '', 10);
  const initialYear = Number.isInteger(requestedYear)
    ? requestedYear
    : requestedLevel === 'month'
      ? Number.parseInt(requestedDate.slice(0, 4), 10)
      : new Date().getFullYear();
  const [year, setYear] = useState(initialYear);
  const [observationDate, setObservationDate] = useState(requestedDate);
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
        const birth = data.conversation!.birthInfo;
        if (birth) {
          const earliest = `${birth.year}-${String(birth.month).padStart(2, '0')}-${String(birth.day).padStart(2, '0')}`;
          const latest = `${Math.min(birth.year + 130, 2200)}-12-31`;
          setObservationDate(current => clampDate(current, earliest, latest));
        }
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
    const targetDate = analysisLevel === 'year' ? String(year) : observationDate;
    fetch(`/api/conversations/${conversationId}/transits?level=${analysisLevel}&date=${targetDate}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async response => {
        const data = await response.json() as { transit?: TransitSnapshotRecord; error?: string };
        if (!response.ok || !data.transit) throw new Error(data.error || '运限分析加载失败');
        return data.transit.snapshot;
      })
      .then(setSnapshot)
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setSnapshot(null);
        setError(loadError instanceof Error ? loadError.message : '运限分析加载失败');
      })
      .finally(() => setLoadingTransit(false));
    return () => controller.abort();
  }, [analysisLevel, chart, conversationId, observationDate, year]);

  useEffect(() => {
    if (!snapshot || snapshot.level !== 'year' || snapshot.selectedYear !== year || analysisLevel !== 'year') return;
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
  }, [analysisLevel, conversationId, snapshot, year]);

  const toggleHistory = () => {
    setHistoryCollapsed(current => {
      const next = !current;
      window.localStorage.setItem('ziwei-history-collapsed', String(next));
      return next;
    });
  };

  const minYear = chart?.birthInfo.year ?? year;
  const maxYear = Math.min(minYear + 130, 2200);
  const minDate = chart
    ? `${chart.birthInfo.year}-${String(chart.birthInfo.month).padStart(2, '0')}-${String(chart.birthInfo.day).padStart(2, '0')}`
    : `${minYear}-01-01`;
  const maxDate = `${maxYear}-12-31`;
  const displayYear = analysisLevel === 'month' ? Number.parseInt(observationDate.slice(0, 4), 10) : year;
  const selectedNominalAge = chart ? displayYear - chart.birthInfo.year + 1 : 0;
  const selectedDaXian = chart?.daXians.find(item => (
    selectedNominalAge >= item.startAge && selectedNominalAge <= item.endAge
  ));

  const regenerateReport = () => {
    if (!snapshot || snapshot.level !== 'year' || snapshot.selectedYear !== year || loadingReport) return;
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

  const changeObservationDate = (nextDate: string) => {
    const safeDate = clampDate(nextDate, minDate, maxDate);
    setObservationDate(safeDate);
    setYear(Number.parseInt(safeDate.slice(0, 4), 10));
    router.replace(`/chart/${conversationId}/timeline?level=month&date=${safeDate}`, { scroll: false });
  };

  const changeAnnualYear = (nextYear: number) => {
    const safeYear = Math.min(maxYear, Math.max(minYear, nextYear));
    setYear(safeYear);
    router.replace(`/chart/${conversationId}/timeline?level=year&year=${safeYear}`, { scroll: false });
  };

  const changeChartYear = (nextYear: number) => {
    const safeYear = Math.min(maxYear, Math.max(minYear, nextYear));
    if (analysisLevel === 'month') {
      changeObservationDate(replaceDateYear(observationDate, safeYear));
    } else {
      changeAnnualYear(safeYear);
    }
  };

  const changeAnalysisLevel = (level: 'year' | 'month') => {
    setAnalysisLevel(level);
    setError('');
    if (level === 'month') {
      changeObservationDate(replaceDateYear(observationDate, year));
    } else {
      changeAnnualYear(year);
    }
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
              <h1 className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>时间运势</h1>
              <p className="mt-0.5 text-[9px]" style={{ color: 'var(--t-faint)' }}>M1-2 · 年度与流月确定性快照</p>
            </div>
          </div>

          <div className="mb-4 flex w-fit rounded-xl p-1" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
            {([
              ['year', '年度分析'],
              ['month', '流月分析'],
            ] as const).map(([level, label]) => (
              <button
                key={level}
                type="button"
                onClick={() => changeAnalysisLevel(level)}
                className="rounded-lg px-4 py-2 text-xs transition-colors"
                style={analysisLevel === level
                  ? { background: 'rgba(212,168,67,.16)', color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.28)' }
                  : { color: 'var(--t-faint)', border: '1px solid transparent' }}
              >
                {label}
              </button>
            ))}
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
                  liunianYear={displayYear}
                  onTimeViewChange={setTimeView}
                  onLiunianYearChange={changeChartYear}
                  activeDaXian={selectedDaXian}
                  onPalaceSelect={setSelectedPalace}
                  onSiHuaClick={(starName, siHua, view) => setSelectedSiHua({ starName, siHua, view })}
                />
                {analysisLevel === 'year' && (
                  <AnnualTransitPanel
                    snapshot={snapshot?.level === 'year' ? snapshot : null}
                    year={year}
                    minYear={minYear}
                    maxYear={maxYear}
                    loading={loadingTransit}
                    error={error}
                    onYearChange={changeAnnualYear}
                  />
                )}
                {analysisLevel === 'month' && (
                  <MonthlyTransitPanel
                    snapshot={snapshot?.level === 'month' ? snapshot : null}
                    observationDate={observationDate}
                    minDate={minDate}
                    maxDate={maxDate}
                    loading={loadingTransit}
                    error={error}
                    onDateChange={changeObservationDate}
                  />
                )}
                {analysisLevel === 'year' && snapshot?.level === 'year' && snapshot.selectedYear === year && (
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
                  transitContext={analysisLevel === 'month'
                    ? snapshot?.level === 'month'
                      ? {
                          level: 'month',
                          targetDate: snapshot.targetDate,
                          label: `${snapshot.lunarMonth.year} 年${snapshot.lunarMonth.label}`,
                        }
                      : null
                    : { level: 'year', targetDate: String(year), label: `${year} 年` }}
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

function normalizeObservationDate(value: string | null): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day) {
      return value;
    }
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function clampDate(date: string, minDate: string, maxDate: string): string {
  return date < minDate ? minDate : date > maxDate ? maxDate : date;
}

function replaceDateYear(date: string, year: number): string {
  const month = Number.parseInt(date.slice(5, 7), 10);
  const day = Number.parseInt(date.slice(8, 10), 10);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCMonth() !== month - 1) {
    return `${year}-${String(month).padStart(2, '0')}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
