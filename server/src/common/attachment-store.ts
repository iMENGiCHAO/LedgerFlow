/**
 * 附件存储抽象:统一 put/get,支持本地磁盘与 S3 两种驱动。
 *
 * - 键(key)为逻辑路径,形如 "2026-10/<uuid>.png",不含物理根目录;
 *   换存储后端时数据库记录保持有效。
 * - LocalDiskStore 兼容历史绝对路径记录(直接按原路径读取)。
 * - S3Store 通过运行时动态 require @aws-sdk/client-s3 启用;
 *   未安装时给出明确部署指引。
 *
 * 环境变量:
 *   ATTACHMENT_DRIVER = local(默认) | s3
 *   ATTACHMENT_ROOT   = ./uploads(本地驱动根目录)
 *   S3_ENDPOINT / S3_BUCKET / S3_REGION / S3_ACCESS_KEY / S3_SECRET
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export interface AttachmentStore {
  readonly driver: string;
  /** 生成逻辑键(月份目录 + uuid + 扩展名) */
  resolveKey(contentType: string, at?: Date): string;
  put(key: string, buffer: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

const EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
};

function extOf(contentType: string): string {
  return EXT_BY_TYPE[contentType] || '.bin';
}

/** 本地磁盘驱动(默认):写入 <root>/<key>,读取兼容历史绝对路径 */
export class LocalDiskStore implements AttachmentStore {
  readonly driver = 'local';
  constructor(private readonly root: string) {}

  resolveKey(contentType: string, at = new Date()): string {
    return `${at.toISOString().slice(0, 7)}/${randomUUID()}${extOf(contentType)}`;
  }

  async put(key: string, buffer: Buffer): Promise<void> {
    const full = join(this.root, key);
    const dir = join(full, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(full, buffer);
  }

  async get(key: string): Promise<Buffer> {
    // 历史记录可能是绝对/相对物理路径(以盘符、/、./ 开头):直接按原路径读取
    if (key.startsWith('/') || key.startsWith('./') || /^[A-Za-z]:[\\/]/.test(key)) {
      return readFileSync(key);
    }
    return readFileSync(join(this.root, key));
  }
}

/** S3 兼容对象存储驱动:依赖可选安装的 @aws-sdk/client-s3 */
export class S3Store implements AttachmentStore {
  readonly driver = 's3';
  private client: any = null;

  constructor(
    private readonly bucket: string,
    private readonly env: { endpoint?: string; region?: string; accessKey?: string; secret?: string },
  ) {}

  private async sdk(): Promise<any> {
    if (this.client) return this.client;
    let mod: any;
    try {
      // 动态加载可选依赖:未安装 S3 SDK 时给出明确部署指引
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      mod = require('@aws-sdk/client-s3');
    } catch {
      throw new Error('S3 驱动需要安装 @aws-sdk/client-s3(pnpm add @aws-sdk/client-s3)并配置 S3_* 环境变量');
    }
    this.client = new mod.S3Client({
      ...(this.env.endpoint ? { endpoint: this.env.endpoint, forcePathStyle: true } : {}),
      ...(this.env.region ? { region: this.env.region } : {}),
      ...(this.env.accessKey && this.env.secret
        ? { credentials: { accessKeyId: this.env.accessKey, secretAccessKey: this.env.secret } }
        : {}),
    });
    this.mod = mod;
    return this.client;
  }
  private mod: any = null;

  resolveKey(contentType: string, at = new Date()): string {
    return `${at.toISOString().slice(0, 7)}/${randomUUID()}${extOf(contentType)}`;
  }

  async put(key: string, buffer: Buffer): Promise<void> {
    const client = await this.sdk();
    await client.send(new this.mod.PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer }));
  }

  async get(key: string): Promise<Buffer> {
    const client = await this.sdk();
    const out = await client.send(new this.mod.GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await out.Body.transformToByteArray();
    return Buffer.from(bytes);
  }
}

/** 按环境变量构造存储驱动;默认本地磁盘 */
export function createAttachmentStore(): AttachmentStore {
  const driver = (process.env.ATTACHMENT_DRIVER || 'local').toLowerCase();
  if (driver === 's3') {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error('ATTACHMENT_DRIVER=s3 时必须配置 S3_BUCKET');
    return new S3Store(bucket, {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      accessKey: process.env.S3_ACCESS_KEY,
      secret: process.env.S3_SECRET,
    });
  }
  return new LocalDiskStore(process.env.ATTACHMENT_ROOT || process.env.UPLOAD_DIR || './uploads');
}
