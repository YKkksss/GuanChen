import type { PersonalElectionLuckAssessment, PersonalElectionLuckRelation, PersonalElectionLuckSnapshot } from '@/lib/election/personal-luck-types';
import styles from './ElectionPersonal.module.css';

const snapshotStatuses: Record<PersonalElectionLuckSnapshot['status'], string> = {
  complete: '已记录岁运排期依据',
  withheld_unknown_time: '时辰未知，精确大运归属不可用',
  withheld_unsupported_clock: '当前时间口径不适用，精确大运归属不可用',
  withheld_chart_time_basis_conflict: '排盘与时间依据不一致，精确大运归属不可用',
};

const wallClockPattern = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/;

/** 保存边界是固定东八区墙钟，不能按浏览器所在时区重新解释。 */
function formatBoundary(value: string): string {
  if (wallClockPattern.test(value)) return `${value.replace('T', ' ')} UTC+08:00`;
  // 兼容已明确携带偏移的时间，保留非零毫秒。
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return value;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return `${new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace(/\.000Z$/, '').replace(/Z$/, '')} UTC+08:00`;
}

function boundaryDateTime(value: string): string {
  return wallClockPattern.test(value) ? `${value.replace(' ', 'T')}+08:00` : value;
}

function Relations({ label, relations }: { label: string; relations: PersonalElectionLuckRelation[] }) {
  if (!relations.length) return <p className={styles.note}>{label}：当前规则未识别到可展示的关系。</p>;
  return <details className={styles.evidence}>
    <summary>{label}（{relations.length} 项）</summary>
    <ul className={styles.luckRelations}>{relations.map((relation, index) => <li key={`${relation.label}-${index}`}><strong>{relation.label}</strong>：{relation.detail}</li>)}</ul>
  </details>;
}

export function PersonalLuckSnapshotFacts({ luck, enabled, legacy }: { luck?: PersonalElectionLuckSnapshot; enabled: boolean; legacy: boolean }) {
  if (!luck) return <p className={styles.note}>{legacy ? '岁运背景：旧版方案未记录，不补算或改写保存结果。' : enabled ? '岁运背景：本方案未记录可用依据，不能据此补算。' : '岁运背景：未开启。'}</p>;
  return <details className={styles.evidence}>
    <summary>岁运依据 · {snapshotStatuses[luck.status] ?? '状态未识别，请核对保存版本'}</summary>
    <p className={styles.note}>保存了 {luck.cycles.length} 步大运的时间区间；按本方案快照回看，不依赖原八字是否仍存在。</p>
    {luck.warnings.length > 0 && <ul className={styles.luckWarnings}>{luck.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
    <p className={styles.version}>岁运背景：{luck.version}；大运方法：{luck.methodologyVersion}；引擎：{luck.engineVersion}；关系规则：{luck.relationVersion}。</p>
  </details>;
}

export function PersonalLuckAssessmentFacts({ luck, scope }: { luck?: PersonalElectionLuckAssessment; scope: 'day' | 'hour' }) {
  if (!luck) return null;
  const target = scope === 'day' ? '用事日干' : '用事时干';
  return <details className={styles.luckFacts}>
    <summary>岁运背景复核 · {luck.segments.length ? `${luck.segments.length} 个时间分段` : '暂无可用时间分段'}</summary>
    <p>{target}相对本命日主：<strong>{luck.targetTenGod}</strong>。十神仅标记表干的相对角色，不代表喜忌或实际效力。</p>
    <p className={styles.note}>以下区间包含起点、不包含终点，均为 UTC+08:00。背景仅展示，不增加个人排除条件。</p>
    {luck.warnings.length > 0 && <ul className={styles.luckWarnings}>{luck.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
    <div className={styles.luckSegments}>{luck.segments.map((segment, index) => <section className={styles.luckSegment} key={`${segment.startAt}-${segment.endAtExclusive}-${index}`} aria-label={`岁运分段 ${index + 1}`}>
      <h6>分段 {index + 1} · {segment.luck.label}</h6>
      <dl className={styles.luckRange}>
        <div><dt>起点（含）</dt><dd><time dateTime={boundaryDateTime(segment.startAt)}>{formatBoundary(segment.startAt)}</time></dd></div>
        <div><dt>终点（不含）</dt><dd><time dateTime={boundaryDateTime(segment.endAtExclusive)}>{formatBoundary(segment.endAtExclusive)}</time></dd></div>
      </dl>
      {segment.layers.length > 0 && <dl className={styles.luckLayers}>{segment.layers.map(layer => <div key={layer.key}>
        <dt>{layer.label}</dt><dd><strong>{layer.ganZhi}</strong><span>表干十神：{layer.tenGod}</span></dd>
      </div>)}</dl>}
      <Relations label="岁运层之间及与原局的背景关系" relations={segment.backgroundRelations} />
      {segment.layers.map(layer => <Relations key={layer.key} label={`${scope === 'day' ? '用事日' : '用事时'}与${layer.label}的关系`} relations={layer.eventRelations} />)}
    </section>)}</div>
    <p className={styles.note}>{luck.boundary}</p>
    <p className={styles.version}>岁运背景版本：{luck.version}。</p>
  </details>;
}
