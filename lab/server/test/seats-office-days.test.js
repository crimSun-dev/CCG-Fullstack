'use strict';

/* 009: chairs at the Black Box table, and office days with the trip in. The database rules through the
 * wall.* functions the Neon Data API calls, and the same rules over /v1/hub on the office server.
 * The trip is "today" only; today may be a weekend, so those cases pin wall_private.hq_today() to a
 * weekday inside one transaction and roll it back. */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { SKIP_DB, BOOK_T0, setupDb, resetRooms, stubAuth, asApi, labApp, sessionCookie, signedIn } = require('./helpers');

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const T0 = BOOK_T0;   // a weekday morning, never in the past
const at = (hours) => new Date(T0 + hours * HOUR).toISOString();
const jakarta = (t) => new Date(t + 7 * HOUR);
const ymd = (t) => jakarta(t).toISOString().slice(0, 10);
const isWeekday = (t) => { const d = jakarta(t).getUTCDay(); return d !== 0 && d !== 6; };
/* The weekdays of the 14-day reach, as YYYY-MM-DD, from today. */
const WEEKDAYS = Array.from({ length: 14 }, (_, i) => Date.now() + i * DAY).filter(isWeekday).map(ymd);
const WEEKEND = Array.from({ length: 7 }, (_, i) => Date.now() + i * DAY).filter((t) => !isWeekday(t)).map(ymd)[0];
const BEYOND = ymd(Date.now() + 15 * DAY);
const YESTERDAY = ymd(Date.now() - DAY);

