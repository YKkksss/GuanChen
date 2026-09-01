export const CHART_PACKAGE_KIND = 'ziwei-chart-package' as const;
export const CHART_PACKAGE_FORMAT_VERSION = 1 as const;
export const CHART_PACKAGE_EXTENSION = '.ziweichart.json' as const;
export const CHART_IMPORT_CONFIRMATION = '导入为新命盘' as const;

export type PortableSqlValue = string | number | null;
export type PortableRow = Record<string, PortableSqlValue>;

export type ChartPackagePayload = {
  tables: Record<string, PortableRow[]>;
};

export type ChartPackageFile = {
  kind: typeof CHART_PACKAGE_KIND;
  formatVersion: typeof CHART_PACKAGE_FORMAT_VERSION;
  createdAt: string;
  schemaVersion: number;
  source: {
    conversationId: string;
    title: string;
    type: 'chart';
  };
  inventory: {
    tables: Array<{ name: string; rows: number }>;
    totalRows: number;
  };
  boundaries: string[];
  contentSha256: string;
  payload: ChartPackagePayload;
};

export type ChartPackageContentSummary = {
  messages: number;
  memories: number;
  transitRecords: number;
  events: number;
  reports: number;
  learningRecords: number;
  reminders: number;
  monthlyReviews: number;
};

export type ChartPackagePreview = {
  fileName: string;
  createdAt: string;
  sourceConversationId: string;
  sourceTitle: string;
  suggestedTitle: string;
  schemaVersion: number;
  currentSchemaVersion: number;
  compatible: boolean;
  packageBytes: number;
  tableCount: number;
  totalRows: number;
  idConflictCount: number;
  strategy: 'create_copy';
  content: ChartPackageContentSummary;
  boundaries: string[];
  fingerprint: string;
};

export type ChartPackageExportResult = {
  buffer: Buffer;
  fileName: string;
  preview: ChartPackagePreview;
};

export type ChartPackageImportResult = {
  conversationId: string;
  title: string;
  importedAt: string;
  importedRows: number;
  remappedIds: number;
};
