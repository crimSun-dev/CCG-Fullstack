'use strict';

/* POST /v1/ccg/enter and the lab session it starts, against TEST_DATABASE_URL. The CCG site's signed
 * hand-off is the only way in (012): it names the staff member, and the session it leaves is who they are. */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { verifyAssertion } = require('../src/ccg-entry');
const { SKIP_DB, BOOK_T0, setupDb, resetRooms, LAB_SECRET, labApp, mintAssertion } = require('./helpers');

const SUB = '8d3e1c9a-0000-4000-8000-000000000001';
const OTHER_SUB = '8d3e1c9a-0000-4000-8000-000000000002';
const OTHER_SECRET = 'another-secret-of-at-least-32-chars!!!';
const mint = (over = {}, secret) => mintAssertion(Object.assign({ sub: SUB, email: 'draven@ccg.test', name: 'Draven Chen' }, over), secret);

test('verifyAssertion: the CCG token checks out, and every tampering fails', () => {
  assert.equal(verifyAssertion(mint(), LAB_SECRET).name, 'Draven Chen');
  assert.equal(verifyAssertion(mint({}, OTHER_SECRET), LAB_SECRET), null);
  for (const bad of [{ role: 'MEMBER' }, { aud: 'elsewhere' }, { iss: 'x' }, { v: 2 }, { sub: 'nope' }, { name: ' ' },
    { exp: Math.floor(Date.now() / 1000) - 60 }, { exp: Math.floor(Date.now() / 1000) + 3600 }]) {
    assert.equal(verifyAssertion(mint(bad), LAB_SECRET), null, JSON.stringify(bad));
  }
  const token = mint();
  const claims = JSON.parse(Buffer.from(token.split('.')[0], 'base64url'));
  const forged = Buffer.from(JSON.stringify(Object.assign(claims, { role: 'ADMIN' }))).toString('base64url');
  assert.equal(verifyAssertion(forged + '.' + token.split('.')[1], LAB_SECRET), null);
  assert.equal(verifyAssertion(token + '.x', LAB_SECRET), null);
  assert.equal(verifyAssertion(undefined, LAB_SECRET), null);
});

