'use strict';

/* CE.rooms in ce-store.js, run in a sandbox the way a browser runs it: the local backend's rules,
 * the office backend against a real /v1 + /v1/live server, the Pages backend through a stand-in for
 * the Neon Data API, and index.html owning no socket or poller. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const WebSocket = require('ws');
const { SITE_DIR } = require('../src/app');
const { attachLive } = require('../src/live');
const { SKIP_DB, BOOK_T0, setupDb, resetRooms, stubAuth, labApp, mintAssertion } = require('./helpers');
const { NEON, neonStandIn } = require('./page-harness');

const STORE_SRC = fs.readFileSync(path.join(SITE_DIR, 'ce-store.js'), 'utf8');
const HOUR = 3600_000;
const T0 = BOOK_T0;   // a weekday morning, never in the past
const at = (hours) => new Date(T0 + hours * HOUR).toISOString();
const plain = (x) => JSON.parse(JSON.stringify(x));          // out of the sandbox's realm, for deepEqual

/* One page: ce-store.js in its own window. Timers are unref'd so a page left open does not hold the test run. */
function page(extra = {}) {
  const items = new Map();
  const ctx = Object.assign({
    console,
    crypto: globalThis.crypto,
    AbortController,
    atob,
    localStorage: {
      getItem: (k) => (items.has(k) ? items.get(k) : null),
      setItem: (k, v) => { items.set(k, String(v)); },
      removeItem: (k) => { items.delete(k); },
    },
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return t; },
    clearTimeout,
  }, extra);
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(STORE_SRC, ctx);
  return ctx.CE;
}

async function until(pred, what, ms = 4000) {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error('timed out waiting for ' + what);
    await new Promise((r) => setTimeout(r, 20));
  }
}
/* The rooms are booked Monday to Friday: whether a booking from now for the next hour can be made. */
const SKIP_NOT_NOW = (() => {
  const j = new Date(Date.now() + 7 * HOUR), later = new Date(Date.now() + 8 * HOUR);
  if (j.getUTCDay() === 0 || j.getUTCDay() === 6) return 'today is a weekend in Jakarta';
  return later.getUTCDate() !== j.getUTCDate() ? 'the next hour crosses Jakarta midnight' : false;
})();
/* The current minute, as the earliest start a booking may have. Waits out the last seconds of a minute. */
async function thisMinute() {
  if (Date.now() % 60_000 > 57_000) await new Promise((r) => setTimeout(r, 3_100));
  return new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
}
const refused = (status, code) => (err) => { assert.equal(err.status, status); if (code) assert.equal(err.code, code); return true; };

