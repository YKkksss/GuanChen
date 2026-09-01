export const LOCAL_BACKUP_KIND = 'ziwei-local-backup' as const;
export const LOCAL_BACKUP_FORMAT_VERSION = 1 as const;
export const LOCAL_BACKUP_EXTENSION = '.ziweibackup' as const;
export const ENCRYPTED_LOCAL_BACKUP_KIND = 'ziwei-encrypted-local-backup' as const;
export const ENCRYPTED_LOCAL_BACKUP_FORMAT_VERSION = 1 as const;
export const ENCRYPTED_LOCAL_BACKUP_EXTENSION = '.ziweibackupx' as const;
export const ENCRYPTED_LOCAL_BACKUP_MIN_PASSWORD_LENGTH = 10 as const;
export const LOCAL_BACKUP_CONFIRMATION = '覆盖本地数据' as const;
export const LOCAL_BACKUP_DELETE_CONFIRMATION = '删除本地备份' as const;

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

export type EncryptedLocalBackupHeader = {
  kind: typeof ENCRYPTED_LOCAL_BACKUP_KIND;
  formatVersion: typeof ENCRYPTED_LOCAL_BACKUP_FORMAT_VERSION;
  createdAt: string;
  cipher: {
    name: 'aes-256-gcm';
    iv: string;
    authTagLength: 16;
  };
  kdf: {
    name: 'scrypt';
    salt: string;
    N: 32768;
    r: 8;
    p: 1;
    keyLength: 32;
  };
  inner: {
    kind: typeof LOCAL_BACKUP_KIND;
    formatVersion: typeof LOCAL_BACKUP_FORMAT_VERSION;
    fileName: string;
    byteSize: number;
    sha256: string;
  };
};

export type DecryptedLocalBackup = {
  buffer: Buffer;
  fileName: string;
  encryptedCreatedAt: string;
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

export type BackupPolicy = {
  enabled: boolean;
  intervalHours: number;
  retentionCount: number;
  lastAutomaticBackupAt: string | null;
  updatedAt: string;
};

export type ManagedBackupSource = 'scheduled' | 'manual' | 'pre_restore';
export type ManagedBackupHealth = 'unchecked' | 'healthy' | 'incompatible' | 'damaged';

export type ManagedBackupItem = {
  fileName: string;
  source: ManagedBackupSource;
  byteSize: number;
  createdAt: string;
  health: ManagedBackupHealth;
  lastVerifiedAt: string | null;
  healthMessage: string | null;
};

export type BackupLifecycleSummary = {
  policy: BackupPolicy;
  managedBackups: ManagedBackupItem[];
  nextAutomaticBackupAt: string | null;
};

export type DataVaultSummary = LocalDataSummary & BackupLifecycleSummary;

export type AutomaticBackupCheckResult = {
  status: 'created' | 'not_due' | 'disabled' | 'busy';
  createdFileName: string | null;
  nextAutomaticBackupAt: string | null;
  prunedFileNames: string[];
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
