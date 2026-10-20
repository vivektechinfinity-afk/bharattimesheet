/**
 * Database access layer.
 *
 * Two backends, same interface:
 *   - Real PostgreSQL via `pg` — used whenever DATABASE_URL or DB_HOST is configured.
 *   - PGlite (Postgres compiled to WASM, stored in ./.pgdata) — local-dev fallback so the
 *     portal runs with no database install. Never used when NODE_ENV=production.
 *
 * Both expose: query(text, params) -> { rows, rowCount }, connect() -> client, pool.end().
 */

const path = require('path');

const hasRealPg = Boolean(process.env.DATABASE_URL || process.env.DB_HOST);
const isProd = process.env.NODE_ENV === 'production';

if (!hasRealPg && isProd) {
  throw new Error('DATABASE_URL must be set in production — PGlite is a local-dev fallback only.');
}

let impl;

if (hasRealPg) {
  const { Pool } = require('pg');

  const connectionString =
    process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'postgres'}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'timesheet_db'}`;

  const pool = new Pool({
    connectionString,
    ssl: isProd ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  pool.on('error', (err) => console.error('Unexpected PG pool error:', err.message));

  impl = {
    mode: 'postgres',
    query: (text, params) => pool.query(text, params),
    // Multi-statement scripts (schema files). pg accepts these through query().
    exec: (sql) => pool.query(sql),
    pool,
  };
} else {
  // ---- PGlite fallback -------------------------------------------------
  // PGlite is ESM-only and async to open, so every query awaits a lazily-created
  // singleton. Queries are serialised through a promise chain because PGlite is
  // single-connection — concurrent requests would otherwise interleave inside a
  // transaction and corrupt it.
  const dataDir = process.env.PGLITE_DIR || path.join(__dirname, '.pgdata');
  let dbPromise = null;
  let chain = Promise.resolve();

  const getDb = () => {
    dbPromise ??= import('@electric-sql/pglite')
      .catch(() => {
        // PGlite is a devDependency — absent in a production install.
        throw new Error(
          'No DATABASE_URL set and PGlite is not installed. ' +
          'Set DATABASE_URL to a Postgres connection string, or run `npm install` ' +
          '(without --production) to get the local-dev fallback.'
        );
      })
      .then(async ({ PGlite }) => {
        const db = new PGlite(dataDir);
        await db.waitReady;
        console.log(`✓ PGlite (embedded Postgres) ready — data in ${dataDir}`);
        return db;
      });
    return dbPromise;
  };

  const run = (fn) => {
    const result = chain.then(fn);
    // Keep the chain alive even if this call rejects.
    chain = result.then(() => {}, () => {});
    return result;
  };

  const query = (text, params = []) =>
    run(async () => {
      const db = await getDb();
      const res = await db.query(text, params);
      return { rows: res.rows || [], rowCount: res.affectedRows ?? (res.rows?.length || 0) };
    });

  // PGlite's query() is a prepared statement and rejects multi-statement SQL;
  // exec() is the batch entry point used for schema scripts.
  const exec = (sql) =>
    run(async () => {
      const db = await getDb();
      await db.exec(sql);
      return { rows: [], rowCount: 0 };
    });

  impl = {
    mode: 'pglite',
    query,
    exec,
    pool: {
      // routes/timesheets.js uses pool.connect() for its bulk transaction.
      connect: async () => ({
        query,
        release: () => {},
      }),
      end: async () => {
        if (dbPromise) (await dbPromise).close();
      },
    },
  };
}

module.exports = {
  mode: impl.mode,
  query: impl.query,
  exec: impl.exec,
  pool: impl.pool,
};