test('/v1/ccg/enter', { skip: SKIP_DB }, async (t) => {
  const { pool, companyId } = await setupDb();
  t.after(() => pool.end());
  const app = labApp({ pool, companyId });
  const enter = (token) => request(app).post('/v1/ccg/enter').set('Content-Type', 'application/json').send({ token });
  const cookieOf = (res) => res.headers['set-cookie'][0].split(';')[0];
  const row = (id) => pool.query('SELECT display_name, ccg_email, ccg_sub FROM people WHERE id = $1', [id]).then((r) => r.rows[0]);

  t.beforeEach(() => resetRooms(pool));

  await t.test('a staff account gets its verified name and an HttpOnly session; no email on the shared list', async () => {
    const res = await enter(mint()).expect(200);
    assert.equal(res.body.verified, true);
    assert.equal(res.body.person.displayName, 'Draven Chen');
    assert.equal(res.body.person.email, undefined);
    const set = res.headers['set-cookie'][0];
    assert.match(set, /^lab_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=36000$/);
    assert.deepEqual(await row(res.body.person.id), { display_name: 'Draven Chen', ccg_email: 'draven@ccg.test', ccg_sub: SUB });

    // Only the hash is stored.
    const token = cookieOf(res).split('=')[1];
    const stored = await pool.query('SELECT token_hash FROM lab_sessions');
    assert.equal(stored.rows.length, 1);
    assert.notEqual(stored.rows[0].token_hash, token);

    const me = await request(app).get('/v1/ccg/me').set('Cookie', cookieOf(res)).expect(200);
    assert.deepEqual([me.body.person.id, me.body.role], [res.body.person.id, 'STAFF']);
    const list = await request(app).get('/v1/hub/people').set('Cookie', cookieOf(res)).expect(200);
    assert.ok(list.body.people.some((p) => p.displayName === 'Draven Chen'));
    assert.ok(!JSON.stringify(list.body).includes('draven@ccg.test'));
  });

  await t.test('the same account comes back to the same name; a token works once', async () => {
    const token = mint();
    const first = await enter(token).expect(200);
    assert.equal((await enter(token).expect(409)).headers['set-cookie'], undefined, 'a replay gets no session');
    const again = await enter(mint()).expect(200);
    assert.equal(again.body.person.id, first.body.person.id);
  });

  await t.test('a guest name from before 012 with the same spelling is adopted, with its notes and bookings', async () => {
    const guest = (await pool.query(
      "INSERT INTO people (company_id, display_name) VALUES ($1, 'draven chen') RETURNING id", [companyId])).rows[0].id;
    const noteId = crypto.randomUUID();
    await pool.query('INSERT INTO notes (id, company_id, body, author_id) VALUES ($1, $2, $3, $4)', [noteId, companyId, 'kept', guest]);
    await pool.query('SELECT wall_private.hq_book($1, $2, $3, NULL, $4, $5, $6, NULL, NULL)',
      [companyId, guest, 'black_box', 'Kept', new Date(BOOK_T0).toISOString(), new Date(BOOK_T0 + 3600_000).toISOString()]);

    const res = await enter(mint()).expect(200);
    assert.equal(res.body.person.id, guest);
    const notes = await request(app).get('/v1/notes').set('Cookie', cookieOf(res)).expect(200);
    assert.ok(notes.body.notes.some((n) => n.id === noteId && n.authorId === guest));
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM bookings WHERE created_by = $1', [guest]);
    assert.equal(rows[0].n, 1);
  });

  await t.test('a name owned by another account is never taken: the second gets a distinct record', async () => {
    const a = await enter(mint()).expect(200);
    const b = await enter(mint({ sub: OTHER_SUB, email: 'other.draven@ccg.test' })).expect(200);
    assert.notEqual(b.body.person.id, a.body.person.id);
    assert.equal(b.body.person.displayName, 'Draven Chen 2');
    assert.equal((await row(a.body.person.id)).ccg_email, 'draven@ccg.test');
  });

  await t.test('two accounts can never hold one email; a CCG email change follows the account', async () => {
    const a = await enter(mint()).expect(200);
    await enter(mint({ email: 'draven.new@ccg.test' })).expect(200);
    const b = await enter(mint({ sub: OTHER_SUB, email: 'draven@ccg.test', name: 'Someone Else' })).expect(200);
    assert.equal((await row(a.body.person.id)).ccg_email, 'draven.new@ccg.test');
    assert.equal((await row(b.body.person.id)).ccg_email, 'draven@ccg.test');
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM people WHERE lower(ccg_email) = 'draven@ccg.test'");
    assert.equal(rows[0].n, 1);
  });

  await t.test('a bad, forged, or member token is refused, writes nothing and opens no session', async () => {
    for (const token of ['not.a-token', mint({}, OTHER_SECRET), mint({ role: 'MEMBER' })]) {
      const res = await enter(token).expect(401);
      assert.equal(res.headers['set-cookie'], undefined);
    }
    const { rows } = await pool.query('SELECT (SELECT count(*) FROM people)::int AS p, (SELECT count(*) FROM lab_sessions)::int AS s');
    assert.deepEqual(rows[0], { p: 0, s: 0 });
  });

  await t.test('signing out ends the session for every copy of the cookie', async () => {
    const cookie = cookieOf(await enter(mint()).expect(200));
    const out = await request(app).post('/v1/ccg/logout').set('Cookie', cookie).expect(204);
    assert.match(out.headers['set-cookie'][0], /^lab_session=; .*Max-Age=0/);
    await request(app).get('/v1/notes').set('Cookie', cookie).expect(401);
    assert.match((await request(app).get('/').set('Cookie', cookie).expect(200)).text, /CK Virtual Lab is for CCG staff/);
  });

  await t.test('an expired session is a stranger', async () => {
    const cookie = cookieOf(await enter(mint()).expect(200));
    await pool.query("UPDATE lab_sessions SET expires_at = now() - interval '1 second'");
    await request(app).get('/v1/hub/rooms').set('Cookie', cookie).expect(401);
  });

  await t.test('signed in, the wall itself is served', async () => {
    const cookie = cookieOf(await enter(mint()).expect(200));
    const page = await request(app).get('/').set('Cookie', cookie).expect(200);
    assert.match(page.text, /<script src="ce-store.js">/);
    await request(app).get('/ce-config.js').set('Cookie', cookie).expect(200);
  });

  await t.test('another origin cannot post a token', async () => {
    await request(app).post('/v1/ccg/enter').set('Content-Type', 'application/json').set('Origin', 'https://evil.example')
      .send({ token: mint() }).expect(403);
  });
});
