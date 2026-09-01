import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt,
} from 'node:crypto';
import path from 'node:path';
import { BackupValidationError, createLocalBackupArchive } from './service';
import {
  ENCRYPTED_LOCAL_BACKUP_EXTENSION,
  ENCRYPTED_LOCAL_BACKUP_FORMAT_VERSION,
  ENCRYPTED_LOCAL_BACKUP_KIND,
  ENCRYPTED_LOCAL_BACKUP_MIN_PASSWORD_LENGTH,
  LOCAL_BACKUP_EXTENSION,
  LOCAL_BACKUP_FORMAT_VERSION,
  LOCAL_BACKUP_KIND,
} from './types';
import type {
  BackupArchiveResult,
  DecryptedLocalBackup,
  EncryptedLocalBackupHeader,
} from './types';

export const ENCRYPTED_BACKUP_MAGIC = Buffer.from('ZIWEIBACKUPX1\n', 'ascii');

const HEADER_LENGTH_BYTES = 4;
const MAX_HEADER_BYTES = 8 * 1024;
const MAX_ENCRYPTED_ARCHIVE_BYTES = 130 * 1024 * 1024;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export async function createEncryptedLocalBackupArchive(password: string): Promise<BackupArchiveResult> {
  const normalizedPassword = validateEncryptedBackupPassword(password);
  const inner = await createLocalBackupArchive();
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const header: EncryptedLocalBackupHeader = {
    kind: ENCRYPTED_LOCAL_BACKUP_KIND,
    formatVersion: ENCRYPTED_LOCAL_BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    cipher: {
      name: 'aes-256-gcm',
      iv: iv.toString('base64'),
      authTagLength: AUTH_TAG_BYTES,
    },
    kdf: {
      name: 'scrypt',
      salt: salt.toString('base64'),
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      keyLength: KEY_BYTES,
    },
    inner: {
      kind: LOCAL_BACKUP_KIND,
      formatVersion: LOCAL_BACKUP_FORMAT_VERSION,
      fileName: inner.fileName,
      byteSize: inner.buffer.length,
      sha256: digest(inner.buffer),
    },
  };
  const headerBuffer = Buffer.from(JSON.stringify(header), 'utf8');
  const key = await deriveKey(normalizedPassword, salt);
  let ciphertext: Buffer;
  let authTag: Buffer;
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_BYTES });
    cipher.setAAD(headerBuffer);
    ciphertext = Buffer.concat([cipher.update(inner.buffer), cipher.final()]);
    authTag = cipher.getAuthTag();
  } finally {
    key.fill(0);
  }
  const headerLength = Buffer.alloc(HEADER_LENGTH_BYTES);
  headerLength.writeUInt32BE(headerBuffer.length);
  const buffer = Buffer.concat([
    ENCRYPTED_BACKUP_MAGIC,
    headerLength,
    headerBuffer,
    ciphertext,
    authTag,
  ]);
  const fileName = `紫微命盘加密备份-${fileTimestamp(header.createdAt)}${ENCRYPTED_LOCAL_BACKUP_EXTENSION}`;
  return { buffer, fileName, preview: { ...inner.preview, fileName } };
}

export async function decryptEncryptedLocalBackupArchive(
  archive: Buffer,
  password: string,
): Promise<DecryptedLocalBackup> {
  if (!isEncryptedLocalBackupArchive(archive)) {
    throw new BackupValidationError('文件不是有效的加密备份包', 'ENCRYPTED_BACKUP_MAGIC_INVALID');
  }
  if (archive.length > MAX_ENCRYPTED_ARCHIVE_BYTES) {
    throw new BackupValidationError('加密备份文件超过 130 MB 上限', 'ENCRYPTED_BACKUP_TOO_LARGE');
  }
  const normalizedPassword = validateEncryptedBackupPassword(password);
  const lengthOffset = ENCRYPTED_BACKUP_MAGIC.length;
  if (archive.length < lengthOffset + HEADER_LENGTH_BYTES + AUTH_TAG_BYTES) {
    throw new BackupValidationError('加密备份包结构不完整', 'ENCRYPTED_BACKUP_TRUNCATED');
  }
  const headerLength = archive.readUInt32BE(lengthOffset);
  if (headerLength < 1 || headerLength > MAX_HEADER_BYTES) {
    throw new BackupValidationError('加密备份头长度无效', 'ENCRYPTED_BACKUP_HEADER_LENGTH_INVALID');
  }
  const headerStart = lengthOffset + HEADER_LENGTH_BYTES;
  const ciphertextStart = headerStart + headerLength;
  const authTagStart = archive.length - AUTH_TAG_BYTES;
  if (ciphertextStart >= authTagStart) {
    throw new BackupValidationError('加密备份包缺少密文', 'ENCRYPTED_BACKUP_CIPHERTEXT_MISSING');
  }
  const headerBuffer = archive.subarray(headerStart, ciphertextStart);
  let header: EncryptedLocalBackupHeader;
  try {
    header = JSON.parse(headerBuffer.toString('utf8')) as EncryptedLocalBackupHeader;
  } catch {
    throw new BackupValidationError('加密备份头不是有效 JSON', 'ENCRYPTED_BACKUP_HEADER_JSON_INVALID');
  }
  validateHeader(header);
  const ciphertext = archive.subarray(ciphertextStart, authTagStart);
  if (ciphertext.length !== header.inner.byteSize) {
    throw new BackupValidationError('加密备份密文长度与清单不一致', 'ENCRYPTED_BACKUP_CIPHERTEXT_SIZE_MISMATCH');
  }
  const salt = decodeExactBase64(header.kdf.salt, SALT_BYTES, '密码盐');
  const iv = decodeExactBase64(header.cipher.iv, IV_BYTES, '初始化向量');
  const authTag = archive.subarray(authTagStart);
  const key = await deriveKey(normalizedPassword, salt);
  let plaintext: Buffer;
  try {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_BYTES });
      decipher.setAAD(headerBuffer);
      decipher.setAuthTag(authTag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new BackupValidationError('密码错误或加密备份已被修改，无法解密', 'ENCRYPTED_BACKUP_AUTH_FAILED');
    }
  } finally {
    key.fill(0);
  }
  if (plaintext.length !== header.inner.byteSize || digest(plaintext) !== header.inner.sha256) {
    throw new BackupValidationError('解密后的备份内容校验失败', 'ENCRYPTED_BACKUP_INNER_DIGEST_MISMATCH');
  }
  return {
    buffer: plaintext,
    fileName: header.inner.fileName,
    encryptedCreatedAt: header.createdAt,
  };
}

