import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  baselineEvents, baselineLeadership, defaultBranding, eventCategories, pagePhotoSlots,
  type Branding, type LibraryAsset, type PagePhotographs, type PublicCms, type SiteEvent,
  type SitePerson, type StaffAccount,
} from './cms';
import { photos } from './photos';
import { query, tables } from './iff-store.server';
import { maxMediaBytes, maxMediaMb } from './upload-limits';

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const mediaPath = /^\/api\/iff\/media\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const approvedPhotos = [...new Set(Object.values(photos))];
const short = z.string().trim().min(1).max(180);
const optional = z.string().trim().max(180);
const photoUrl = z.string().refine(path => !path || approvedPhotos.includes(path) || mediaPath.test(path));
const fileUrl = z.string().refine(path => !path || mediaPath.test(path));
const websiteUrl = z.string().trim().max(2000).url().refine(value => /^https?:\/\//i.test(value)).or(z.literal(''));
const personSchema = z.object({ name: short, role: short, organisation: optional, photo: photoUrl, visible: z.boolean() });
const eventSchema = z.object({
  title: short, category: z.enum(eventCategories), summary: z.string().trim().min(1).max(1800),
  date: z.string().refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().startsWith(value))),
  location: optional, registration: websiteUrl, visible: z.boolean(), featured: z.boolean(), photo: photoUrl,
});
const photoChoice = z.object({ src: photoUrl.refine(Boolean), alt: z.string().trim().max(240) });
const pageSchema = z.object({ hero: photoChoice.optional(), footer: photoChoice.optional() });
const brandingSchema = z.object({ logo: photoUrl, brochure: fileUrl, partners: z.string().max(4000) });
const staffSchema = z.object({ name: short, email: z.string().trim().email().max(254).toLowerCase(),
  role: z.enum(['admin', 'editor']), active: z.boolean(), password: z.string().min(16).max(200).or(z.literal('')) });
const recordSchemas = { events: eventSchema, leadership: personSchema, volunteers: personSchema };
type Collection = keyof typeof recordSchemas;

export class CmsError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

async function collectionRows<T extends { id: string }>(collection: Collection, defaults: T[] = []) {
  const { rows } = await query<{ id: string; data: Omit<T, 'id'> }>(
    `SELECT id, data FROM ${tables.records} WHERE collection = $1 ORDER BY updated_at DESC, id`, [collection]);
  const managed = new Set(rows.map(row => row.id));
  return [...rows.map(({ id, data }) => ({ ...data, id } as T)), ...defaults.filter(record => !managed.has(record.id))];
}

async function setting<T extends object>(collection: string, id: string, fallback: T) {
  const { rows } = await query<{ data: T }>(`SELECT data FROM ${tables.records} WHERE collection = $1 AND id = $2`, [collection, id]);
  return rows[0]?.data ?? fallback;
}

export async function publicCms(): Promise<PublicCms> {
  const [events, leadership, volunteers, branding, pages] = await Promise.all([
    collectionRows('events', baselineEvents), collectionRows('leadership', baselineLeadership),
    collectionRows<SitePerson>('volunteers'), setting<Branding>('branding', 'site', defaultBranding),
    query<{ id: string; data: PagePhotographs[string] }>(`SELECT id, data FROM ${tables.records} WHERE collection = $1`, ['pages']),
  ]);
  return { events: events.filter(item => item.visible), leadership: leadership.filter(item => item.visible),
    volunteers: volunteers.filter(item => item.visible), branding, pages: Object.fromEntries(pages.rows.map(row => [row.id, row.data])) };
}

export async function cmsCollection(collection: Collection) {
  if (collection === 'events') return collectionRows<SiteEvent>(collection, baselineEvents);
  return collectionRows<SitePerson>(collection, collection === 'leadership' ? baselineLeadership : []);
}

