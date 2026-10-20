'use strict';

/* POST /v1/ccg/remove (014): the CCG site cleared an account's staff, and the lab drops the person with
 * everything that names them. Against TEST_DATABASE_URL, except the token and hub checks. */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { verifyRemoval } = require('../src/ccg-entry');
const { createHub } = require('../src/live');
const { SKIP_DB, BOOK_T0, setupDb, resetRooms, LAB_SECRET, labApp, mintAssertion, staffPerson } = require('./helpers');

/* A removal notice as the CCG site signs it (web/src/lib/token-assertion.ts issueLabRemoval). */
function mintRemoval(over = {}, secret = LAB_SECRET) {
  const iat = Math.floor(Date.now() / 1000);
  const claims = Object.assign({
    v: 1, iss: 'ccg', aud: 'ck-virtual-lab:remove', sub: crypto.randomUUID(), iat, exp: iat + 60, jti: crypto.randomUUID(),
  }, over);
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

test('verifyRemoval: only a removal notice, signed with the secret, in time', () => {
  const sub = crypto.randomUUID();
  assert.equal(verifyRemoval(mintRemoval({ sub }), LAB_SECRET).sub, sub);
  assert.equal(verifyRemoval(mintRemoval({}, 'another-secret-of-at-least-32-chars!!!'), LAB_SECRET), null);
  // A sign-in hand-off is never a removal, whatever it carries.
  assert.equal(verifyRemoval(mintAssertion(), LAB_SECRET), null);
  for (const bad of [{ aud: 'ck-virtual-lab' }, { iss: 'x' }, { v: 2 }, { sub: 'nope' }, { jti: 'nope' },
    { exp: Math.floor(Date.now() / 1000) - 60 }, { exp: Math.floor(Date.now() / 1000) + 3600 }]) {
    assert.equal(verifyRemoval(mintRemoval(bad), LAB_SECRET), null, JSON.stringify(bad));
  }
});

test('hub.personRemoved: closes that person\'s sockets and tells every other wall', () => {
  const hub = createHub();
  const socket = (personId) => ({ personId, readyState: 1, sent: [], closed: null,
    send(m) { this.sent.push(JSON.parse(m)); }, close(code, reason) { this.closed = [code, reason]; } });
  const gone = socket('p-gone');
  const stays = socket('p-stays');
  hub.join(gone);
  hub.join(stays);
  hub.personRemoved('p-gone', ['n1', 'n2']);
  assert.deepEqual(gone.closed, [4401, 'removed']);
  assert.equal(stays.closed, null);
  assert.deepEqual(stays.sent, [{ t: 'note:drop', id: 'n1' }, { t: 'note:drop', id: 'n2' }, { t: 'person:drop', id: 'p-gone' }]);
});

test('/v1/ccg/remove', { skip: SKIP_DB }, async (t) => {
  const { pool, companyId } = await setupDb();
  t.after(() => pool.end());
  const app = labApp({ pool, companyId });
  const json = (path, body) => request(app).post(path).set('Content-Type', 'application/json').send(body);
  const count = (sql, args) => pool.query(sql, args).then((r) => Number(r.rows[0].n));

  t.beforeEach(async () => {
    await resetRooms(pool);
    await pool.query('TRUNCATE lab_sessions');
  });

  /* One person who entered from CCG, with something in every table that can name them, beside a colleague. */
  async function scene() {
    const sub = crypto.randomUUID();
    const entered = await json('/v1/ccg/enter', { token: mintAssertion({ sub, name: 'Leaving Person' }) }).expect(200);
    const id = entered.body.person.id;
    const cookie = entered.headers['set-cookie'][0].split(';')[0];
    const other = await staffPerson(pool, companyId, 'Staying Person');
    const q = (sql, args) => pool.query(sql, args).then((r) => r.rows[0]);
    const at = (h) => new Date(BOOK_T0 + h * 3600_000).toISOString();

    const mine = await q("INSERT INTO notes (company_id, body, author_id) VALUES ($1, 'mine', $2) RETURNING id", [companyId, id]);
    const theirs = await q("INSERT INTO notes (company_id, body, author_id) VALUES ($1, 'theirs', $2) RETURNING id", [companyId, other.id]);
    const myMeeting = await q(
      "INSERT INTO bookings (company_id, room, title, start_at, end_at, status, created_by) VALUES ($1, 'black_box', 'Mine', $2, $3, 'active', $4) RETURNING id",
      [companyId, at(0), at(1), id]);
    const theirMeeting = await q(
      "INSERT INTO bookings (company_id, room, title, start_at, end_at, status, created_by) VALUES ($1, 'black_box', 'Theirs', $2, $3, 'active', $4) RETURNING id",
      [companyId, at(2), at(3), other.id]);
    await pool.query('INSERT INTO meeting_invites (booking_id, person_id, invited_by) VALUES ($1, $2, $3), ($4, $5, $2)',
      [myMeeting.id, other.id, id, theirMeeting.id, id]);
    await pool.query('INSERT INTO arrivals (company_id, person_id, coming) VALUES ($1, $2, true), ($1, $3, true)', [companyId, id, other.id]);
    return { sub, id, cookie, other, mine: mine.id, theirs: theirs.id, theirMeeting: theirMeeting.id };
  }

  await t.test('the person and everything naming them go; the colleague keeps their own', async () => {
    const s = await scene();
    const res = await json('/v1/ccg/remove', { token: mintRemoval({ sub: s.sub }) }).expect(200);
    assert.deepEqual(res.body, { removed: true });

    assert.equal(await count('SELECT count(*) AS n FROM people WHERE id = $1', [s.id]), 0);
    assert.equal(await count('SELECT count(*) AS n FROM lab_sessions WHERE person_id = $1', [s.id]), 0);
    assert.equal(await count('SELECT count(*) AS n FROM notes WHERE author_id = $1 OR id = $2', [s.id, s.mine]), 0);
    assert.equal(await count('SELECT count(*) AS n FROM bookings WHERE created_by = $1', [s.id]), 0);
    assert.equal(await count('SELECT count(*) AS n FROM meeting_invites WHERE person_id = $1 OR invited_by = $1', [s.id]), 0);
    assert.equal(await count('SELECT count(*) AS n FROM arrivals WHERE person_id = $1', [s.id]), 0);
    // Their activity goes, and so does any line naming them or their notes (016).
    assert.equal(await count('SELECT count(*) AS n FROM activity WHERE actor_id = $1 OR subject_id = $1 OR note_id = $2', [s.id, s.mine]), 0);

    assert.equal(await count('SELECT count(*) AS n FROM people WHERE id = $1', [s.other.id]), 1);
    assert.equal(await count('SELECT count(*) AS n FROM notes WHERE id = $1', [s.theirs]), 1);
    assert.equal(await count('SELECT count(*) AS n FROM bookings WHERE id = $1', [s.theirMeeting]), 1);
    assert.equal(await count('SELECT count(*) AS n FROM arrivals WHERE person_id = $1', [s.other.id]), 1);
    assert.equal(await count("SELECT count(*) AS n FROM activity WHERE actor_id = $1 AND kind IN ('note_added', 'meeting_booked', 'coming_in')", [s.other.id]), 3);

    // The old session is dead at once, and the name is off the shared list.
    await request(app).get('/v1/ccg/me').set('Cookie', s.cookie).expect(401);
    const list = (await request(app).get('/v1/hub/people').set('Cookie', s.other.cookie).expect(200)).body;
    assert.equal((list.people || list).some((p) => p.id === s.id), false);
  });

  await t.test('sending again is safe; a used notice is refused; an unknown account is a no-op', async () => {
    const s = await scene();
    const token = mintRemoval({ sub: s.sub });
    await json('/v1/ccg/remove', { token }).expect(200);
    assert.equal((await json('/v1/ccg/remove', { token }).expect(409)).body.error.code, 'assertion_used');
    assert.deepEqual((await json('/v1/ccg/remove', { token: mintRemoval({ sub: s.sub }) }).expect(200)).body, { removed: false });
    assert.deepEqual((await json('/v1/ccg/remove', { token: mintRemoval() }).expect(200)).body, { removed: false });
  });

  await t.test('a hand-off cannot remove, and a removal notice cannot sign in', async () => {
    const s = await scene();
    await json('/v1/ccg/remove', { token: mintAssertion({ sub: s.sub }) }).expect(401);
    await json('/v1/ccg/enter', { token: mintRemoval({ sub: s.sub }) }).expect(401);
    assert.equal(await count('SELECT count(*) AS n FROM people WHERE id = $1', [s.id]), 1);
  });

  await t.test('made staff again later, the account starts over with an empty name', async () => {
    const s = await scene();
    await json('/v1/ccg/remove', { token: mintRemoval({ sub: s.sub }) }).expect(200);
    const back = await json('/v1/ccg/enter', { token: mintAssertion({ sub: s.sub, name: 'Leaving Person' }) }).expect(200);
    assert.notEqual(back.body.person.id, s.id);
    assert.equal(back.body.created, true);
    assert.equal(await count('SELECT count(*) AS n FROM notes WHERE author_id = $1', [back.body.person.id]), 0);
  });
});

/* 015: the stock "Draven" from before CCG sign-in goes; a Draven with a CCG account stays. */
test('015 removes the stock Draven', { skip: SKIP_DB }, async (t) => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { pool, companyId } = await setupDb();
  t.after(() => pool.end());
  await resetRooms(pool);
  const q = (sql, args) => pool.query(sql, args).then((r) => r.rows[0]);
  const stock = await q("INSERT INTO people (company_id, display_name, role) VALUES ($1, ' Draven ', 'guest') RETURNING id", [companyId]);
  const real = await staffPerson(pool, companyId, 'Draven');
  const note = await q("INSERT INTO notes (company_id, body, author_id) VALUES ($1, 'kept', $2) RETURNING id", [companyId, stock.id]);
  await pool.query('INSERT INTO arrivals (company_id, person_id, coming) VALUES ($1, $2, true)', [companyId, stock.id]);

  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '015_remove_stock_draven.sql'), 'utf8');
  await pool.query(sql);
  await pool.query(sql);

  const n = (sql, args) => pool.query(sql, args).then((r) => Number(r.rows[0].n));
  assert.equal(await n('SELECT count(*) AS n FROM people WHERE id = $1', [stock.id]), 0);
  assert.equal(await n('SELECT count(*) AS n FROM people WHERE id = $1', [real.id]), 1);
  assert.equal(await n('SELECT count(*) AS n FROM arrivals WHERE person_id = $1', [stock.id]), 0);
  assert.equal(await n('SELECT count(*) AS n FROM activity WHERE actor_id = $1', [stock.id]), 0);
  assert.equal((await q('SELECT author_id FROM notes WHERE id = $1', [note.id])).author_id, null, 'the note stays, unsigned');
});
