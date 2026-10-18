export const WORKSPACE_DESTINATIONS = {
  fortune: { label: '紫微运势专题', description: '查看指定流年、流月的主题分析，比较阶段变化并保存报告。' },
  calendar: { label: '运势日历', description: '按公历月查看紫微运限，生成并回看每日主题解读。' },
  reports: { label: '命盘报告', description: '查看或生成所选档案的年度、专题报告。' },
  events: { label: '人生时间轴', description: '记录与回看个人命盘中的真实人生事件。' },
  timeline: { label: '运限分析', description: '查看个人命盘或合盘的大限、流年等运限分析。' },
} as const;

export type WorkspaceDestination = keyof typeof WORKSPACE_DESTINATIONS;
export type WorkspaceSection = 'chart' | 'heming' | 'rectification';

export function isWorkspaceDestination(value: unknown): value is WorkspaceDestination {
  return typeof value === 'string' && Object.hasOwn(WORKSPACE_DESTINATIONS, value);
}

export function supportsDestination(section: WorkspaceSection, target: WorkspaceDestination) {
  if (target === 'calendar' || target === 'fortune') return section === 'chart';
  return target === 'reports' || (target === 'events' ? section === 'chart' : section !== 'rectification');
}

export function destinationHref(target: WorkspaceDestination, section: WorkspaceSection, id: string) {
  return `/${section}/${encodeURIComponent(id)}/${target}`;
}

/** 只有具体档案路由可以提供上下文，列表、选择页和新建页不能充当档案 ID。 */
export function resolveWorkspaceDestination(target: WorkspaceDestination, pathname: string) {
  const match = pathname.match(/^\/(chart|heming|rectification)\/([^/]+)(?:\/|$)/);
  if (match && !['select', 'new'].includes(match[2])) {
    const section = match[1] as WorkspaceSection;
    if (supportsDestination(section, target)) return `/${section}/${match[2]}/${target}`;
  }
  return `/chart/select?target=${target}`;
}
