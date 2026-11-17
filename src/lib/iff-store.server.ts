import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import pg from 'pg';

const schema = `
  CREATE TABLE IF NOT EXISTS iff_submissions (
    id UUID PRIMARY KEY, kind TEXT NOT NULL, received_at TEXT NOT NULL,
    fields JSONB NOT NULL, attachment_name TEXT, attachment BYTEA
  );
  ALTER TABLE iff_submissions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
  ALTER TABLE iff_submissions ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT '';
  ALTER TABLE iff_submissions ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
  ALTER TABLE iff_submissions ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX IF NOT EXISTS iff_submissions_recent ON iff_submissions(received_at DESC, id DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS iff_newsletter_email ON iff_submissions((fields->>'email'))
    WHERE kind = 'newsletter';
  CREATE TABLE IF NOT EXISTS iff_publications (
    id UUID PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL,
    body TEXT NOT NULL, url TEXT NOT NULL, status TEXT NOT NULL,
    updated_at TEXT NOT NULL, published_at TEXT
  );
  CREATE INDEX IF NOT EXISTS iff_publications_recent ON iff_publications(status, published_at DESC);
  CREATE TABLE IF NOT EXISTS iff_cms_records (
    collection TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(collection, id)
  );
  CREATE TABLE IF NOT EXISTS iff_media (
    id UUID PRIMARY KEY, kind TEXT NOT NULL, label TEXT NOT NULL, filename TEXT NOT NULL,
    mime TEXT NOT NULL, content BYTEA NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS iff_editor_users (
    id UUID PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    role TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE
  );
  ALTER TABLE iff_editor_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE iff_submissions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE iff_publications ENABLE ROW LEVEL SECURITY;
  ALTER TABLE iff_cms_records ENABLE ROW LEVEL SECURITY;
  ALTER TABLE iff_media ENABLE ROW LEVEL SECURITY;
  ALTER TABLE iff_editor_users ENABLE ROW LEVEL SECURITY;
`;

type Query = <Row extends object>(sql: string, values?: unknown[]) => Promise<{ rows: Row[]; affected: number }>;
let database: Promise<Query> | undefined;

async function connect(): Promise<Query> {
  const vercel = process.env['VERCEL'] === '1';
  const url = process.env['IFF_DATABASE_URL'] || (vercel ? process.env['POSTGRES_URL'] || process.env['DATABASE_URL'] : undefined);
  if (!url) {
    const localPath = process.env['IFF_LOCAL_DB'];
    if (!localPath && process.env['NODE_ENV'] === 'production') throw new Error('IFF_DATABASE_URL is required.');
    const { PGlite } = createRequire(import.meta.url)('@electric-sql/pglite') as typeof import('@electric-sql/pglite');
    const local = new PGlite(localPath || '.iff-data');
    await local.exec(schema);
    return async (sql, values) => {
      const result = await local.query(sql, values);
      return { rows: result.rows as never[], affected: result.affectedRows ?? 0 };
    };
  }

  const caFile = process.env['IFF_DATABASE_CA_FILE'];
  if (process.env['NODE_ENV'] === 'production' && !caFile && !vercel) throw new Error('IFF_DATABASE_CA_FILE is required.');
  const parsed = new URL(url);
  const sslParameters = ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl'];
  if (caFile && sslParameters.some(name => parsed.searchParams.has(name))) {
    throw new Error('Configure PostgreSQL TLS with IFF_DATABASE_CA_FILE only.');
  }
  const enableChannelBinding = parsed.searchParams.get('channel_binding') === 'require';
  if (vercel && !caFile) for (const name of sslParameters) parsed.searchParams.delete(name);
  const ssl = caFile ? { ca: readFileSync(caFile, 'utf8'), rejectUnauthorized: true }
    : vercel ? { rejectUnauthorized: true } : undefined;
  const pool = new pg.Pool({ connectionString: parsed.toString(), max: vercel ? 2 : 5, connectionTimeoutMillis: 8000,
    ssl, enableChannelBinding });
  pool.on('error', error => console.error('IFF database connection closed', error.message));
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(40677319)');
      await client.query(schema);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    await pool.end();
    throw error;
  }
  return async (sql, values) => {
    const result = await pool.query(sql, values);
    return { rows: result.rows, affected: result.rowCount ?? 0 };
  };
}

export const query: Query = async (sql, values) => {
  database ??= connect().catch(error => {
    database = undefined;
    throw error;
  });
  return (await database)(sql, values);
};
