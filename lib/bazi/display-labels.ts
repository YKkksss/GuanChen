const PILLAR_LABELS: Record<string, string> = { year: '年', month: '月', day: '日', time: '时' };

/** 兼容旧版本依据文本；只转换展示，不改写历史快照与审计指纹。 */
export function formatBaziEvidenceLabel(value: string): string {
  return value.replace(/原局(year|month|day|time)支/g, (_, key: string) => `原局${PILLAR_LABELS[key]}支`);
}