test('009: seats and office days', { skip: SKIP_DB }, async (t) => {
  const { pool, companyId } = await setupDb();
  t.after(() => pool.end());
  await stubAuth(pool);

  const call = (fn, args = {}) => {
    const names = Object.keys(args);
    return asApi(pool, null,
      'SELECT wall.' + fn + '(' + names.map((n, i) => n + ' => $' + (i + 1)).join(', ') + ')',
      names.map((n) => args[n]));
  };
  const fails = (status, code) => (err) => {
    assert.equal(err.code, 'PT' + status, err.message);
    if (code) assert.equal(err.message, code);
    return true;
  };
  async function person(name) {
    const { rows } = await pool.query(
      "INSERT INTO people (company_id, display_name, role) VALUES ($1, $2, 'guest') RETURNING id", [companyId, name]);
    return rows[0].id;
  }
  let slot = 0;   // each meeting its own hour, so the overlap rule never answers first
  const meeting = (me, invite, seats, over = {}) => { slot += 1; return call('book_black_box', Object.assign(
    { me, booking_id: crypto.randomUUID(), title: 'Weekly sync', start_at: at(slot), end_at: at(slot + 0.5), invite, seats }, over)); };
  const seatsOf = (b) => Object.fromEntries(b.invites.map((i) => [i.name, [i.seat, i.status]]));

  /* Run fn with today pinned to day (a weekday), in one transaction that is rolled back. */
  async function onDay(day, fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`CREATE OR REPLACE FUNCTION wall_private.hq_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT '${day}'::date $$`);
      const q = async (fnName, args) => {
        try {
          await client.query('SAVEPOINT s');
          const { rows } = await client.query(
            'SELECT wall_private.' + fnName + '(' + args.map((_, i) => '$' + (i + 1)).join(', ') + ') AS out', args);
          await client.query('RELEASE SAVEPOINT s');
          return rows[0].out;
        } catch (err) {
          await client.query('ROLLBACK TO SAVEPOINT s');
          throw err;
        }
      };
      await fn(q);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  }

  let host, rina, dewi, sari;
  const many = [];
  t.beforeEach(async () => {
    await resetRooms(pool);
    host = await person('Draven');
    rina = await person('Rina');
    dewi = await person('Dewi');
    sari = await person('Sari');
    many.length = 0;
    for (const n of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8']) many.push(await person(n));
  });

  /* ------------------------------------------------------------ chairs -- */

  await t.test('booking seats each guest at a chair; chair 1 is the host and is not stored', async () => {
    const b = await meeting(host, [rina, dewi, sari], [2, 5, null]);
    assert.deepEqual(seatsOf(b), { Dewi: [5, 'invited'], Rina: [2, 'invited'], Sari: [null, 'invited'] });
    await assert.rejects(meeting(host, [rina], [1]), fails(400, 'validation_failed'), 'chair 1 is the host');
    await assert.rejects(meeting(host, [rina], [9]), fails(400, 'validation_failed'));
    await assert.rejects(meeting(host, [rina, dewi], [3, 3]), fails(400, 'validation_failed'), 'one person per chair');
    await assert.rejects(meeting(host, [rina, dewi], [3]), fails(400, 'validation_failed'), 'seats line up with the names');
  });

  await t.test('the table holds the host and 7 more; an 8th guest is refused and nothing is booked', async () => {
    const id = crypto.randomUUID();
    await assert.rejects(meeting(host, many.slice(0, 8), null, { booking_id: id }), fails(409, 'table_full'));
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings WHERE id = $1', [id])).rows[0].n, 0);
    const b = await meeting(host, many.slice(0, 7), null);
    assert.equal(b.invites.length, 7);
    await assert.rejects(call('invite', { me: host, booking_id: b.id, people: [rina] }), fails(409, 'table_full'));
  });

  await t.test('a chair already taken is refused when inviting more; a free chair is fine', async () => {
    const b = await meeting(host, [rina], [2]);
    await assert.rejects(call('invite', { me: rina, booking_id: b.id, people: [dewi], seats: [2] }), fails(409, 'seat_taken'));
    const out = await call('invite', { me: rina, booking_id: b.id, people: [dewi], seats: [3] });
    assert.deepEqual(seatsOf(out).Dewi, [3, 'invited']);
  });

  await t.test('declining empties the chair; someone else can take it; accepting again does not reclaim it', async () => {
    const b = await meeting(host, [rina], [2]);
    const declined = await call('respond', { me: rina, booking_id: b.id, response: 'declined' });
    assert.deepEqual(seatsOf(declined).Rina, [null, 'declined']);
    const taken = await call('invite', { me: host, booking_id: b.id, people: [dewi], seats: [2] });
    assert.deepEqual(seatsOf(taken).Dewi, [2, 'invited']);
    const back = await call('respond', { me: rina, booking_id: b.id, response: 'accepted' });
    assert.deepEqual(seatsOf(back).Rina, [null, 'accepted'], 'coming, at any free chair');
  });

  await t.test('asking a decliner again at a chair invites them anew', async () => {
    const b = await meeting(host, [rina], [2]);
    await call('respond', { me: rina, booking_id: b.id, response: 'declined' });
    const again = await call('invite', { me: host, booking_id: b.id, people: [rina], seats: [4] });
    assert.deepEqual(seatsOf(again).Rina, [4, 'invited']);
  });

  await t.test('a full table refuses a decliner who changes their mind', async () => {
    const b = await meeting(host, many.slice(0, 7), null);
    await call('respond', { me: many[0], booking_id: b.id, response: 'declined' });
    await call('invite', { me: host, booking_id: b.id, people: [rina] });
    await assert.rejects(call('respond', { me: many[0], booking_id: b.id, response: 'accepted' }), fails(409, 'table_full'));
  });

  await t.test('invitations without chairs still work (008 callers), and CK Hall has no chairs', async () => {
    const b = await meeting(host, [rina, dewi], null);
    assert.deepEqual(seatsOf(b), { Dewi: [null, 'invited'], Rina: [null, 'invited'] });
    const hall = await call('request_ck_hall', { me: host, booking_id: crypto.randomUUID(), name: 'Launch', start_at: at(3), end_at: at(4), invite: [rina] });
    assert.deepEqual(seatsOf(hall), { Rina: [null, 'invited'] });
    await assert.rejects(pool.query(
      "SELECT wall_private.hq_book($1, $2, 'ck_hall', $3, 'Launch', $4, $5, NULL, $6, $7)",
      [companyId, host, crypto.randomUUID(), at(50), at(51), [rina], [2]]), (e) => e.message === 'validation_failed' && /Only Black Box has chairs/.test(e.detail));
  });

  /* -------------------------------------------------------- office days -- */

  await t.test('a plan for any weekday in the reach: coming, note and arrival time; saying it again updates it', async () => {
    const day = WEEKDAYS[WEEKDAYS.length - 1];
    const a = await call('plan_day', { me: rina, day, coming: true, note: 'after the shoot', arrive_at: '10:15' });
    assert.deepEqual([a.day, a.coming, a.note, a.arriveAt, a.trip], [day, true, 'after the shoot', '10:15', null]);
    const b = await call('plan_day', { me: rina, day, coming: false });
    assert.deepEqual([b.id, b.coming, b.arriveAt], [a.id, false, null], 'one line per name per day; not coming drops the time');
    assert.equal((await call('list_plans')).filter((p) => p.day === day).length, 1);
  });

  await t.test('plans refuse weekends, the past, and days beyond the two-week reach', async () => {
    if (WEEKEND) await assert.rejects(call('plan_day', { me: rina, day: WEEKEND, coming: true }), fails(400, 'validation_failed'));
    await assert.rejects(call('plan_day', { me: rina, day: YESTERDAY, coming: true }), fails(400, 'validation_failed'));
    await assert.rejects(call('plan_day', { me: rina, day: BEYOND, coming: true }), fails(400, 'validation_failed'));
    await assert.rejects(call('plan_day', { me: null, day: WEEKDAYS[0], coming: true }), fails(401, 'person_required'));
  });

  await t.test('repeat copies a day to the same weekday next week, inside the reach only', async () => {
    const day = WEEKDAYS[0];
    await assert.rejects(call('repeat_day', { me: rina, day }), fails(409, 'invalid_state'), 'nothing to repeat yet');
    await call('plan_day', { me: rina, day, coming: true, note: 'standup', arrive_at: '08:30' });
    const next = await call('repeat_day', { me: rina, day });
    assert.deepEqual([next.day, next.coming, next.note, next.arriveAt], [ymd(Date.parse(day + 'T00:00:00+07:00') + 7 * DAY), true, 'standup', '08:30']);
    const late = WEEKDAYS.find((d) => Date.parse(d + 'T00:00:00+07:00') + 7 * DAY >= Date.now() + 13 * DAY);
    if (late) {
      await call('plan_day', { me: rina, day: late, coming: true });
      await assert.rejects(call('repeat_day', { me: rina, day: late }), fails(400, 'validation_failed'), 'next week is past the reach');
    }
  });

  await t.test('clear takes a day back (Repeat off); nothing to clear is a 404; a started trip is kept', async () => {
    const day = WEEKDAYS[0];
    const to = ymd(Date.parse(day + 'T00:00:00+07:00') + 7 * DAY);
    await call('plan_day', { me: dewi, day, coming: true, arrive_at: '09:00' });
    const copy = await call('repeat_day', { me: dewi, day });
    const gone = await call('clear_day', { me: dewi, day: to });
    assert.deepEqual([gone.id, gone.day, gone.cleared], [copy.id, to, true]);
    const left = await pool.query('SELECT count(*)::int AS n FROM arrivals WHERE person_id = $1 AND day = $2', [dewi, to]);
    assert.equal(left.rows[0].n, 0);
    await assert.rejects(call('clear_day', { me: dewi, day: to }), fails(404, 'not_found'));
    await assert.rejects(call('clear_day', { me: dewi, day: YESTERDAY }), fails(400, 'validation_failed'));
    assert.ok(await call('repeat_day', { me: dewi, day }), 'and it can be repeated again');
  });

  await t.test('the corridor snapshot carries the plans; arrivals stays today\'s list', async () => {
    const later = WEEKDAYS.find((d) => d !== ymd(Date.now()));
    await call('plan_day', { me: dewi, day: later, coming: true, arrive_at: '09:00' });
    const rooms = await call('hub_rooms');
    assert.deepEqual(rooms.plans.map((p) => [p.name, p.day, p.arriveAt]), [['Dewi', later, '09:00']]);
    assert.equal(rooms.arrivals.filter((a) => a.day === later).length, 0);
  });

  await t.test('the trip in: on the way, arrived, undo; not coming clears it', async () => {
    await onDay('2026-10-19', async (q) => {
      await assert.rejects(q('hq_trip', [companyId, rina, 'arrived']), (e) => e.message === 'invalid_state');
      const go = await q('hq_trip', [companyId, rina, 'on_the_way']);
      assert.deepEqual([go.day, go.coming, go.trip], ['2026-10-19', true, 'on_the_way'], 'on the way says coming in too');
      assert.ok(go.leftAt);
      const there = await q('hq_trip', [companyId, rina, 'arrived']);
      assert.equal(there.trip, 'arrived');
      assert.ok(there.arrivedAt);
      const undo = await q('hq_trip', [companyId, rina, 'reset']);
      assert.deepEqual([undo.trip, undo.coming], [null, true]);
      await q('hq_trip', [companyId, rina, 'on_the_way']);
      const off = await q('hq_mark_arrival', [companyId, rina, false, null]);
      assert.deepEqual([off.coming, off.trip, off.leftAt], [false, null, null]);
      await assert.rejects(q('hq_trip', [companyId, rina, 'fly']), (e) => e.message === 'validation_failed');
    });
    await onDay('2026-10-24', async (q) => {
      await assert.rejects(q('hq_trip', [companyId, rina, 'on_the_way']), (e) => e.message === 'validation_failed' && /Monday to Friday/.test(e.detail));
    });
  });

  await t.test('the database refuses a trip without coming in, and an arrival without leaving', async () => {
    await assert.rejects(pool.query(
      "INSERT INTO arrivals (company_id, person_id, day, coming, left_at) VALUES ($1, $2, CURRENT_DATE + 30, false, now())",
      [companyId, rina]), /arrivals_trip_check/);
    await assert.rejects(pool.query(
      "INSERT INTO arrivals (company_id, person_id, day, coming, arrived_at) VALUES ($1, $2, CURRENT_DATE + 31, true, now())",
      [companyId, rina]), /arrivals_trip_check/);
  });

  /* --------------------------------------------------------- over HTTP -- */

  await t.test('/v1/hub: seats on booking and invite, plans, repeat, and shape checks', async () => {
    // Staff only (012): each request carries the session of the person its body names as `me`.
    const app = labApp({ pool, companyId });
    const cookies = new Map();
    for (const id of [host, rina, dewi, sari]) cookies.set(id, await sessionCookie(pool, companyId, id));
    const api = () => signedIn(app, cookies, cookies.get(host));
    const post = (url, body) => api().post(url).send(body);
    const b = (await post('/v1/hub/black-box', { me: host, id: crypto.randomUUID(), title: 'Sync', startAt: at(60), endAt: at(61),
      invite: [rina, dewi], seats: [3, null] }).expect(201)).body;
    assert.deepEqual(seatsOf(b), { Dewi: [null, 'invited'], Rina: [3, 'invited'] });
    await post('/v1/hub/black-box', { me: host, title: 'Sync', startAt: at(62), endAt: at(63), invite: [rina], seats: [3, 4] }).expect(400);
    await post('/v1/hub/black-box', { me: host, title: 'Sync', startAt: at(62), endAt: at(63), invite: [rina], seats: ['3'] }).expect(400);
    await post('/v1/hub/ck-hall', { me: host, name: 'Launch', startAt: at(64), endAt: at(65), invite: [rina], seats: [2] }).expect(400);
    const more = (await post('/v1/hub/bookings/' + b.id + '/invite', { me: host, people: [sari], seats: [4] }).expect(200)).body;
    assert.deepEqual(seatsOf(more).Sari, [4, 'invited']);
    await post('/v1/hub/bookings/' + b.id + '/invite', { me: host, people: [many[0]], seats: [4] }).expect(409);

    const day = WEEKDAYS[0];
    const plan = (await api().put('/v1/hub/arrivals/' + day).send({ me: rina, coming: true, arriveAt: '08:45' }).expect(200)).body;
    assert.deepEqual([plan.day, plan.arriveAt], [day, '08:45']);
    await api().put('/v1/hub/arrivals/' + day).send({ me: rina, coming: true, arriveAt: '8:45' }).expect(400);
    await api().put('/v1/hub/arrivals/someday').send({ me: rina, coming: true }).expect(400);
    await api().put('/v1/hub/arrivals/' + BEYOND).send({ me: rina, coming: true }).expect(400);
    await post('/v1/hub/arrivals/' + day + '/repeat', { me: rina }).expect(200);
    assert.equal((await api().get('/v1/hub/plans').expect(200)).body.plans.length, 2);
    const to = ymd(Date.parse(day + 'T00:00:00+07:00') + 7 * DAY);
    assert.equal((await api().delete('/v1/hub/arrivals/' + to).send({ me: rina }).expect(200)).body.cleared, true);
    await api().delete('/v1/hub/arrivals/' + to).send({ me: rina }).expect(404);
    assert.equal((await api().get('/v1/hub/plans').expect(200)).body.plans.length, 1);
    await post('/v1/hub/arrivals/' + day + '/repeat', { me: rina }).expect(200);
    await post('/v1/hub/arrivals/today/trip', { me: rina, step: 'fly' }).expect(400);
    // today's line still works the 008 way
    await api().put('/v1/hub/arrivals/today').send({ me: dewi, coming: true }).expect(200);
  });
});
