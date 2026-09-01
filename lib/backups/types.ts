export const LOCAL_BACKUP_KIND = 'ziwei-local-backup' as const;
export const LOCAL_BACKUP_FORMAT_VERSION = 1 as const;
export const LOCAL_BACKUP_EXTENSION = '.ziweibackup' as const;
export const LOCAL_BACKUP_CONFIRMATION = '覆盖本地数据' as const;

export type BackupTableCount = {
  name: string;
  rows: number;
};

export type BackupAttachmentManifest = {
  relativePath: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  data: string;
};

export type LocalBackupEnvelope = {
  kind: typeof LOCAL_BACKUP_KIND;
  formatVersion: typeof LOCAL_BACKUP_FORMAT_VERSION;
  createdAt: string;
  schemaVersion: number;
  database: {
    fileName: 'ziweidoushu.sqlite';
    byteSize: number;
    sha256: string;
    data: string;
  };
  attachments: BackupAttachmentManifest[];
  inventory: {
    tableCounts: BackupTableCount[];
  };
};

export type BackupContentSummary = {
  conversations: number;
  messages: number;
  lifeEvents: number;
  reports: number;
  baziProfiles: number;
  learningRecords: number;
  reminders: number;
};

export type BackupPreview = {
  fileName: string;
  formatVersion: number;
  createdAt: string;
  schemaVersion: number;
  currentSchemaVersion: number;
  compatible: boolean;
  databaseBytes: number;
  archiveBytes: number;
  attachmentCount: number;
  attachmentBytes: number;
  tableCount: number;
  content: BackupContentSummary;
  fingerprint: string;
  warnings: string[];
};

export type LocalDataSummary = {
  schemaVersion: number;
  databaseBytes: number;
  attachmentCount: number;
  attachmentBytes: number;
  content: BackupContentSummary;
  automaticBackups: Array<{
    fileName: string;
    byteSize: number;
    createdAt: string;
  }>;
};

export type BackupArchiveResult = {
  buffer: Buffer;
  fileName: string;
  preview: BackupPreview;
};

export type RestoreBackupResult = {
  restoredAt: string;
  preview: BackupPreview;
  rollbackBackupFileName: string;
};
