import { PERSONAL_ELECTION_LEGACY_VERSION, type PersonalElectionAssessment, type PersonalElectionSnapshot } from '@/lib/election/personal-types';
import { PersonalLuckAssessmentFacts, PersonalLuckSnapshotFacts } from './ElectionLuckFacts';
import styles from './ElectionPersonal.module.css';

const climateScopes: Record<string, string> = {
  stem_month_reference: '十干月令参考',
  seasonal_reference: '四时一般原则',
};

export function PersonalSnapshotFacts({ snapshot, saved = true }: { snapshot: PersonalElectionSnapshot; saved?: boolean }) {
  const input = snapshot.input;
  const filters = [
    input.avoidDayYearClash && '用事日冲年支',
    input.avoidDayBranchClash && '用事日冲日支',
    input.avoidHourYearClash && '用事时冲年支',
    input.avoidHourBranchClash && '用事时冲日支',
  ].filter(Boolean);
  return <section className={styles.snapshot} aria-label={saved ? '保存时的个人八字条件' : '本次筛选的个人八字条件'}>
    <h3>{saved ? '保存时的个人八字条件' : '本次筛选的个人八字条件'}</h3>
    <p className={styles.note}>{saved ? '按本方案保存的四柱与条件回看。删除原八字后，方案仍保留当时依据。' : '保存后将按本次四柱与条件回看，并保留当时依据。'}</p>
    <p>相冲排除：{filters.length ? filters.join('、') : '未启用，关系仅展示'}。</p>
    <p>人工五行：{input.filterStems ? '参与日干、时干过滤' : '仅展示，不作排除'}。</p>
    <p>岁运背景：{input.includeLuckContext ? '已开启，仅展示，不参与排除' : snapshot.version === PERSONAL_ELECTION_LEGACY_VERSION ? '旧版方案未记录，不补算' : '未开启'}。</p>
    <div className={styles.snapshotPeople}>{snapshot.participants.map((person, index) => <article className={styles.personFacts} key={person.chartId}>
      <h4>参与者 {index + 1} · {person.displayName}</h4>
      <p className={styles.pillars}>{person.pillars.map(p => `${p.label} ${p.stem}${p.branch}`).join(' · ')}</p>
      <p className={styles.note}>{person.policyLabel}{person.unknownTime ? '；时辰未知，未使用时柱。' : '。'}</p>
      <p>偏好五行：{person.preferredElements.join('、') || '未设置'}；谨慎五行：{person.cautiousElements.join('、') || '未设置'}。</p>
      {person.basisNote && <p>人工依据：{person.basisNote}</p>}
      <PersonalLuckSnapshotFacts luck={person.luck} enabled={input.includeLuckContext === true} legacy={snapshot.version === PERSONAL_ELECTION_LEGACY_VERSION} />
      <details className={styles.evidence}><summary>查看原局参考与版本依据</summary>
        <p>月令参考：{person.climateReference.label}。</p>
        <p>{climateScopes[person.climateReference.scope] || '月令与季节参考'}</p><p>{person.climateReference.detail}</p>
        <p className={styles.note}>调候候选仅供参考，不自动等同最终喜用，也不自动参与排除。</p>
        <p className={styles.version}>八字方法：{person.chartMethodologyVersion}；引擎：{person.chartEngineVersion}；参考：{person.climateReference.version}。</p>
      </details>
    </article>)}</div>
    <p className={styles.version}>个人化规则：{snapshot.version}。</p>
    <a href={snapshot.source} target="_blank" rel="noopener noreferrer">查看个人化关系规则来源</a>
  </section>;
}

export function PersonalAssessmentFacts({ assessment }: { assessment?: PersonalElectionAssessment }) {
  if (!assessment) return null;
  const scope = assessment.scope === 'day' ? '用事日' : '用事时';
  return <section className={styles.assessment} aria-label={`${scope}个人条件核对`}>
    <h4>{scope}个人条件 · {assessment.targetGanZhi}</h4>
    <p className={assessment.excluded ? styles.errorText : styles.note}>{assessment.excluded ? '触发了已启用的个人排除条件。' : '未触发已启用的个人排除条件；是否列为候选仍需结合黄历日时依据。'}</p>
    {assessment.participants.map(person => <article className={styles.personFacts} key={person.chartId}>
      <h5>{person.displayName}{person.unknownTime ? ' · 时辰未知' : ''}</h5>
      {person.manualElementNote && <p>{person.manualElementNote}</p>}
      {person.excludedReasons.length > 0 && <ul className={styles.reasons}>{person.excludedReasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>}
      {person.relations.length ? <details className={styles.evidence}><summary>查看与原局的关系（{person.relations.length} 项）</summary><ul>{person.relations.map((relation, i) => <li key={`${relation.type}-${i}`}><strong>{relation.label}</strong>：{relation.detail}</li>)}</ul></details> : <p className={styles.note}>当前规则未识别到天干五合、地支六冲、六合、同支或完整三合关系。</p>}
      <PersonalLuckAssessmentFacts luck={person.luck} scope={assessment.scope} />
    </article>)}
    <p className={styles.note}>关系用于说明取舍，不按合冲数量评级；完整三合也不直接判为合化。</p>
  </section>;
}
