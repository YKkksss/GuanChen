'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ReportResource {
  report: unknown;
  version: { version: number; status: string; createdAt: number } | null;
  versions?: Array<{ version: number; status: string; createdAt: number }>;
}

/** 读取、版本切换、生成与轮询共用请求序号，过期响应不更新当前报告。 */
export function useReportResource<T extends ReportResource>(endpoint: string) {
  const [detail, setDetail] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ sequence: number; controller?: AbortController }>({ sequence: 0 });
  const selected = useRef<number | undefined>(undefined);

  const load = useCallback(async (version?: number, quiet = false, regenerate = false) => {
    request.current.controller?.abort();
    const controller = new AbortController();
    const sequence = ++request.current.sequence;
    request.current.controller = controller;
    selected.current = version;
    if (!quiet) setLoading(true);
    if (regenerate) setRegenerating(true);
    setError('');
    try {
      const url = regenerate ? `${endpoint}/regenerate` : `${endpoint}${version ? `?version=${version}` : ''}`;
      const response = await fetch(url, { method: regenerate ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal });
      const data = await response.json() as T & { error?: string };
      if (!response.ok || !data.report) throw new Error(data.error || (regenerate ? '报告生成失败，请重试或查看旧版本' : '报告读取失败'));
      if (sequence === request.current.sequence && !controller.signal.aborted) setDetail(data);
    } catch (cause) {
      if (sequence === request.current.sequence && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : '报告操作失败');
    } finally {
      if (sequence === request.current.sequence && !controller.signal.aborted) { setLoading(false); setRegenerating(false); }
    }
  }, [endpoint]);

  useEffect(() => {
    setDetail(null);
    void load();
    return () => { ++request.current.sequence; request.current.controller?.abort(); };
  }, [load]);

  const latest = detail?.versions?.reduce((a, b) => a.version > b.version ? a : b, detail.version ?? detail.versions[0]);
  const observed = selected.current === undefined ? latest ?? detail?.version : detail?.version;
  const processing = observed?.status === 'generating';
  const stalled = processing && Date.now() - observed.createdAt >= 3 * 60 * 1000;
  useEffect(() => {
    if (!processing || error || stalled || regenerating || loading) return;
    const timer = window.setTimeout(() => void load(selected.current, true), 2500);
    return () => window.clearTimeout(timer);
  }, [detail, processing, error, load, stalled, regenerating, loading]);

  return {
    detail, loading, error, regenerating, processing, stalled, load,
    setError,
    retry: () => void load(selected.current),
    regenerate: () => load(undefined, false, true),
  };
}
