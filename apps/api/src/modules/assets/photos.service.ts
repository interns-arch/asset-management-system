import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Actor } from '../../common/actor';
import { badRequest, notFound } from '../../common/http';
import { DbService } from '../../db/db.service';
import { allocationPhotos, allocations, assets, PHOTO_KINDS } from '../../db/schema';
import { HistoryService } from '../../core/history.service';

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTOS_PER_UPLOAD = 6;

export interface UploadedPhoto {
  buffer: Buffer;
  size: number;
}

type PhotoKind = (typeof PHOTO_KINDS)[number];

export const uploadDir = () => process.env.UPLOAD_DIR ?? path.resolve(__dirname, '../../../../../.data/uploads');

/** Identifies the image from its bytes; the browser-supplied MIME type is not trusted. */
function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

@Injectable()
export class PhotosService {
  constructor(
    private readonly dbs: DbService,
    private readonly history: HistoryService,
  ) {}

  async upload(actor: Actor, assetId: string, allocationId: string | undefined, kind: string | undefined, files: UploadedPhoto[] | undefined) {
    if (!files?.length) throw badRequest('Choose at least one photo', { photos: 'Required' });
    if (!PHOTO_KINDS.includes(kind as PhotoKind)) throw badRequest('Photo kind must be HANDOVER or RETURN', { kind: 'Invalid' });
    if (!allocationId) throw badRequest('allocationId is required', { allocationId: 'Required' });
    const detected = files.map((f) => sniff(f.buffer));
    if (detected.some((d) => !d)) throw badRequest('Only JPEG, PNG or WebP photos can be uploaded', { photos: 'Not an image' });

    const db = this.dbs.db;
    const [row] = await db
      .select({ alloc: allocations, assetTag: assets.assetTag, assetName: assets.name })
      .from(allocations)
      .innerJoin(assets, eq(assets.id, allocations.assetId))
      .where(and(eq(allocations.id, allocationId), eq(allocations.assetId, assetId)));
    if (!row) throw notFound('Assignment');

    const dir = uploadDir();
    await mkdir(dir, { recursive: true });
    const saved: (typeof allocationPhotos.$inferInsert)[] = [];
    for (let i = 0; i < files.length; i++) {
      const type = detected[i]!;
      const fileName = `${randomUUID()}.${type.ext}`;
      await writeFile(path.join(dir, fileName), files[i].buffer);
      saved.push({ assetId, allocationId, kind: kind as PhotoKind, fileName, mimeType: type.mime, sizeBytes: files[i].size, uploadedBy: actor.userId, uploadedByName: actor.name });
    }
    const inserted = await db.insert(allocationPhotos).values(saved).returning();
    await this.history.record(actor, {
      entityType: 'ASSET',
      entityId: assetId,
      entityLabel: `${row.assetTag} · ${row.assetName}`,
      action: kind === 'HANDOVER' ? 'HANDOVER_PHOTOS' : 'RETURN_PHOTOS',
      summary: `${inserted.length} ${kind === 'HANDOVER' ? 'handover' : 'return'} photo${inserted.length > 1 ? 's' : ''} saved (${row.alloc.holderName})`,
      employeeId: row.alloc.employeeId,
      metadata: { allocationId, photoIds: inserted.map((p) => p.id) },
    });
    return inserted.map(publicPhoto);
  }

  async forAllocations(ids: string[]) {
    if (!ids.length) return new Map<string, ReturnType<typeof publicPhoto>[]>();
    const rows = await this.dbs.db.select().from(allocationPhotos).where(inArray(allocationPhotos.allocationId, ids)).orderBy(asc(allocationPhotos.createdAt));
    const map = new Map<string, ReturnType<typeof publicPhoto>[]>();
    for (const r of rows) map.set(r.allocationId, [...(map.get(r.allocationId) ?? []), publicPhoto(r)]);
    return map;
  }

  async withPhotos<T extends { id: string }>(allocs: T[]) {
    const map = await this.forAllocations(allocs.map((a) => a.id));
    return allocs.map((a) => ({ ...a, photos: map.get(a.id) ?? [] }));
  }

  async file(assetId: string, photoId: string) {
    const [photo] = await this.dbs.db
      .select()
      .from(allocationPhotos)
      .where(and(eq(allocationPhotos.id, photoId), eq(allocationPhotos.assetId, assetId)));
    if (!photo) throw notFound('Photo');
    return { path: path.join(uploadDir(), photo.fileName), mimeType: photo.mimeType };
  }
}

function publicPhoto(p: typeof allocationPhotos.$inferSelect) {
  return { id: p.id, assetId: p.assetId, allocationId: p.allocationId, kind: p.kind, uploadedByName: p.uploadedByName, createdAt: p.createdAt };
}
