import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { query } from './iff-store.server';
import {
  authenticateStaff, cmsCollection, cmsSettings, CmsError, findStaffSession, library,
  mediaResponse, saveBranding, saveCmsRecord, saveMedia, savePagePhotos, saveStaffAccount, staffAccounts,
} from './iff-cms.server';
import {
  inboxKinds, inboxStatuses, inboxUpdateSchema, publicationSchema, submissionSchema,
  type InboxEntry, type InboxUpdate, type Publication,
} from './submissions';
import { maxMediaBytes, maxResumeBytes, maxResumeMb } from './upload-limits';

const sessionCookie = 'iff_editor_session';
const sessionSeconds = 8 * 60 * 60;
const pageSize = 50;
const exportLimit = 5000;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
let loginWindow = 0;
let failedLogins = 0;

const publicationColumns = 'id, type, title, summary, body, url, status, published_at AS "publishedAt"';

export async function publishedPublications() {
  const { rows } = await query<Publication>(`SELECT ${publicationColumns} FROM iff_publications
    WHERE status = 'published' ORDER BY published_at DESC, id DESC`);
  return rows;
}

export async function publishedPublication(id: string) {
  if (!uuid.test(id)) return undefined;
  const { rows } = await query<Publication>(`SELECT ${publicationColumns} FROM iff_publications
    WHERE id = $1 AND status = 'published'`, [id]);
  return rows[0];
}

async function adminPublications() {
  const { rows } = await query<Publication>(`SELECT ${publicationColumns} FROM iff_publications
    ORDER BY updated_at DESC, id DESC`);
  return rows;
}

function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

class InvalidRequest extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

async function boundedBody(request: Request, maxBytes: number) {
  if (Number(request.headers.get('content-length')) > maxBytes) {
    throw new InvalidRequest('The submission is too large.', 413);
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new InvalidRequest('The submission is too large.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader?.releaseLock();
  }
  return new Response(Buffer.concat(chunks), {
    headers: { 'Content-Type': request.headers.get('content-type') || '' },
  });
}

async function readJson(request: Request, maxBytes: number) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new InvalidRequest('Use a JSON request.', 415);
  }
  const body = await boundedBody(request, maxBytes);
  return body.json().catch(() => { throw new InvalidRequest('Invalid JSON.'); });
}

