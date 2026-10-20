'use strict';

/* /v1/hub and its /v1/live fan-out against TEST_DATABASE_URL: the names list, Black Box meetings,
 * CK Hall rentals, invitations, today's arrivals, and the activity everyone sees. The caller names themselves with `me`. */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const request = require('supertest');
const WebSocket = require('ws');
const { attachLive } = require('../src/live');
const { SKIP_DB, BOOK_T0, setupDb, resetRooms, labApp, sessionCookie, signedIn, mintAssertion } = require('./helpers');

const HOUR = 3600_000;
const T0 = BOOK_T0;   // a weekday morning, never in the past
const at = (hours) => new Date(T0 + hours * HOUR).toISOString();
const jakartaDay = (iso) => new Date(Date.parse(iso) + 7 * HOUR).toISOString().slice(0, 10);

async function startServer(pool, companyId) {
  const app = labApp({ pool, companyId });
  const server = http.createServer(app);
  const wss = attachLive(server, { hub: app.locals.hub, pool, companyId, authenticate: app.locals.authenticate });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  return { base, stop: () => new Promise((r) => { wss.clients.forEach((ws) => ws.terminate()); server.close(r); }) };
}

/* A wall's socket, signed in with cookie. Keeps every frame. */
function connect(base, cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/v1/live', { origin: base, headers: { Cookie: cookie } });
    const seen = [];
    const waiters = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      seen.push(msg);
      for (const w of waiters.slice()) {
        if (w.match(msg)) { waiters.splice(waiters.indexOf(w), 1); clearTimeout(w.timer); w.resolve(msg); }
      }
    });
    const client = {
      ws, seen,
      next(t, pred = () => true, ms = 4000) {
        const match = (m) => m.t === t && pred(m) && !m.__taken && (m.__taken = true);
        const hit = seen.find(match);
        if (hit) return Promise.resolve(hit);
        return new Promise((res, rej) => {
          waiters.push({ match, resolve: res, timer: setTimeout(() => rej(new Error('no ' + t + ' frame within ' + ms + 'ms')), ms) });
        });
      },
    };
    ws.on('open', () => client.next('hello').then((hello) => { client.hello = hello; resolve(client); }, reject));
    ws.on('error', reject);
  });
}

