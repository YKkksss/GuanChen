'use client';

export default function RequestFeedback({ loading, error, empty, onRetry }: {
  loading?: string; error?: string; empty?: string; onRetry?: () => void;
}) {
  if (error) return <div role="alert" className="my-3 rounded-lg border border-red-400/30 p-3 text-sm">
    <p>{error}</p>{onRetry && <button type="button" className="mt-1 min-h-11 underline" onClick={onRetry}>重新读取</button>}
  </div>;
  if (loading) return <p role="status" className="my-3 p-3 text-sm">{loading}</p>;
  if (empty) return <p className="my-3 p-3 text-sm">{empty}</p>;
  return null;
}