function safeEqual(first: string, second: string) {
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(value: string, password: string) {
  return createHmac('sha256', password).update(value).digest('base64url');
}

function cookie(value: string, request: Request, maxAge: number) {
  const secure = new URL(process.env['IFF_PUBLIC_ORIGIN'] || request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionCookie}=${value}; HttpOnly; SameSite=Strict; Path=/api/iff/admin; Max-Age=${maxAge}${secure}`;
}

async function authenticated(request: Request, password: string) {
  const token = request.headers.get('cookie')?.split('; ').find(value => value.startsWith(`${sessionCookie}=`));
  const value = token?.slice(sessionCookie.length + 1) || '';
  const [expires, id, version, nonce, signature] = value.split('.');
  if (!id || !version || !nonce || !signature || !(Number(expires) > Date.now()) ||
      !safeEqual(signature, sign(`${expires}.${id}.${version}.${nonce}`, password))) return undefined;
  if (id === 'owner') return { name: 'Site administrator', role: 'admin' as const };
  return findStaffSession(id, Number(version));
}

async function saveSubmission(request: Request) {
  const body = await boundedBody(request, maxResumeBytes + 32_768);
  const data = await body.formData().catch(() => { throw new InvalidRequest('Invalid form submission.'); });
  const result = submissionSchema.safeParse(Object.fromEntries(data));
  if (!result.success) throw new InvalidRequest('Check the required fields and try again.');
  const { kind, ...fields } = result.data;
  const resume = data.get('resume');
  if (kind === 'career' && (!(resume instanceof File) || !resume.size || resume.size > maxResumeBytes ||
    !/\.(pdf|docx?)$/i.test(resume.name) || resume.name.length > 200)) {
    throw new InvalidRequest(`Upload a PDF, DOC or DOCX résumé up to ${maxResumeMb} MB.`);
  }
  const attachment = kind === 'career' && resume instanceof File ? resume : null;
  const savedFields = result.data.kind === 'newsletter' ? { email: result.data.email.toLowerCase() } : fields;
  const inboxKind = result.data.kind === 'contact' && result.data.topic === 'Membership' ? 'membership' : kind;
  await query(`INSERT INTO iff_submissions (id, kind, received_at, fields, attachment_name, attachment)
    VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`, [
    randomUUID(), inboxKind, new Date().toISOString(), JSON.stringify(savedFields),
    attachment?.name ?? null, attachment ? Buffer.from(await attachment.arrayBuffer()) : null,
  ]);
  return json({ ok: true }, 201);
}

async function login(request: Request, password: string) {
  const now = Date.now();
  if (now >= loginWindow) {
    loginWindow = now + 300_000;
    failedLogins = 0;
  }
  if (failedLogins >= 10) throw new InvalidRequest('Try again in a few minutes.', 429);
  const data = await readJson(request, 4096);
  if (typeof data?.password !== 'string' || data.password.length > 200) throw new InvalidRequest('Enter a password.');
  failedLogins += 1;
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  const user = email ? await authenticateStaff(email, data.password) : undefined;
  if (email ? !user : !safeEqual(sign(data.password, password), sign(password, password))) {
    throw new InvalidRequest('Incorrect email or password.', 401);
  }
  failedLogins = 0;
  const token = `${now + sessionSeconds * 1000}.${user?.id ?? 'owner'}.${user?.session_version ?? 0}.${randomUUID()}`;
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(`${token}.${sign(token, password)}`, request, sessionSeconds) });
}

async function listInbox(url: URL, exporting: boolean) {
  const page = exporting ? 0 : Number(url.searchParams.get('page') ?? '0');
  const kind = url.searchParams.get('kind') || '';
  const status = url.searchParams.get('status') || '';
  const search = url.searchParams.get('q')?.trim() || '';
  const excludeNewsletter = url.searchParams.get('scope') === 'enquiries';
  if (!Number.isSafeInteger(page) || page < 0 || page > 1_000_000 || search.length > 120 ||
      (kind && !Object.hasOwn(inboxKinds, kind)) || (status && !Object.hasOwn(inboxStatuses, status))) {
    throw new InvalidRequest('Check the inbox filters.');
  }
  const limit = exporting ? exportLimit : pageSize;
  const { rows } = await query<InboxEntry>(`SELECT id, kind, received_at AS "receivedAt", fields,
    attachment_name AS "attachmentName", status, owner, notes, revision
    FROM iff_submissions
    WHERE ($1 = '' OR kind = $1) AND ($2 = '' OR status = $2)
      AND ($3 = '' OR strpos(lower(concat_ws(' ', fields->>'name', fields->>'email',
        fields->>'organisation', owner, notes)), lower($3)) > 0)
      AND (NOT $6::boolean OR kind <> 'newsletter')
    ORDER BY received_at DESC, id DESC LIMIT $4 OFFSET $5`, [kind, status, search, limit + 1, page * limit, excludeNewsletter]);

  if (!exporting) return json({ entries: rows.slice(0, limit), hasNext: rows.length > limit });
  if (rows.length > limit) throw new InvalidRequest('Narrow the inbox filters to export up to 5,000 submissions.');
  const fields = ['name', 'email', 'organisation', 'topic', 'designation', 'linkedin', 'expertise', 'experience', 'message'];
  const headers = ['ID', 'Received at (UTC)', 'Type', 'Status', 'Owner', 'Internal notes',
    'Name', 'Email', 'Organisation', 'Topic', 'Designation', 'LinkedIn', 'Expertise', 'Experience', 'Message', 'Attachment'];
  const data = [headers, ...rows.map(row => [row.id, row.receivedAt, inboxKinds[row.kind],
    inboxStatuses[row.status], row.owner, row.notes, ...fields.map(field => row.fields[field] ?? ''), row.attachmentName ?? ''])];
  const csv = data.map(row => row.map(csvCell).join(',')).join('\r\n');
  return new Response(`\uFEFF${csv}\r\n`, { headers: {
    'Cache-Control': 'no-store', 'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="iff-submissions.csv"', 'X-Content-Type-Options': 'nosniff',
  } });
}

function csvCell(value: string) {
  const safe = /^\s*[=+\-@＝＋－＠]|^[\t\r\n]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

async function updateInboxEntry(request: Request, id: string) {
  if (!uuid.test(id)) throw new InvalidRequest('Submission not found.', 404);
  const parsed = inboxUpdateSchema.safeParse(await readJson(request, 32_768));
  if (!parsed.success) throw new InvalidRequest('Check the status, owner and notes.');
  const { status, owner, notes, revision } = parsed.data;
  const { rows } = await query<InboxUpdate>(`UPDATE iff_submissions SET status = $1, owner = $2, notes = $3,
    revision = revision + 1 WHERE id = $4 AND revision = $5 RETURNING status, owner, notes, revision`,
    [status, owner, notes, id, revision]);
  if (!rows[0]) throw new InvalidRequest('This submission changed. Refresh the inbox before saving again.', 409);
  return json(rows[0]);
}

async function editorApi(request: Request, url: URL, action: string) {
  const password = process.env['IFF_ADMIN_PASSWORD'];
  if (!password || password.length < 16) {
    throw new InvalidRequest('Set an editor password of at least 16 characters on the server.', 503);
  }
  if (request.method === 'POST' && action === 'login') return login(request, password);
  const user = await authenticated(request, password);
  if (!user) throw new InvalidRequest('Sign in to the editor.', 401);
  if (request.method === 'GET' && action === 'session') return json({ name: user.name, role: user.role });

  if (request.method === 'POST' && action === 'logout') {
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', request, 0) });
  }
  if (action === 'site/events' || action === 'site/leadership' || action === 'site/volunteers') {
    const collection = action.split('/')[1] as 'events' | 'leadership' | 'volunteers';
    if (request.method === 'GET') return json(await cmsCollection(collection));
    if (request.method === 'POST') return json(await saveCmsRecord(collection, await readJson(request, 16_384)));
  }
  if (request.method === 'GET' && action === 'site/settings') return json(await cmsSettings());
  if (request.method === 'POST' && action === 'site/branding') {
    await saveBranding(await readJson(request, 24_576));
    return json({ ok: true });
  }
  if (request.method === 'POST' && action === 'site/pages') {
    await savePagePhotos(await readJson(request, 8192));
    return json({ ok: true });
  }
  if (request.method === 'GET' && action === 'site/library') return json(await library());
  if (request.method === 'POST' && action === 'site/library') {
    const body = await boundedBody(request, maxMediaBytes + 32_768);
    const data = await body.formData().catch(() => { throw new InvalidRequest('Choose a file to upload.'); });
    return json(await saveMedia(data), 201);
  }
  if (action === 'site/users') {
    if (user.role !== 'admin') throw new InvalidRequest('Administrator access is required.', 403);
    if (request.method === 'GET') return json(await staffAccounts());
    if (request.method === 'POST') {
      await saveStaffAccount(await readJson(request, 8192));
      return json({ ok: true });
    }
  }
  if (request.method === 'GET' && (action === 'inbox' || action === 'inbox.csv')) {
    return listInbox(url, action === 'inbox.csv');
  }
  if (request.method === 'POST' && action.startsWith('inbox/')) {
    return updateInboxEntry(request, action.slice('inbox/'.length));
  }
  if (request.method === 'GET' && action.startsWith('resume/')) {
    const id = action.slice('resume/'.length);
    if (!uuid.test(id)) throw new InvalidRequest('Résumé unavailable.', 404);
    const { rows: [item] } = await query<{ attachment: Uint8Array; attachment_name: string }>(
      'SELECT attachment, attachment_name FROM iff_submissions WHERE id = $1', [id]);
    if (!(item?.attachment instanceof Uint8Array) || typeof item.attachment_name !== 'string') {
      throw new InvalidRequest('Résumé unavailable.', 404);
    }
    const filename = encodeURIComponent(item.attachment_name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`);
    return new Response(Buffer.from(item.attachment), { headers: {
      'Cache-Control': 'no-store', 'Content-Type': 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    } });
  }
  if (request.method === 'GET' && action === 'publications') return json(await adminPublications());
  if (request.method === 'POST' && (action === 'publications' || action.startsWith('publications/'))) {
    const parsed = publicationSchema.safeParse(await readJson(request, 192_000));
    if (!parsed.success) throw new InvalidRequest(parsed.error.issues[0]?.message || 'Check the publication fields.');
    const post = parsed.data;
    const now = new Date().toISOString();
    const id = action === 'publications' ? randomUUID() : action.slice('publications/'.length);
    const publishedAt = post.status === 'published' ? now : null;
    if (action === 'publications') {
      await query(`INSERT INTO iff_publications (id, type, title, summary, body, url, status, updated_at, published_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, post.type, post.title, post.summary, post.body, post.url, post.status, now, publishedAt]);
    } else {
      if (!uuid.test(id)) throw new InvalidRequest('Publication no longer exists.', 404);
      const { affected } = await query(`UPDATE iff_publications SET type = $1, title = $2, summary = $3, body = $4, url = $5,
        status = $6, updated_at = $7, published_at = CASE WHEN $8::text IS NULL THEN NULL ELSE COALESCE(published_at, $8) END
        WHERE id = $9`, [post.type, post.title, post.summary, post.body, post.url, post.status, now, publishedAt, id]);
      if (!affected) throw new InvalidRequest('Publication no longer exists.', 404);
    }
    return json({ id });
  }
  throw new InvalidRequest('Page not found.', 404);
}

export async function handleIffApi(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.slice('/api/iff/'.length);
  try {
    const origin = process.env['IFF_PUBLIC_ORIGIN'] || url.origin;
    if ((request.method === 'GET' || request.method === 'HEAD') && path.startsWith('media/')) {
      return await mediaResponse(path.slice('media/'.length), request.method === 'HEAD');
    }
    if (request.method !== 'GET' && request.headers.get('origin') !== origin) {
      throw new InvalidRequest('Submit this request from the IFF website.', 403);
    }
    if (request.method === 'GET' && path === 'health') {
      await query('SELECT 1');
      return json({ ok: true });
    }
    if (request.method === 'POST' && path === 'submissions') return await saveSubmission(request);
    if (path.startsWith('admin/')) return await editorApi(request, url, path.slice('admin/'.length));
    throw new InvalidRequest('Page not found.', 404);
  } catch (error) {
    if (error instanceof InvalidRequest || error instanceof CmsError) return json({ error: error.message }, error.status);
    console.error('IFF request failed', error);
    return json({ error: 'The request could not be saved or loaded. Try again.' }, 500);
  }
}