test('index.html leaves sockets and polling to ce-store.js', () => {
  const html = fs.readFileSync(path.join(SITE_DIR, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /new\s+WebSocket/);
  assert.doesNotMatch(html, /setInterval\s*\(/);
  assert.match(html, /<script src="ce-config\.js"><\/script>\s*<script src="ce-store\.js"><\/script>/);
});

test('CE.rooms on the local backend', async (t) => {
  const CE = page();
  const rooms = CE.rooms;
  await until(() => rooms.ready(), 'first snapshot');
  assert.equal(CE.backend, 'local');
  assert.equal(rooms.me(), null);

  let rina, dewi, sari, pak;
  await t.test('names: add a name with no code and use it; adding it again picks the same name', async () => {
    dewi = await rooms.addName('Dewi');
    sari = await rooms.addName('Sari');
    pak = await rooms.addName('Pak Hall', 'hall_operator');
    rina = await rooms.addName('Rina');
    assert.equal(rooms.me().displayName, 'Rina');
    assert.equal((await rooms.addName('rina')).id, rina.id);
    assert.deepEqual(plain(rooms.people().map((p) => p.displayName)), ['Dewi', 'Pak Hall', 'Rina', 'Sari']);
    await rooms.pick(dewi.id);
    assert.equal(rooms.me().id, dewi.id);
    await rooms.pick(rina.id);
  });

  await t.test('a meeting from this minute puts Black Box in use, from the span alone', { skip: SKIP_NOT_NOW }, async () => {
    let changes = 0;
    rooms.on('change', () => { changes++; });
    const start = await thisMinute();
    const m = await rooms.bookMeeting({ title: 'Standup', startAt: start, endAt: new Date(Date.parse(start) + 30 * 60_000).toISOString() });
    assert.ok(changes > 0);
    assert.equal(rooms.blackBoxInUse().id, m.id);
    assert.equal(rooms.blackBoxInUse(Date.parse(m.endAt)), null, 'the end is not inside [start, end)');
    assert.ok(rooms.isMine(m));
    await assert.rejects(rooms.bookMeeting({ title: 'Clash', startAt: start, endAt: new Date(Date.parse(start) + 60 * 60_000).toISOString() }),
      refused(409, 'booking_conflict'));
    await rooms.cancelMeeting(m.id);
    assert.equal(rooms.blackBoxInUse(), null);
  });

  await t.test('no past bookings and no past days', async () => {
    const ago = new Date(Date.now() - 10 * 60_000).toISOString();
    await assert.rejects(rooms.bookMeeting({ title: 'Late', startAt: ago, endAt: at(0) }), refused(400, 'validation_failed'));
    await assert.rejects(rooms.load('2001-01-01'), refused(400, 'validation_failed'));
    assert.ok(rooms.addDays(rooms.today(), 1) > rooms.today());
  });

  await t.test('the rooms are booked Monday to Friday', async () => {
    const sat = new Date(T0 + 5 * 24 * HOUR).toISOString(), sun = new Date(T0 + 6 * 24 * HOUR).toISOString();
    const friLate = new Date(T0 + 4 * 24 * HOUR + 15 * HOUR).toISOString();   // Friday 23:00
    await assert.rejects(rooms.bookMeeting({ title: 'Saturday', startAt: sat, endAt: new Date(Date.parse(sat) + HOUR).toISOString() }),
      refused(400, 'validation_failed'));
    await assert.rejects(rooms.requestHall({ name: 'Sunday', startAt: sun, endAt: new Date(Date.parse(sun) + HOUR).toISOString() }),
      refused(400, 'validation_failed'));
    await assert.rejects(rooms.bookMeeting({ title: 'Into Saturday', startAt: friLate, endAt: sat }), refused(400, 'validation_failed'));
    assert.equal(rooms.bookings(sat.slice(0, 10)).length, 0);
  });

  await t.test('invitations: invite while booking, invitees answer, notices follow', async () => {
    const m = await rooms.bookMeeting({ title: 'Pitch review', startAt: at(1), endAt: at(2), invite: [dewi.id, sari.id] });
    assert.deepEqual(plain(m.invites.map((i) => [i.name, i.status])), [['Dewi', 'invited'], ['Sari', 'invited']]);
    assert.equal(rooms.notices().length, 0, 'the booker has nothing to answer');
    await rooms.pick(sari.id);
    assert.deepEqual(plain(rooms.notices().map((n) => [n.kind, n.booking.title])), [['invite', 'Pitch review']]);
    await rooms.respond(m.id, 'accepted');
    assert.equal(rooms.myInvite(rooms.booking(m.id)).status, 'accepted');
    assert.equal(rooms.notices().length, 0, 'an answered invitation leaves the notices');
    await rooms.invite(m.id, [pak.id]);
    assert.equal(rooms.booking(m.id).invites.length, 3, 'an invitee may invite more');
    await assert.rejects(rooms.cancelMeeting(m.id), refused(403, 'forbidden'), 'only the booker cancels');
    await rooms.pick(rina.id);
  });

  await t.test('follows: a followed name coming in is a notice', async () => {
    await rooms.pick(sari.id);
    await rooms.follow(dewi.id, true);
    assert.ok(rooms.isFollowing(dewi.id));
    await rooms.pick(dewi.id);
    await rooms.markArrival(true);
    await rooms.markArrival(true, 'from 10');
    assert.equal(rooms.arrivals().length, 1, 'one line per name per day');
    await rooms.pick(sari.id);
    assert.deepEqual(plain(rooms.notices().map((n) => [n.kind, n.arrival.name, n.arrival.note])), [['arrival', 'Dewi', 'from 10']]);
    await rooms.follow(dewi.id, false);
    assert.equal(rooms.notices().length, 0);
  });

  await t.test('CK Hall: a guest requests, the hall operator approves, the ON AIR lamp follows', { skip: SKIP_NOT_NOW }, async () => {
    await rooms.pick(sari.id);
    const start = await thisMinute();
    const a = await rooms.requestHall({ name: 'Sari', startAt: start, endAt: new Date(Date.parse(start) + 30 * 60_000).toISOString() });
    assert.equal(rooms.ckHallOnAir(), null, 'a request does not light the lamp');
    await assert.rejects(rooms.decideHall(a.id, 'confirm'), refused(403, 'forbidden'));
    await rooms.pick(pak.id);
    assert.ok(rooms.isHallOperator());
    await rooms.decideHall(a.id, 'confirm');
    assert.equal(rooms.ckHallOnAir().id, a.id);
    await rooms.decideHall(a.id, 'decline');
    assert.equal(rooms.ckHallOnAir(), null);
    assert.equal(rooms.blackBoxInUse(), null, 'the hall never lights Black Box');
  });

  await t.test('a note carries this device\'s name', async () => {
    await rooms.pick(sari.id);
    const n = await CE.notes.create({ id: CE.uuid(), body: 'Pojok baca', color: null });
    assert.deepEqual([n.authorId, n.authorName], [sari.id, 'Sari']);
    rooms.forget();
    assert.equal(rooms.me(), null);
    const anon = await CE.notes.create({ id: CE.uuid(), body: 'no name', color: null });
    assert.equal(anon.authorId, null);
  });
});

test('CE.rooms on the office backend (/v1 + /v1/live)', { skip: SKIP_DB }, async (t) => {
  const { pool, companyId } = await setupDb();
  await resetRooms(pool);
  const app = labApp({ pool, companyId });
  const server = http.createServer(app);
  const wss = attachLive(server, { hub: app.locals.hub, pool, companyId, authenticate: app.locals.authenticate });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const host = '127.0.0.1:' + server.address().port;
  const base = 'http://' + host;
  t.after(async () => {
    wss.clients.forEach((ws) => ws.terminate());
    await new Promise((r) => server.close(r));
    await pool.end();
  });

  /* A browser tab served by the office server, holding the lab session cookie a CCG hand-off left (012). */
  function officePage(cookie) {
    const withCookie = cookie ? { Cookie: cookie } : {};
    class PageSocket extends WebSocket {
      constructor(url) { super(url, { origin: base, headers: withCookie }); this.on('error', () => {}); }
    }
    return page({
      CE_STORE: 'api', WebSocket: PageSocket,
      fetch: (url, opts = {}) => fetch(new URL(url, base + '/'), Object.assign({}, opts, { headers: Object.assign({}, opts.headers, withCookie) })),
      location: { protocol: 'http:', host, pathname: '/' },
    });
  }
  /* A CCG staff member's tab, entered the real way: the hand-off makes the name (and tells every wall) and
   * leaves the session; the page then asks the server who it is. The hall operator role is the office's
   * to give (scripts/add-person.js), so it is set by SQL. */
  async function as(name, role = 'guest') {
    const res = await fetch(base + '/v1/ccg/enter', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ token: mintAssertion({ name, email: name.toLowerCase().replace(/\W+/g, '.') + '@ccg.test' }) }),
    });
    assert.equal(res.status, 200, name + ' entered');
    const cookie = res.headers.get('set-cookie').split(';')[0];
    const person = (await res.json()).person;
    if (role === 'hall_operator') await pool.query("UPDATE people SET role = 'hall_operator' WHERE id = $1", [person.id]);
    const CE = officePage(cookie);
    await until(() => CE.live.connected() && CE.rooms.ready() && CE.rooms.me() && CE.rooms.me().id === person.id, name + ' signed in');
    return CE.rooms;
  }
  /* A span covering now goes in by SQL (bookings may not start in the past), then each page reloads. */
  async function coveringNow(room, status, by, pages) {
    const { rows } = await pool.query(
      "INSERT INTO bookings (company_id, room, title, start_at, end_at, status, created_by)" +
      " VALUES ($1, $2, 'Now', now() - interval '10 minutes', now() + interval '20 minutes', $3, $4) RETURNING id",
      [companyId, room, status, by]);
    await Promise.all(pages.map((p) => p.refresh()));
    return rows[0].id;
  }

  const lobby = await as('Lobby');               // a signed-in colleague watching the corridor
  const stranger = officePage(null).rooms;        // no lab session: nothing works
  const rina = await as('Rina');
  const sari = await as('Sari');
  const pak = await as('Pak Hall', 'hall_operator');

  await t.test('a new name reaches every page over /v1/live', async () => {
    await until(() => lobby.people().length >= 4, 'lobby hears the names');
    assert.equal(lobby.me().displayName, 'Lobby');
  });

  await t.test("staff only: the name is the session's; no picking, no adding; a stranger gets nothing", async () => {
    assert.equal(rina.signedIn(), true);
    await assert.rejects(rina.pick(sari.me().id), refused(403, 'names_from_ccg'));
    await assert.rejects(rina.addName('Someone'), refused(403, 'names_from_ccg'));
    assert.equal(rina.me().displayName, 'Rina');
    assert.equal(stranger.me(), null);
    await assert.rejects(stranger.bookMeeting({ title: 'x', startAt: at(4), endAt: at(5) }), refused(401, 'sign_in_required'));
  });

  await t.test('a booking with an invitation reaches the invitee as a notice; the answer reaches the booker', async () => {
    const m = await rina.bookMeeting({ title: 'Pitch review', startAt: at(1), endAt: at(2), invite: [sari.me().id] });
    await until(() => sari.notices().some((n) => n.kind === 'invite' && n.booking.id === m.id), 'Sari is invited');
    await sari.respond(m.id, 'accepted');
    await until(() => rina.booking(m.id).invites[0].status === 'accepted', 'Rina sees the answer');
    await assert.rejects(sari.bookMeeting({ title: 'Clash', startAt: at(1.5), endAt: at(3) }), refused(409, 'booking_conflict'));
    await assert.rejects(sari.cancelMeeting(m.id), refused(403, 'forbidden'));
    await assert.rejects(stranger.bookMeeting({ title: 'x', startAt: at(4), endAt: at(5) }), refused(401, 'sign_in_required'));
  });

  await t.test('Black Box in use and CK Hall ON AIR read the spans covering now on every page', async () => {
    const m = await coveringNow('black_box', 'active', rina.me().id, [lobby, rina]);
    assert.equal(lobby.blackBoxInUse().id, m);
    await rina.cancelMeeting(m);
    await until(() => !lobby.blackBoxInUse(), 'cancel reaches the lobby');
    const h = await coveringNow('ck_hall', 'requested', sari.me().id, [lobby, pak, sari]);
    assert.equal(lobby.ckHallOnAir(), null);
    await pak.decideHall(h, 'confirm');
    await until(() => lobby.ckHallOnAir() && sari.ckHallOnAir(), 'ON AIR on every page');
    await pak.decideHall(h, 'decline');
    await until(() => !lobby.ckHallOnAir(), 'lamp off');
  });

  await t.test('following: Rina hears that Sari is coming in', async () => {
    await rina.follow(sari.me().id, true);
    await sari.markArrival(true);
    await sari.markArrival(true, 'after lunch');
    await until(() => rina.notices().some((n) => n.kind === 'arrival' && n.arrival.note === 'after lunch'), 'Rina notified');
    await until(() => lobby.arrivals().length === 1, 'everyone sees today\'s list, one line per name');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM arrivals')).rows[0].n, 1);
  });
});

