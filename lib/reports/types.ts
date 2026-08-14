export const REPORT_TYPES = [
  'overview',
  'personality',
  'career',
  'relationship',
  'wealth',
  'health',
  'current_daxian',
] as const;

export type ReportType = typeof REPORT_TYPES[number];
export type ReportVersionStatus = 'generating' | 'completed' | 'failed';
export type ReportSectionBasis = 'evidence' | 'synthesis';

export interface ReportTypeDefinition {
  label: string;
  description: string;
  sectionKeys: Array<{ key: string; title: string }>;
  palaceNames: string[];
}

export const REPORT_TYPE_DEFINITIONS: Record<ReportType, ReportTypeDefinition> = {
  overview: {
    label: '命格总览报告',
    description: '汇总命格结构、主要天赋、人生主题与当前阶段。',
    sectionKeys: [
      { key: 'core_pattern', title: '核心命格结构' },
      { key: 'strengths', title: '主要优势与天赋' },
      { key: 'life_themes', title: '人生重点主题' },
      { key: 'relationships', title: '关系与情感模式' },
      { key: 'current_stage', title: '当前人生阶段' },
    ],
    palaceNames: ['命宫', '福德宫', '官禄宫', '财帛宫', '夫妻宫', '迁移宫', '疾厄宫'],
  },
  personality: {
    label: '性格与天赋报告',
    description: '分析思考方式、行为风格、潜能与成长课题。',
    sectionKeys: [
      { key: 'inner_drive', title: '内在驱动力' },
      { key: 'outer_style', title: '外在行为风格' },
      { key: 'talents', title: '优势天赋' },
      { key: 'blind_spots', title: '压力反应与盲点' },
      { key: 'growth', title: '成长方向' },
    ],
    palaceNames: ['命宫', '福德宫', '迁移宫', '官禄宫'],
  },
  career: {
    label: '事业发展报告',
    description: '分析职业倾向、工作方式、发展环境与阶段策略。',
    sectionKeys: [
      { key: 'career_drive', title: '事业驱动力' },
      { key: 'work_style', title: '工作与决策方式' },
      { key: 'suitable_fields', title: '适合的发展方向' },
      { key: 'collaboration', title: '合作与职场关系' },
      { key: 'career_risks', title: '发展阻力与风险' },
      { key: 'current_strategy', title: '当前阶段策略' },
    ],
    palaceNames: ['命宫', '官禄宫', '财帛宫', '迁移宫', '交友宫', '福德宫'],
  },
  relationship: {
    label: '感情婚姻报告',
    description: '分析关系需求、互动模式、择偶倾向与经营建议。',
    sectionKeys: [
      { key: 'relationship_needs', title: '关系中的核心需求' },
      { key: 'partner_pattern', title: '伴侣与互动模式' },
      { key: 'emotional_style', title: '情绪与亲密表达' },
      { key: 'relationship_risks', title: '关系中的压力点' },
      { key: 'relationship_growth', title: '关系经营建议' },
    ],
    palaceNames: ['命宫', '夫妻宫', '福德宫', '迁移宫', '交友宫', '子女宫'],
  },
  wealth: {
    label: '财富模式报告',
    description: '分析资源获取、财富管理、风险倾向与长期积累方式。',
    sectionKeys: [
      { key: 'wealth_source', title: '财富来源模式' },
      { key: 'resource_style', title: '资源运用方式' },
      { key: 'risk_preference', title: '风险与决策倾向' },
      { key: 'accumulation', title: '积累与守成能力' },
      { key: 'wealth_strategy', title: '财富行动建议' },
    ],
    palaceNames: ['财帛宫', '官禄宫', '田宅宫', '命宫', '福德宫'],
  },
  health: {
    label: '健康关注报告',
    description: '从传统命理角度观察生活节奏、压力来源与自我照顾重点。',
    sectionKeys: [
      { key: 'constitution', title: '身心节奏倾向' },
      { key: 'stress', title: '压力来源与反应' },
      { key: 'habits', title: '生活习惯关注点' },
      { key: 'balance', title: '恢复与平衡方式' },
      { key: 'health_boundaries', title: '健康观察边界' },
    ],
    palaceNames: ['疾厄宫', '命宫', '福德宫', '迁移宫', '父母宫'],
  },
  current_daxian: {
    label: '当前大限报告',
    description: '结合本命结构，分析当前十年阶段的主题、机会与注意事项。',
    sectionKeys: [
      { key: 'stage_theme', title: '十年阶段主题' },
      { key: 'activated_strengths', title: '被激活的能力' },
      { key: 'opportunities', title: '主要发展机会' },
      { key: 'pressures', title: '阶段压力与挑战' },
      { key: 'stage_strategy', title: '十年行动策略' },
    ],
    palaceNames: ['命宫', '福德宫', '官禄宫', '财帛宫', '迁移宫'],
  },
};

export interface Report {
  id: string;
  conversationId: string;
  type: ReportType;
  title: string;
  activeVersionId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReportSection {
  key: string;
  title: string;
  content: string;
  basis: ReportSectionBasis;
  evidenceIds: string[];
}

export interface ReportContent {
  schemaVersion: 1;
  title: string;
  summary: string;
  sections: ReportSection[];
  actionItems: string[];
  openQuestions: string[];
  disclaimer: string;
}

export interface ReportVersion {
  id: string;
  reportId: string;
  version: number;
  engineVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  content: ReportContent | null;
  status: ReportVersionStatus;
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: number;
  completedAt: number | null;
}

export interface ReportEvidence {
  id: string;
  reportVersionId: string;
  sectionKey: string;
  evidenceKey: string;
  kind: 'chart_core' | 'palace' | 'pattern' | 'daxian' | 'confirmed_event';
  label: string;
  source: 'chart_snapshot' | 'rule_engine' | 'user_confirmed';
  facts: Record<string, unknown>;
  createdAt: number;
}

export interface ReportEvidenceDraft {
  evidenceKey: string;
  kind: ReportEvidence['kind'];
  label: string;
  source: ReportEvidence['source'];
  facts: Record<string, unknown>;
}

export interface ReportListItem extends Report {
  activeVersion: ReportVersion | null;
  versionCount: number;
}

export interface ReportDetail {
  report: Report;
  version: ReportVersion | null;
  versions: ReportVersion[];
  evidence: ReportEvidence[];
}

export function isReportType(value: unknown): value is ReportType {
  return typeof value === 'string' && (REPORT_TYPES as readonly string[]).includes(value);
}