test('HQ rooms over /v1/hub', { skip: SKIP_DB }, async (t) => {
  const { pool, companyId } = await setupDb();
  const srv = await startServer(pool, companyId);
  const open = [];
  t.after(async () => { open.forEach((c) => c.ws.terminate()); await srv.stop(); await pool.end(); });
  // Staff only (012): each name below has its own lab session; a request goes out with the cookie of
  // the person its body names as `me` (else Rina's). A stranger is plain supertest with no cookie.
  const cookies = new Map();
  const wall = async () => { const c = await connect(srv.base, cookies.get(rina)); open.push(c); return c; };
  const api = () => signedIn(srv.base, cookies, cookies.get(rina));
  const stranger = () => request(srv.base);

  async function person(name, role = 'guest') {
    const { rows } = await pool.query(
      'INSERT INTO people (company_id, display_name, role) VALUES ($1, $2, $3) RETURNING id', [companyId, name, role]);
    cookies.set(rows[0].id, await sessionCookie(pool, companyId, rows[0].id));
    return rows[0].id;
  }
  const meeting = (me, start, end, over = {}) =>
    api().post('/v1/hub/black-box').send(Object.assign({ me, title: 'Standup', startAt: start, endAt: end }, over));
  const hallRequest = (me, start, end, over = {}) =>
    api().post('/v1/hub/ck-hall').send(Object.assign({ me, name: 'Rina', startAt: start, endAt: end }, over));
  const decide = (me, id, decision) => api().post('/v1/hub/ck-hall/' + id + '/' + decision).send({ me });

  let rina, dewi, sari, operator;
  t.beforeEach(async () => {
    await resetRooms(pool);
    rina = await person('Rina');
    dewi = await person('Dewi');
    sari = await person('Sari');
    operator = await person('Pak Hall', 'hall_operator');
  });

  await t.test('names: no guest names; the list is for signed-in staff only', async () => {
    for (const body of [{ displayName: 'Budi' }, { displayName: 'x', role: 'hall_operator' }]) {
      assert.equal((await api().post('/v1/hub/people').send(body).expect(403)).body.error.code, 'names_from_ccg');
      assert.equal((await stranger().post('/v1/hub/people').send(body).expect(401)).body.error.code, 'sign_in_required');
    }
    const names = (await api().get('/v1/hub/people').expect(200)).body.people.map((p) => p.displayName);
    assert.deepEqual(names, ['Dewi', 'Pak Hall', 'Rina', 'Sari']);
    await stranger().get('/v1/hub/people').expect(401);
    await stranger().get('/v1/hub/rooms').expect(401);
  });

  await t.test('signed in, you act only as yourself: naming someone else is 403', async () => {
    const asRina = (path) => request(srv.base).post(path).set('Cookie', cookies.get(rina));
    const res = await asRina('/v1/hub/black-box').send({ me: sari, title: 'Not mine', startAt: at(1), endAt: at(2) }).expect(403);
    assert.equal(res.body.error.code, 'not_you');
    await request(srv.base).put('/v1/hub/arrivals/today').set('Cookie', cookies.get(rina)).send({ me: dewi, coming: true }).expect(403);
    // No `me` at all: the session decides.
    const own = (await asRina('/v1/hub/black-box').send({ title: 'Mine', startAt: at(1), endAt: at(2) }).expect(201)).body;
    assert.equal(own.createdBy, rina);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n, 1);
  });

  await t.test('any name books, lists, and cancels its own Black Box meeting; overlaps are 409', async () => {
    const a = (await meeting(sari, at(1), at(2), { note: 'bring the deck' }).expect(201)).body;
    assert.deepEqual([a.title, a.status, a.note, a.byName, a.createdBy], ['Standup', 'active', 'bring the deck', 'Sari', sari]);
    assert.equal((await meeting(rina, at(1.5), at(2.5)).expect(409)).body.error.code, 'booking_conflict');
    const b = (await meeting(rina, at(2), at(3), { title: 'Edit review' }).expect(201)).body;
    const day = (await api().get('/v1/hub/black-box?day=' + jakartaDay(a.startAt)).expect(200)).body.bookings;
    assert.ok([a.id, b.id].every((id) => day.some((m) => m.id === id)));
    await api().post('/v1/hub/black-box/' + a.id + '/cancel').send({ me: rina }).expect(403);
    assert.equal((await api().post('/v1/hub/black-box/' + a.id + '/cancel').send({ me: sari }).expect(200)).body.status, 'cancelled');
    await meeting(dewi, at(1), at(2)).expect(201);
    await api().post('/v1/hub/black-box/' + crypto.randomUUID() + '/cancel').send({ me: sari }).expect(404);
  });

  await t.test('two concurrent overlapping meetings: one lands, one conflicts', async () => {
    const results = await Promise.all([meeting(rina, at(4), at(5)), meeting(dewi, at(4.5), at(6))]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  });

  await t.test('no session is 401; malformed shapes are 400; past starts and past days are 400', async () => {
    const res = await stranger().post('/v1/hub/black-box').send({ title: 'Standup', startAt: at(1), endAt: at(2) }).expect(401);
    assert.equal(res.body.error.code, 'sign_in_required');
    assert.equal((await meeting(crypto.randomUUID(), at(1), at(2)).expect(403)).body.error.code, 'not_you');
    const past = new Date(Date.now() - 600_000).toISOString();
    for (const over of [{ title: '  ' }, { title: 5 }, { startAt: 'soon' }, { endAt: at(0.5) }, { id: 'nope' },
      { note: 'n'.repeat(601) }, { me: 'sari' }, { invite: ['x'] }, { startAt: past }]) {
      const res = await meeting(rina, at(1), at(2), over).expect(400);
      assert.equal(res.body.error.code, 'validation_failed', JSON.stringify(over).slice(0, 40));
    }
    await api().get('/v1/hub/black-box?day=18-10-2026').expect(400);
    await api().get('/v1/hub/black-box?day=2001-01-01').expect(400);
    await api().get('/v1/hub/ck-hall?day=2001-01-01').expect(400);
    assert.deepEqual((await api().get('/v1/hub/black-box?day=2099-01-01').expect(200)).body.bookings, []);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n, 0);
  });

  await t.test('invitations: invite while booking, invite more later, accept and decline', async () => {
    const m = (await meeting(rina, at(1), at(2), { invite: [dewi, sari] }).expect(201)).body;
    assert.deepEqual(m.invites.map((i) => [i.name, i.status]), [['Dewi', 'invited'], ['Sari', 'invited']]);
    const budi = await person('Budi');
    const more = (await api().post('/v1/hub/bookings/' + m.id + '/invite').send({ me: dewi, people: [budi] }).expect(200)).body;
    assert.deepEqual(more.invites.map((i) => i.name), ['Budi', 'Dewi', 'Sari']);
    await api().post('/v1/hub/bookings/' + m.id + '/invite').send({ me: operator, people: [operator] }).expect(403);
    await api().post('/v1/hub/bookings/' + m.id + '/invite').send({ me: rina }).expect(400);
    const yes = (await api().post('/v1/hub/bookings/' + m.id + '/respond').send({ me: sari, response: 'accepted' }).expect(200)).body;
    assert.equal(yes.invites.find((i) => i.personId === sari).status, 'accepted');
    const no = (await api().post('/v1/hub/bookings/' + m.id + '/respond').send({ me: dewi, response: 'declined' }).expect(200)).body;
    assert.equal(no.invites.find((i) => i.personId === dewi).status, 'declined');
    await api().post('/v1/hub/bookings/' + m.id + '/respond').send({ me: operator, response: 'accepted' }).expect(403);
    await api().post('/v1/hub/bookings/' + m.id + '/respond').send({ me: sari, response: 'maybe' }).expect(400);
  });

  await t.test('CK Hall: guests request, only hall operators approve, overlapping confirms conflict', async () => {
    const a = (await hallRequest(sari, at(1), at(3), { invite: [dewi] }).expect(201)).body;
    const b = (await hallRequest(dewi, at(2), at(4), { name: 'Agency X' }).expect(201)).body;
    assert.deepEqual([a.status, a.title, b.status], ['requested', 'Rina', 'requested']);
    await decide(sari, a.id, 'confirm').expect(403);
    await decide(sari, a.id, 'decline').expect(403);
    assert.equal((await decide(operator, a.id, 'confirm').expect(200)).body.status, 'confirmed');
    assert.equal((await decide(operator, b.id, 'confirm').expect(409)).body.error.code, 'booking_conflict');
    assert.equal((await decide(operator, b.id, 'decline').expect(200)).body.status, 'declined');
    await decide(rina, a.id, 'cancel').expect(403);
    assert.equal((await decide(sari, a.id, 'cancel').expect(200)).body.status, 'cancelled', 'the booker cancels their own');
    await decide(operator, a.id, 'approve').expect(404);
    await stranger().post('/v1/hub/ck-hall').send({ name: 'Rina', startAt: at(1), endAt: at(2) }).expect(401);
  });

  await t.test('arrivals: anyone with a name; one row per Jakarta day; everyone sees the list', async () => {
    const a = (await api().put('/v1/hub/arrivals/today').send({ me: sari, coming: true }).expect(200)).body;
    const b = (await api().put('/v1/hub/arrivals/today').send({ me: sari, coming: true, note: 'from 10' }).expect(200)).body;
    assert.deepEqual([b.id, b.note, b.name], [a.id, 'from 10', 'Sari']);
    const c = (await api().put('/v1/hub/arrivals/today').send({ me: sari, coming: false }).expect(200)).body;
    assert.deepEqual([c.id, c.coming], [a.id, false]);
    await api().put('/v1/hub/arrivals/today').send({ me: dewi, coming: true }).expect(200);
    assert.equal((await api().get('/v1/hub/arrivals').expect(200)).body.arrivals.length, 2);
    await stranger().put('/v1/hub/arrivals/today').send({ coming: true }).expect(401);
    await api().put('/v1/hub/arrivals/today').send({ me: sari, coming: 'yes' }).expect(400);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM arrivals')).rows[0].n, 2);
  });

  await t.test("activity: follows are gone; every post-it write is a line naming the session's person", async () => {
    await api().put('/v1/hub/follows/' + dewi).send({ me: sari, follow: true }).expect(404);
    const n = (await api().post('/v1/notes').send({ id: crypto.randomUUID(), body: 'Snacks' }).expect(201)).body;
    await api().patch('/v1/notes/' + n.id).send({ body: 'Snacks at 3', revision: n.revision }).expect(200);
    const lines = async () => (await api().get('/v1/hub/activity').expect(200)).body.activity.filter((l) => l.noteId === n.id);
    assert.deepEqual((await lines()).map((l) => [l.kind, l.actorName, l.detail.body, !!l.detail.edited]),
      [['note_added', 'Rina', 'Snacks at 3', true]], 'an edit soon after by the same person is the same line');
    await api().delete('/v1/notes/' + n.id).expect(204);
    assert.deepEqual((await lines()).map((l) => [l.kind, l.actorName]), [['note_removed', 'Rina'], ['note_added', 'Rina']]);
    await api().post('/v1/notes/' + n.id + '/restore').expect(200);
    assert.deepEqual((await lines()).map((l) => l.kind), ['note_added'], 'putting it back takes the take-down away');
    await stranger().get('/v1/hub/activity').expect(401);
  });

  await t.test('/v1/live: the hello carries today\'s rooms, names, arrivals, and activity', async () => {
    await pool.query("INSERT INTO bookings (company_id, room, title, start_at, end_at, status, created_by)" +
      " VALUES ($1, 'black_box', 'Board talk', now() - interval '10 minutes', now() + interval '20 minutes', 'active', $2)", [companyId, rina]);
    await api().put('/v1/hub/arrivals/today').send({ me: dewi, coming: true }).expect(200);
    const w = await wall();
    const rooms = w.hello.rooms;
    assert.equal(rooms.bookings.find((b) => b.room === 'black_box').title, 'Board talk');
    assert.equal(rooms.people.length, 4);
    assert.equal(rooms.follows, undefined);
    assert.ok(rooms.activity.some((l) => l.kind === 'coming_in' && l.actorName === 'Dewi'));
    assert.equal(rooms.arrivals[0].name, 'Dewi');
  });

  await t.test('/v1/live: bookings, invitations, arrivals, names, and activity reach every wall', async () => {
    const a = await wall();
    const b = await wall();
    const m = (await meeting(rina, at(1), at(2), { title: 'Pitch', invite: [sari] }).expect(201)).body;
    for (const w of [a, b]) assert.equal((await w.next('booking', (f) => f.booking.id === m.id)).booking.title, 'Pitch');
    await api().post('/v1/hub/bookings/' + m.id + '/respond').send({ me: sari, response: 'accepted' }).expect(200);
    const answered = await b.next('booking', (f) => f.booking.id === m.id);
    assert.equal(answered.booking.invites[0].status, 'accepted');
    await api().put('/v1/hub/arrivals/today').send({ me: dewi, coming: true }).expect(200);
    assert.equal((await a.next('arrival')).arrival.name, 'Dewi');
    // A new name arrives only by a CCG staff account entering.
    const p = (await request(srv.base).post('/v1/ccg/enter').send({ token: mintAssertion({ name: 'Newcomer' }) }).expect(200)).body.person;
    assert.equal((await b.next('person', (f) => f.person.id === p.id)).person.displayName, 'Newcomer');
    // Every write is followed by the whole recent activity, one frame for a burst.
    await api().put('/v1/hub/arrivals/today').send({ me: dewi, coming: false }).expect(200);
    const told = await b.next('activity', (f) => f.activity.some((l) => l.kind === 'not_coming' && l.actorName === 'Dewi'));
    const pitch = told.activity.filter((l) => l.bookingId === m.id).map((l) => [l.kind, l.actorName, l.subjectName]).reverse();
    assert.deepEqual(pitch, [['meeting_booked', 'Rina', null], ['invited', 'Rina', 'Sari'], ['accepted', 'Sari', 'Sari']]);
  });
});