export function isEncryptedLocalBackupArchive(archive: Buffer): boolean {
  return archive.length >= ENCRYPTED_BACKUP_MAGIC.length
    && archive.subarray(0, ENCRYPTED_BACKUP_MAGIC.length).equals(ENCRYPTED_BACKUP_MAGIC);
}

export function validateEncryptedBackupPassword(password: string): string {
  const normalized = typeof password === 'string' ? password.normalize('NFC') : '';
  const characterCount = [...normalized].length;
  const byteLength = Buffer.byteLength(normalized, 'utf8');
  if (characterCount < ENCRYPTED_LOCAL_BACKUP_MIN_PASSWORD_LENGTH) {
    throw new BackupValidationError(
      `加密密码至少需要 ${ENCRYPTED_LOCAL_BACKUP_MIN_PASSWORD_LENGTH} 个字符`,
      'ENCRYPTED_BACKUP_PASSWORD_TOO_SHORT',
    );
  }
  if (characterCount > 256 || byteLength > 1_024) {
    throw new BackupValidationError('加密密码过长，请控制在 256 个字符以内', 'ENCRYPTED_BACKUP_PASSWORD_TOO_LONG');
  }
  return normalized;
}

function validateHeader(value: EncryptedLocalBackupHeader): void {
  if (!value || typeof value !== 'object' || value.kind !== ENCRYPTED_LOCAL_BACKUP_KIND) {
    throw new BackupValidationError('加密备份包类型不受支持', 'ENCRYPTED_BACKUP_KIND_UNSUPPORTED');
  }
  if (value.formatVersion !== ENCRYPTED_LOCAL_BACKUP_FORMAT_VERSION) {
    throw new BackupValidationError(`加密备份格式版本 ${String(value.formatVersion)} 不受支持`, 'ENCRYPTED_BACKUP_FORMAT_INCOMPATIBLE');
  }
  if (!Number.isFinite(Date.parse(value.createdAt))) {
    throw new BackupValidationError('加密备份创建时间无效', 'ENCRYPTED_BACKUP_CREATED_AT_INVALID');
  }
  if (
    value.cipher?.name !== 'aes-256-gcm'
    || value.cipher.authTagLength !== AUTH_TAG_BYTES
  ) {
    throw new BackupValidationError('加密算法参数不受支持', 'ENCRYPTED_BACKUP_CIPHER_UNSUPPORTED');
  }
  if (
    value.kdf?.name !== 'scrypt'
    || value.kdf.N !== SCRYPT_N
    || value.kdf.r !== SCRYPT_R
    || value.kdf.p !== SCRYPT_P
    || value.kdf.keyLength !== KEY_BYTES
  ) {
    throw new BackupValidationError('密钥派生参数不受支持', 'ENCRYPTED_BACKUP_KDF_UNSUPPORTED');
  }
  if (
    value.inner?.kind !== LOCAL_BACKUP_KIND
    || value.inner.formatVersion !== LOCAL_BACKUP_FORMAT_VERSION
    || path.basename(value.inner.fileName) !== value.inner.fileName
    || !value.inner.fileName.endsWith(LOCAL_BACKUP_EXTENSION)
    || !Number.isSafeInteger(value.inner.byteSize)
    || value.inner.byteSize < 1
    || value.inner.byteSize > 128 * 1024 * 1024
    || !/^[0-9a-f]{64}$/.test(value.inner.sha256)
  ) {
    throw new BackupValidationError('加密备份内层清单无效', 'ENCRYPTED_BACKUP_INNER_MANIFEST_INVALID');
  }
  decodeExactBase64(value.kdf.salt, SALT_BYTES, '密码盐');
  decodeExactBase64(value.cipher.iv, IV_BYTES, '初始化向量');
}

function decodeExactBase64(value: string, expectedBytes: number, label: string): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new BackupValidationError(`${label}编码无效`, 'ENCRYPTED_BACKUP_BASE64_INVALID');
  }
  const buffer = Buffer.from(value, 'base64');
  if (buffer.length !== expectedBytes || buffer.toString('base64') !== value) {
    throw new BackupValidationError(`${label}长度无效`, 'ENCRYPTED_BACKUP_PARAMETER_LENGTH_INVALID');
  }
  return buffer;
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(Buffer.from(password, 'utf8'), salt, KEY_BYTES, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAX_MEMORY,
    }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function digest(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function fileTimestamp(value: string): string {
  return value.replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '');
}
