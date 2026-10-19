'use strict';

const crypto = require('node:crypto');
const { Pool } = require('pg');
const request = require('supertest');
const { loadDotEnv } = require('../src/env');
const { migrate } = require('../scripts/migrate');
const { resolveCompanyId } = require('../src/db');
const { createApp } = require('../src/app');
const { createSessions } = require('../src/lab-session');

loadDotEnv();

const TEST_URL = process.env.TEST_DATABASE_URL;

/* Where test bookings start: 08:00 in Jakarta on the next Monday after today. The rooms are booked Monday
 * to Friday (010), and the 65 hours the tests book from there stay on weekdays. */
const JAKARTA_MS = 7 * 3600_000;
const jakartaNow = new Date(Date.now() + JAKARTA_MS);
const BOOK_T0 = Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(),
  jakartaNow.getUTCDate() + ((8 - jakartaNow.getUTCDay()) % 7 || 7), 8) - JAKARTA_MS;
const SKIP_DB = TEST_URL ? false : 'TEST_DATABASE_URL is not set (see .env.example)';

/* Migrate the test database and hand back a pool scoped to the seeded kmk company. */
async function setupDb() {
  await migrate(TEST_URL, () => {});
  const pool = new Pool({ connectionString: TEST_URL, max: 10 });
  const companyId = await resolveCompanyId(pool, 'kmk');
  return { pool, companyId };
}

async function resetNotes(pool) {
  await pool.query('TRUNCATE notes');
}

async function resetStrokes(pool) {
  await pool.query('TRUNCATE whiteboard_strokes');
}

async function resetRooms(pool) {
  // CASCADE: notes may name an author.
  await pool.query('TRUNCATE meeting_invites, follows, arrivals, bookings, people CASCADE');
}

/* The test branch has no Data API, so auth.user_id() is a stub that reads wall.test_sub.
 * Never replaces the real pg_session_jwt function. */
async function stubAuth(pool) {
  await pool.query('CREATE SCHEMA IF NOT EXISTS auth');
  const { rows } = await pool.query(
    "SELECT l.lanname FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = to_regprocedure('auth.user_id()')");
  if (!rows.length) {
    await pool.query("CREATE FUNCTION auth.user_id() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('wall.test_sub', true), '') $$");
  } else if (rows[0].lanname !== 'sql') {
    throw new Error('TEST_DATABASE_URL has the real Data API auth.user_id(); point it at a test branch');
  }
  await pool.query('GRANT authenticated TO CURRENT_USER');
}

/* One wall.* call, with the caller's JWT sub, in a transaction. Resolves the first column.
 * Before 012 this ran as role authenticated, the Data API's role. 012 took the wall schema from the
 * Data API roles (see the "Data API is closed" test), so the rules behind wall.* are exercised as the
 * owner; `role` runs it as a Data API role to prove the door is shut. */
async function asApi(pool, sub, sql, params = [], role = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('wall.test_sub', $1, true)", [sub || '']);
    if (role) await client.query('SET LOCAL ROLE ' + (role === 'anonymous' ? 'anonymous' : 'authenticated'));
    const { rows } = await client.query(sql, params);
    await client.query('COMMIT');
    return rows[0] ? Object.values(rows[0])[0] : undefined;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------ staff only (012) -- */

const LAB_SECRET = 'test-lab-secret-of-at-least-32-characters';

/* The app as production builds it: staff only, with the CCG hand-off secret. */
function labApp(opts) {
  return createApp(Object.assign({ ccgSecret: LAB_SECRET }, opts));
}

/* A hand-off as the CCG site signs it (web/src/lib/token-assertion.ts). */
function mintAssertion(over = {}, secret = LAB_SECRET) {
  const iat = Math.floor(Date.now() / 1000);
  const claims = Object.assign({
    v: 1, iss: 'ccg', aud: 'ck-virtual-lab', sub: crypto.randomUUID(), email: 'staff@ccg.test', name: 'Staff Member',
    role: 'STAFF', iat, exp: iat + 60, jti: crypto.randomUUID(),
  }, over);
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

/* The Cookie header a CCG hand-off would have left for this person: a real lab_sessions row. */
async function sessionCookie(pool, companyId, personId, role = 'STAFF') {
  const client = await pool.connect();
  try {
    return 'lab_session=' + await createSessions({ pool, companyId }).start(client, { personId, role });
  } finally {
    client.release();
  }
}

/* A name on the hub owned by a CCG account, and its session cookie. role is the hub role (guest | hall_operator). */
async function staffPerson(pool, companyId, name, role = 'guest') {
  const sub = crypto.randomUUID();
  const { rows } = await pool.query(
    'INSERT INTO people (company_id, display_name, role, ccg_sub, ccg_email) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [companyId, name, role, sub, sub + '@ccg.test']);
  return { id: rows[0].id, cookie: await sessionCookie(pool, companyId, rows[0].id) };
}

/* supertest, signed in. Each request carries the cookie of the person its body acts as (`me`, or a note's
 * `authorId`) when that person is in `cookies` (Map id -> cookie), else `fallback`'s. */
function signedIn(target, cookies, fallback) {
  const wrap = (method) => (path) => {
    const t = request(target)[method](path);
    if (fallback) t.set('Cookie', fallback);
    const send = t.send.bind(t);
    t.send = (body) => {
      const who = body && (body.me || body.authorId);
      const cookie = who && cookies && cookies.get(String(who).toLowerCase());
      if (cookie) t.set('Cookie', cookie);
      return send(body);
    };
    return t;
  };
  return { get: wrap('get'), head: wrap('head'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete') };
}

module.exports = {
  TEST_URL, SKIP_DB, BOOK_T0, setupDb, resetNotes, resetStrokes, resetRooms, stubAuth, asApi,
  LAB_SECRET, labApp, mintAssertion, sessionCookie, staffPerson, signedIn,
};