/* 012 closed the Data API to browsers, so this backend no longer runs in production. It still proves the
 * page's Neon adapter against the wall.* rules, called as the owner (helpers.js asApi). */
test('CE.rooms on the GitHub Pages backend (wall.* + the existing poller)', { skip: SKIP_DB }, async (t) => {
  const { pool } = await setupDb();
  await stubAuth(pool);
  await resetRooms(pool);
  t.after(() => pool.end());

  /* The Neon Data API stand-in (page-harness.js). */
  const dataApi = neonStandIn(pool);
  const pagesTab = () => page({
    CE_STORE: 'neon', CE_NEON: NEON, fetch: dataApi, document: { hidden: false },
  });

  const lobbyTab = pagesTab();
  const lobby = lobbyTab.rooms;
  const rinaTab = pagesTab();
  const rina = rinaTab.rooms;
  await until(() => lobby.ready() && rina.ready(), 'first poll');
  assert.equal(rinaTab.backend, 'neon');

  await t.test('a name added on one tab appears on the other through its poll', async () => {
    await rina.addName('Rina');
    await until(() => lobby.people().some((p) => p.displayName === 'Rina'), 'lobby poll sees Rina');
  });

  await t.test('a booking with an invitation reaches the other tab, and a note carries its author', async () => {
    const sari = await lobby.addName('Sari');
    const m = await rina.bookMeeting({ title: 'Board talk', startAt: at(1), endAt: at(2), invite: [sari.id] });
    await until(() => lobby.notices().some((n) => n.kind === 'invite' && n.booking.id === m.id), 'Sari is invited');
    await lobby.respond(m.id, 'declined');
    await until(() => rina.booking(m.id).invites[0].status === 'declined', 'Rina sees the answer');
    await assert.rejects(lobby.cancelMeeting(m.id), refused(403, 'forbidden'));
    const n = await rinaTab.notes.create({ id: rinaTab.uuid(), body: 'From Pages', color: null });
    assert.equal(n.authorName, 'Rina');
  });

  await t.test('a refusal on a role is final, not retried', async () => {
    const h = await rina.requestHall({ name: 'Rina', startAt: at(3), endAt: at(4) });
    const started = Date.now();
    await assert.rejects(rina.decideHall(h.id, 'confirm'), refused(403, 'forbidden'));
    assert.ok(Date.now() - started < 500, 'forbidden is final, not a token still settling');
  });
});
