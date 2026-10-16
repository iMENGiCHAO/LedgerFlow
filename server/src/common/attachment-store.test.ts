/**
 * 附件存储抽象单测:本地驱动 roundtrip / 逻辑键格式 / 历史绝对路径兼容 /
 * 工厂默认与 S3 缺依赖时的明确报错
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalDiskStore, S3Store, createAttachmentStore } from './attachment-store';

test('存储:本地 put/get roundtrip', async () => {
  const root = mkdtempSync(join(tmpdir(), 'att-store-'));
  try {
    const store = new LocalDiskStore(root);
    const key = store.resolveKey('image/png');
    assert.match(key, /^\d{4}-\d{2}\/[0-9a-f-]{36}\.png$/, '逻辑键格式:月份目录+uuid+.png');
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await store.put(key, buf);
    const back = await store.get(key);
    assert.deepEqual(back, buf);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('存储:兼容历史物理路径记录(绝对路径直接读取)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'att-legacy-'));
  try {
    const legacyFile = join(root, 'legacy.png');
    writeFileSync(legacyFile, Buffer.from('legacy'));
    const store = new LocalDiskStore(root);
    // 历史记录存的 filePath 是物理路径(以 / 开头)
    const back = await store.get(legacyFile);
    assert.equal(back.toString(), 'legacy');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('存储:工厂默认为本地驱动', () => {
  const store = createAttachmentStore();
  assert.equal(store.driver, 'local');
});

test('存储:resolveKey 扩展名映射(pdf/jpg/未知)', () => {
  const store = new LocalDiskStore('./uploads');
  assert.ok(store.resolveKey('application/pdf').endsWith('.pdf'));
  assert.ok(store.resolveKey('image/jpeg').endsWith('.jpg'));
  assert.ok(store.resolveKey('application/zip').endsWith('.bin'));
});

test('存储:S3 驱动未安装 SDK 时给出明确部署指引', async () => {
  const s3 = new S3Store('bucket', {});
  await assert.rejects(
    () => s3.put('2026-10/x.png', Buffer.from('x')),
    /@aws-sdk\/client-s3/,
  );
});