async function upsert(collection: string, id: string, value: object) {
  await query(`INSERT INTO ${tables.records} (collection, id, data, updated_at) VALUES ($1, $2, $3, $4)
    ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
  [collection, id, JSON.stringify(value), new Date().toISOString()]);
}

export async function saveCmsRecord(collection: Collection, input: unknown) {
  const idResult = z.object({ id: z.string().regex(/^[a-z0-9-]{1,80}$/).optional() }).safeParse(input);
  const result = recordSchemas[collection].safeParse(input);
  if (!result.success || !idResult.success) throw new CmsError('Check the required fields and URLs.');
  const id = idResult.data.id ?? randomUUID();
  await upsert(collection, id, result.data);
  return { id };
}

export async function cmsSettings() {
  const [branding, pages] = await Promise.all([
    setting<Branding>('branding', 'site', defaultBranding),
    query<{ id: string; data: PagePhotographs[string] }>(`SELECT id, data FROM ${tables.records} WHERE collection = $1`, ['pages']),
  ]);
  return { branding, pages: Object.fromEntries(pages.rows.map(row => [row.id, row.data])) as PagePhotographs };
}

export async function saveBranding(input: unknown) {
  const result = brandingSchema.safeParse(input);
  if (!result.success) throw new CmsError('Choose a logo and brochure from their libraries.');
  await upsert('branding', 'site', result.data);
}

export async function savePagePhotos(input: unknown) {
  const result = z.object({ page: z.string(), photos: pageSchema }).safeParse(input);
  if (!result.success || !Object.hasOwn(pagePhotoSlots, result.data.page)) throw new CmsError('Choose a page and valid photographs.');
  await upsert('pages', result.data.page, result.data.photos);
}

export async function library() {
  const { rows } = await query<Omit<LibraryAsset, 'url'>>(`SELECT id, label, filename, kind AS type
    FROM ${tables.media} ORDER BY created_at DESC, id DESC`);
  return [...rows.map(item => ({ ...item, url: `/api/iff/media/${item.id}` })),
    ...approvedPhotos.map(src => ({ id: src, url: src, label: src.slice(8, -5).replaceAll('-', ' '), filename: src.slice(8), type: 'photo' as const }))];
}

const mimeTypes: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
};

export async function saveMedia(data: FormData) {
  const label = short.safeParse(data.get('label'));
  const kind = data.get('kind');
  const file = data.get('file');
  if (!label.success || (kind !== 'photo' && kind !== 'file') || !(file instanceof File) ||
      !file.size || file.size > maxMediaBytes || file.name.length > 200) throw new CmsError(`Choose a file up to ${maxMediaMb} MB and enter a title.`);
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  const mime = mimeTypes[extension];
  if (!mime || (kind === 'photo') !== mime.startsWith('image/')) throw new CmsError('Upload a JPG, PNG or WebP photo, or a PDF or audio file.');
  const content = Buffer.from(await file.arrayBuffer());
  const signatures: Record<string, boolean> = {
    'image/jpeg': content.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    'image/png': content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp': content.toString('ascii', 0, 4) === 'RIFF' && content.toString('ascii', 8, 12) === 'WEBP',
    'application/pdf': content.toString('ascii', 0, 5) === '%PDF-',
    'audio/mpeg': content.toString('ascii', 0, 3) === 'ID3' || (content[0] === 255 && ((content[1] ?? 0) & 224) === 224),
    'audio/mp4': content.toString('ascii', 4, 8) === 'ftyp',
    'audio/wav': content.toString('ascii', 0, 4) === 'RIFF' && content.toString('ascii', 8, 12) === 'WAVE',
  };
  if (!signatures[mime]) throw new CmsError('The file contents do not match its extension.');
  const id = randomUUID();
  await query(`INSERT INTO ${tables.media} (id, kind, label, filename, mime, content, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)`, [id, kind, label.data, file.name, mime, content, new Date().toISOString()]);
  return { id, url: `/api/iff/media/${id}` };
}

export async function mediaResponse(id: string, head: boolean) {
  if (!uuidPattern.test(id)) throw new CmsError('File not found.', 404);
  const { rows: [file] } = await query<{ mime: string; filename: string; content: Uint8Array }>(
    `SELECT mime, filename, content FROM ${tables.media} WHERE id = $1`, [id]);
  if (!file) throw new CmsError('File not found.', 404);
  const name = encodeURIComponent(file.filename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`);
  return new Response(head ? null : Buffer.from(file.content), { headers: {
    'Content-Type': file.mime, 'Content-Length': String(file.content.byteLength),
    'Content-Disposition': `${file.mime === 'application/pdf' ? 'attachment' : 'inline'}; filename*=UTF-8''${name}`,
    'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
  } });
}

type LoginRecord = StaffAccount & { password_hash: string; session_version: number };

function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export async function findStaffSession(id: string, version: number) {
  if (!uuidPattern.test(id) || !Number.isSafeInteger(version)) return undefined;
  const { rows } = await query<StaffAccount>(`SELECT id, name, email, role, active FROM ${tables.users}
    WHERE id = $1 AND active AND session_version = $2`, [id, version]);
  return rows[0];
}

export async function authenticateStaff(email: string, password: string) {
  const { rows: [user] } = await query<LoginRecord>(`SELECT id, password_hash, session_version FROM ${tables.users}
    WHERE email = $1 AND active`, [email.trim().toLowerCase()]);
  const stored = user?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`;
  const salt = stored.split(':')[0];
  const same = timingSafeEqual(Buffer.from(stored), Buffer.from(hashPassword(password, salt)));
  return same ? user : undefined;
}

export async function staffAccounts() {
  const { rows } = await query<StaffAccount>(`SELECT id, name, email, role, active FROM ${tables.users} ORDER BY name, email`);
  return rows;
}

export async function saveStaffAccount(input: unknown) {
  const idResult = z.object({ id: z.string().uuid().optional() }).safeParse(input);
  const result = staffSchema.safeParse(input);
  if (!result.success || !idResult.success) throw new CmsError('Enter a name, email, role and a password of at least 16 characters for new accounts.');
  const id = idResult.data.id;
  const { name, email, role, active, password } = result.data;
  const passwordHash = password ? hashPassword(password) : null;
  if (!id && !passwordHash) throw new CmsError('New users need a password of at least 16 characters.');
  try {
    if (!id) {
      await query(`INSERT INTO ${tables.users} (id, name, email, role, active, password_hash) VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), name, email, role, active, passwordHash]);
    } else {
      const { affected } = await query(`UPDATE ${tables.users} SET name = $1, email = $2, role = $3, active = $4,
        password_hash = COALESCE($5::text, password_hash),
        session_version = session_version + CASE WHEN $5::text IS NOT NULL OR active <> $4 THEN 1 ELSE 0 END
        WHERE id = $6`, [name, email, role, active, passwordHash, id]);
      if (!affected) throw new CmsError('User not found.', 404);
    }
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === '23505') {
      throw new CmsError('An account already uses that email.');
    }
    throw error;
  }
}
