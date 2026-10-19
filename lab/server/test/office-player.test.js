'use strict';

/* The office player, proven end to end: each control's write goes through /v1/hub (the office server) or
 * wall.* (the Neon Data API that GitHub Pages calls) to the test database, and a second read agrees with
 * what the page shows. The second read is a fresh page on the same device (a reload) and the rows
 * themselves. corridor-page.test.js covers the same page on the local backend; seats-office-days.test.js
 * the rules alone.
 *
 * The trip in is "today" only and today may be a weekend, so the trip proofs pin wall_private.hq_today()
 * to the first weekday of the reach for their own span and put the real one back after. */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { SKIP_DB, setupDb, resetRooms, stubAuth, asApi, labApp, sessionCookie, signedIn } = require('./helpers');
const { CORRIDOR_SRC, CSS, HTML, corridorPage, deviceStorage, button, until, NEON, neonStandIn } = require('./page-harness');

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const jakarta = (t) => new Date(t + 7 * HOUR);
const ymd = (t) => jakarta(t).toISOString().slice(0, 10);
const isWeekday = (t) => { const d = jakarta(t).getUTCDay(); return d !== 0 && d !== 6; };
/* The weekdays of the 14-day reach, as YYYY-MM-DD, from today. */
const WEEKDAYS = Array.from({ length: 14 }, (_, i) => Date.now() + i * DAY).filter(isWeekday).map(ymd);
const WEEKEND = Array.from({ length: 7 }, (_, i) => Date.now() + i * DAY).filter((t) => !isWeekday(t)).map(ymd)[0];
const plus7 = (day) => ymd(Date.parse(day + 'T00:00:00+07:00') + 7 * DAY);
const REACH_END = ymd(Date.now() + 14 * DAY);
/* A weekday whose same weekday next week is past the reach. */
const LATE = WEEKDAYS.find((d) => plus7(d) >= REACH_END);
const PERSON_KEY = 'creative-episode.hub-person.v1';
const TINTS = ['blue', 'pink', 'green', 'yellow'];

/* A store refusal: .status and .code. */
const refused = (status, code) => (err) => { assert.equal(err.status, status, err.message); if (code) assert.equal(err.code, code); return true; };
/* A wall_private refusal: PTnnn and the code as message. */
const fails = (status, code) => (err) => { assert.equal(err.code, 'PT' + status, err.message); if (code) assert.equal(err.message, code); return true; };

test('the office player, end to end', { skip: SKIP_DB }, async (t) => {
  const { pool, companyId } = await setupDb();
  await stubAuth(pool);
  const app = labApp({ pool, companyId, rateLimit: { hub: { limit: 100_000 } } });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const pages = [];
  t.after(async () => {
    pages.forEach((p) => p.close());
    await new Promise((r) => server.close(r));
    await pool.end();
  });

  /* wall.fn(named args) as the Data API runs it. */
  const call = (fn, args = {}) => {
    const names = Object.keys(args);
    return asApi(pool, null,
      'SELECT wall.' + fn + '(' + names.map((n, i) => n + ' => $' + (i + 1)).join(', ') + ')',
      names.map((n) => args[n]));
  };
  // Staff only (012): each name has a lab session. A device on the office server carries its person's.
  const cookies = new Map();
  async function person(name, role = 'guest') {
    const { rows } = await pool.query(
      'INSERT INTO people (company_id, display_name, role) VALUES ($1, $2, $3) RETURNING id', [companyId, name, role]);
    cookies.set(rows[0].id, await sessionCookie(pool, companyId, rows[0].id));
    return rows[0].id;
  }
  /* The stored lines of one name, read straight from the table. */
  async function rows(personId) {
    const { rows: out } = await pool.query(
      "SELECT day::text AS day, coming, note, to_char(arrive_at, 'HH24:MI') AS \"arriveAt\"," +
      ' left_at IS NOT NULL AS "left", arrived_at IS NOT NULL AS arrived FROM arrivals WHERE person_id = $1 ORDER BY day',
      [personId]);
    return out;
  }
  const rowOn = async (personId, day) => (await rows(personId)).find((r) => r.day === day) || null;

  /* Today pinned to a weekday for fn's span, then the real hq_today() of 007 again (also put back first,
   * in case an earlier run stopped while pinned). */
  const realToday = "CREATE OR REPLACE FUNCTION wall_private.hq_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date $$";
  await pool.query(realToday);
  async function onWeekday(fn) {
    const day = WEEKDAYS[0];
    await pool.query(`CREATE OR REPLACE FUNCTION wall_private.hq_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT '${day}'::date $$`);
    try { await fn(day); } finally { await pool.query(realToday); }
  }

  /* ------------------------------------------------------- the backends -- */
  /* Each records the writes it sends: { what, args }, what being 'METHOD /path' or the wall.* name. */
  const READS = new Set(['hub_rooms', 'hub_people', 'list_bookings', 'list_notes', 'list_strokes']);
  const BACKENDS = [
    {
      label: 'the office server (/v1/hub)',
      signedIn: true,
      make(storage, log) {
        // The browser's cookie jar: the session of the person this device is.
        const cookie = cookies.get(storage.getItem(PERSON_KEY));
        return corridorPage({
          CE_STORE: 'api', AbortController, localStorage: storage,
          fetch: (url, opts = {}) => {
            const u = new URL(url, base + '/');
            if (opts.method && opts.method !== 'GET' && !u.pathname.startsWith('/v1/ccg/')) {
              log.push({ what: opts.method + ' ' + u.pathname, args: JSON.parse(opts.body || '{}') });
            }
            return fetch(u, Object.assign({}, opts, { headers: Object.assign({}, opts.headers, cookie ? { Cookie: cookie } : {}) }));
          },
        });
      },
      route: {
        plan: (day) => 'PUT /v1/hub/arrivals/' + day,
        repeat: (day) => 'POST /v1/hub/arrivals/' + day + '/repeat',
        clear: (day) => 'DELETE /v1/hub/arrivals/' + day,
        follow: (id) => 'PUT /v1/hub/follows/' + id,
        book: () => 'POST /v1/hub/black-box',
        invite: (id) => 'POST /v1/hub/bookings/' + id + '/invite',
        respond: (id) => 'POST /v1/hub/bookings/' + id + '/respond',
        cancel: (id) => 'POST /v1/hub/black-box/' + id + '/cancel',
        hall: () => 'POST /v1/hub/ck-hall',
        confirm: (id) => 'POST /v1/hub/ck-hall/' + id + '/confirm',
      },
    },
    {
      label: 'GitHub Pages (wall.* on the Neon Data API)',
      make(storage, log) {
        const onCall = (fn, args) => { if (!READS.has(fn)) log.push({ what: fn, args }); };
        return corridorPage({ CE_STORE: 'neon', CE_NEON: NEON, AbortController, atob, localStorage: storage, fetch: neonStandIn(pool, onCall) });
      },
      route: {
        plan: () => 'plan_day', repeat: () => 'repeat_day', clear: () => 'clear_day', follow: () => 'follow',
        book: () => 'book_black_box', invite: () => 'invite', respond: () => 'respond', cancel: () => 'cancel_black_box',
        hall: () => 'request_ck_hall', confirm: () => 'decide_ck_hall',
      },
    },
  ];
  /* A device using a name, and a page on it that has its first snapshot. Open it again for a reload. */
  function device(personId) {
    const storage = deviceStorage();
    if (personId) storage.setItem(PERSON_KEY, personId);
    return storage;
  }
  async function open(backend, storage, log = []) {
    const page = backend.make(storage, log);
    page.log = log;
    pages.push(page);
    await until(() => page.CE.rooms.ready() && (!page.CE.rooms.signedIn() || page.CE.rooms.me()), 'first snapshot');
    await page.settle();
    return page;
  }
  async function reload(backend, page) {
    page.close();
    return open(backend, page.localStorage, page.log);
  }
  const lastWrite = (page) => page.log[page.log.length - 1];

  /* =================================================== Repeat, by route -- */

  await t.test('/v1/hub: Repeat on, off and on again; each step read back', async () => {
    await resetRooms(pool);
    const rina = await person('Rina');
    const api = () => signedIn(app, cookies, cookies.get(rina));
    const day = WEEKDAYS[0], next = plus7(day);
    await api().put('/v1/hub/arrivals/' + day).send({ me: rina, coming: true, note: 'standup', arriveAt: '08:30' }).expect(200);

    const on = (await api().post('/v1/hub/arrivals/' + day + '/repeat').send({ me: rina }).expect(200)).body;
    assert.deepEqual([on.day, on.coming, on.note, on.arriveAt], [next, true, 'standup', '08:30']);
    const planned = (await api().get('/v1/hub/plans').expect(200)).body.plans.find((p) => p.day === next);
    assert.deepEqual([planned.coming, planned.note, planned.arriveAt], [true, 'standup', '08:30'], 'a second read has the copy');
    assert.deepEqual(await rowOn(rina, next), { day: next, coming: true, note: 'standup', arriveAt: '08:30', left: false, arrived: false });

    // No session, no write. (Signed in, an empty body acts as the session's person.)
    await signedIn(app, null, null).delete('/v1/hub/arrivals/' + next).send({}).expect(401, /sign_in_required/);
    assert.ok(await rowOn(rina, next), 'a DELETE with no session removes nothing');
    const off = (await api().delete('/v1/hub/arrivals/' + next).send({ me: rina }).expect(200)).body;
    assert.deepEqual([off.day, off.cleared], [next, true]);
    assert.equal((await api().get('/v1/hub/plans').expect(200)).body.plans.some((p) => p.day === next), false);
    assert.equal(await rowOn(rina, next), null, 'Repeat off deletes the row');
    assert.ok(await rowOn(rina, day), 'and only that row');

    await api().post('/v1/hub/arrivals/' + day + '/repeat').send({ me: rina }).expect(200);
    const snap = (await api().get('/v1/hub/rooms').expect(200)).body;
    assert.deepEqual(snap.plans.filter((p) => p.day === next).map((p) => [p.name, p.note, p.arriveAt]), [['Rina', 'standup', '08:30']]);
    assert.ok(await rowOn(rina, next), 'Repeat on again restores it');
  });

  await t.test('wall.*: Repeat on, off and on again; each step read back', async () => {
    await resetRooms(pool);
    const rina = await person('Rina');
    const day = WEEKDAYS[0], next = plus7(day);
    await call('plan_day', { me: rina, day, coming: true, note: 'standup', arrive_at: '08:30' });
    const on = await call('repeat_day', { me: rina, day });
    assert.deepEqual([on.day, on.coming, on.note, on.arriveAt], [next, true, 'standup', '08:30']);
    assert.deepEqual((await call('hub_rooms')).plans.filter((p) => p.day === next).map((p) => [p.note, p.arriveAt]), [['standup', '08:30']]);
    assert.ok(await rowOn(rina, next));
    assert.equal((await call('clear_day', { me: rina, day: next })).cleared, true);
    assert.equal((await call('hub_rooms')).plans.some((p) => p.day === next), false);
    assert.equal(await rowOn(rina, next), null);
    await assert.rejects(call('clear_day', { me: rina, day: next }), fails(404, 'not_found'));
    await call('repeat_day', { me: rina, day });
    assert.equal((await call('list_plans')).filter((p) => p.day === next).length, 1);
    assert.ok(await rowOn(rina, next));
  });

  await t.test('Repeat is refused with no plan, past the reach, or on a weekend; nothing stored changes', async () => {
    await resetRooms(pool);
    const rina = await person('Rina');
    const api = () => signedIn(app, cookies, cookies.get(rina));
    const day = WEEKDAYS[0];
    await assert.rejects(call('repeat_day', { me: rina, day }), fails(409, 'invalid_state'));
    await api().post('/v1/hub/arrivals/' + day + '/repeat').send({ me: rina }).expect(409, /invalid_state/);
    assert.deepEqual(await rows(rina), [], 'nothing to repeat, nothing written');

    assert.ok(LATE, 'the reach has a weekday whose next week is past it');
    await call('plan_day', { me: rina, day: LATE, coming: true, note: 'late' });
    const before = await rows(rina);
    await assert.rejects(call('repeat_day', { me: rina, day: LATE }), fails(400, 'validation_failed'));
    await api().post('/v1/hub/arrivals/' + LATE + '/repeat').send({ me: rina }).expect(400, /validation_failed/);
    assert.deepEqual(await rows(rina), before, 'past the reach: unchanged');

    await assert.rejects(call('repeat_day', { me: rina, day: WEEKEND }), fails(400, 'validation_failed'));
    await api().post('/v1/hub/arrivals/' + WEEKEND + '/repeat').send({ me: rina }).expect(400, /validation_failed/);
    assert.deepEqual(await rows(rina), before, 'a weekend: unchanged');
  });

  /* ======================================== rooms on weekdays, by route -- */

  await t.test('the rooms are booked Monday to Friday, over /v1/hub and wall.*', async () => {
    await resetRooms(pool);
    const rina = await person('Rina');
    const api = () => signedIn(app, cookies, cookies.get(rina));
    const iso = (day, hhmm) => new Date(day + 'T' + hhmm + ':00+07:00').toISOString();
    const dayAfter = (day, n) => ymd(Date.parse(day + 'T00:00:00+07:00') + n * DAY);
    /* The next Saturday after today, the Friday and Sunday around it. */
    const sat = [1, 2, 3, 4, 5, 6, 7].map((i) => ymd(Date.now() + i * DAY)).find((d) => jakarta(Date.parse(d + 'T00:00:00+07:00')).getUTCDay() === 6);
    const fri = dayAfter(sat, -1), sun = dayAfter(sat, 1);
    const spans = [[iso(sat, '10:00'), iso(sat, '11:00')], [iso(sun, '09:00'), iso(sun, '17:00')],
      [iso(fri, '23:00'), iso(sat, '01:00')]];
    for (const [startAt, endAt] of spans) {
      if (Date.parse(startAt) < Date.now()) continue;
      const res = await api().post('/v1/hub/black-box').send({ me: rina, title: 'Weekend', startAt, endAt }).expect(400);
      assert.match(res.body.error.message, /Monday to Friday/);
      await api().post('/v1/hub/ck-hall').send({ me: rina, name: 'Weekend', startAt, endAt }).expect(400, /Monday to Friday/);
      await assert.rejects(call('book_black_box', { me: rina, booking_id: crypto.randomUUID(), title: 'Weekend', start_at: startAt, end_at: endAt }),
        fails(400, 'validation_failed'));
      await assert.rejects(call('request_ck_hall', { me: rina, booking_id: crypto.randomUUID(), name: 'Weekend', start_at: startAt, end_at: endAt }),
        fails(400, 'validation_failed'));
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n, 0, 'nothing booked on a weekend');
    /* Friday up to midnight is still a weekday. */
    const nextFri = dayAfter(sat, 6);
    await api().post('/v1/hub/black-box').send({ me: rina, title: 'Late Friday', startAt: iso(nextFri, '23:00'),
      endAt: iso(dayAfter(nextFri, 1), '00:00') }).expect(201);
  });

  /* ================================================== the trip, by route -- */

  await t.test('/v1/hub: on the way, arrived, undo; a started trip keeps its day; not coming clears it', async () => {
    await resetRooms(pool);
    const rina = await person('Rina');
    const api = () => signedIn(app, cookies, cookies.get(rina));
    const mine = async () => (await api().get('/v1/hub/arrivals').expect(200)).body.arrivals.find((a) => a.personId === rina);
    await onWeekday(async (today) => {
      await api().put('/v1/hub/arrivals/' + today).send({ me: rina, coming: true, arriveAt: '09:00' }).expect(200);
      const go = (await api().post('/v1/hub/arrivals/today/trip').send({ me: rina, step: 'on_the_way' }).expect(200)).body;
      assert.deepEqual([go.day, go.trip], [today, 'on_the_way']);
      assert.equal((await mine()).trip, 'on_the_way', 'a second read has the trip');
      assert.equal((await rowOn(rina, today)).left, true);

      await api().post('/v1/hub/arrivals/today/trip').send({ me: rina, step: 'arrived' }).expect(200);
      assert.equal((await mine()).trip, 'arrived');
      await api().post('/v1/hub/arrivals/today/trip').send({ me: rina, step: 'reset' }).expect(200);
      assert.deepEqual([(await mine()).trip, (await mine()).coming], [null, true], 'undo: coming in, not yet left');

      await api().post('/v1/hub/arrivals/today/trip').send({ me: rina, step: 'on_the_way' }).expect(200);
      const no = await api().delete('/v1/hub/arrivals/' + today).send({ me: rina }).expect(409);
      assert.equal(no.body.error.code, 'invalid_state', 'the refusal comes back to the caller');
      assert.equal((await mine()).trip, 'on_the_way', 'the plan and the trip stay');
      assert.deepEqual(await rowOn(rina, today), { day: today, coming: true, note: null, arriveAt: '09:00', left: true, arrived: false });

      const off = (await api().put('/v1/hub/arrivals/today').send({ me: rina, coming: false }).expect(200)).body;
      assert.deepEqual([off.coming, off.trip, off.arriveAt], [false, null, null]);
      assert.deepEqual([(await mine()).coming, (await mine()).trip], [false, null]);
      assert.deepEqual(await rowOn(rina, today), { day: today, coming: false, note: null, arriveAt: null, left: false, arrived: false });

      /* The player's own "not coming" is a plan for the day: it clears the time and the trip too. */
      await api().put('/v1/hub/arrivals/' + today).send({ me: rina, coming: true, arriveAt: '09:30' }).expect(200);
      await api().post('/v1/hub/arrivals/today/trip').send({ me: rina, step: 'on_the_way' }).expect(200);
      await api().put('/v1/hub/arrivals/' + today).send({ me: rina, coming: false }).expect(200);
      assert.deepEqual(await rowOn(rina, today), { day: today, coming: false, note: null, arriveAt: null, left: false, arrived: false });
    });
  });

  await t.test('wall.*: on the way, arrived, undo; a started trip keeps its day; not coming clears it', async () => {
    await resetRooms(pool);
    const rina = await person('Rina');
    const mine = async () => (await call('hub_rooms')).arrivals.find((a) => a.personId === rina);
    await onWeekday(async (today) => {
      await call('plan_day', { me: rina, day: today, coming: true, arrive_at: '09:00' });
      assert.equal((await call('trip', { me: rina, step: 'on_the_way' })).trip, 'on_the_way');
      assert.equal((await mine()).trip, 'on_the_way');
      await call('trip', { me: rina, step: 'arrived' });
      assert.equal((await mine()).trip, 'arrived');
      await call('trip', { me: rina, step: 'reset' });
      assert.deepEqual([(await mine()).trip, (await mine()).coming], [null, true]);

      await call('trip', { me: rina, step: 'on_the_way' });
      await assert.rejects(call('clear_day', { me: rina, day: today }), fails(409, 'invalid_state'));
      assert.equal((await mine()).trip, 'on_the_way');
      assert.equal((await rowOn(rina, today)).left, true);

      const off = await call('mark_arrival', { me: rina, coming: false });
      assert.deepEqual([off.coming, off.trip, off.arriveAt], [false, null, null]);
      assert.deepEqual(await rowOn(rina, today), { day: today, coming: false, note: null, arriveAt: null, left: false, arrived: false });
      await call('plan_day', { me: rina, day: today, coming: true, arrive_at: '09:30' });
      await call('trip', { me: rina, step: 'on_the_way' });
      await call('plan_day', { me: rina, day: today, coming: false });
      assert.deepEqual([(await mine()).coming, (await mine()).trip, (await mine()).arriveAt], [false, null, null]);
    });
  });

  for (const backend of BACKENDS) {
    await t.test('CE.rooms on ' + backend.label + ': the trip, its refusal, and not coming, read back after a reload', async () => {
      await resetRooms(pool);
      const rina = await person('Rina');
      await onWeekday(async (today) => {
        let page = await open(backend, device(rina));
        const rooms = () => page.CE.rooms;
        await rooms().planDay(today, { coming: true, arriveAt: '09:00' });
        await rooms().trip('on_the_way');
        page = await reload(backend, page);
        assert.equal(rooms().myPlan(today).trip, 'on_the_way', 'the trip survives a reload');
        await rooms().trip('arrived');
        page = await reload(backend, page);
        assert.equal(rooms().myPlan(today).trip, 'arrived');
        await rooms().trip('reset');
        page = await reload(backend, page);
        assert.deepEqual([rooms().myPlan(today).trip, rooms().myPlan(today).coming], [null, true]);

        await rooms().trip('on_the_way');
        await assert.rejects(rooms().clearDay(today), refused(409, 'invalid_state'), 'the store hands the refusal on');
        assert.equal(rooms().myPlan(today).trip, 'on_the_way', 'and keeps the line it had');
        page = await reload(backend, page);
        assert.equal(rooms().myPlan(today).trip, 'on_the_way');
        assert.equal(lastWrite(page).what, backend.route.clear(today));
        assert.equal(lastWrite(page).args.me, rina, 'clear carries me');

        await rooms().planDay(today, { coming: false });
        page = await reload(backend, page);
        assert.deepEqual([rooms().myPlan(today).coming, rooms().myPlan(today).trip, rooms().myPlan(today).arriveAt], [false, null, null]);
        assert.deepEqual(await rowOn(rina, today), { day: today, coming: false, note: null, arriveAt: null, left: false, arrived: false });
      });
    });
  }

  /* ================================================ the page, per backend -- */

  for (const backend of BACKENDS) {
    await t.test('the player on ' + backend.label, async (bt) => {
      await resetRooms(pool);
      const dewi = await person('Dewi');
      const sari = await person('Sari');
      const tono = await person('Tono');
      const bayu = await person('Bayu');
      const pak = await person('Pak Hall', 'hall_operator');
      // Office server: Rina Wati comes in signed in from CCG. Pages (device only): she picks her name.
      let P = backend.signedIn ? await open(backend, device(await person('Rina Wati'))) : await open(backend, device());
      let rina;
      const days = WEEKDAYS;
      const day = days[0], next = plus7(day);
      /* A weekday whose next week is past the reach, other than next. */
      const late = days.find((d) => plus7(d) >= REACH_END && d !== next);

      if (backend.signedIn) await bt.test('signed in from CCG: the name card shows the account at once; no picker, a Sign out', async () => {
        rina = P.CE.rooms.me().id;
        assert.equal(P.$('you-name').textContent, 'Rina Wati');
        assert.equal(P.$('you-initials').textContent, 'RW');
        assert.ok(TINTS.includes(P.$('you-avatar').dataset.tint));
        assert.equal(P.$('you-open').dataset.empty, 'false');
        P.$('you-open').click();
        assert.equal(P.$('names-panel').hidden, false);
        assert.equal(P.$('name-form').hidden, true, 'no adding a name');
        assert.equal(P.$('names-forget').hidden, false);
        assert.equal(P.$('names-forget').textContent, 'Sign out');
        assert.match(P.$('names-me').textContent, /^You are Rina Wati, signed in from CCG\.$/);
        assert.ok(!P.$('names-list').textContent.includes('This is me'), 'no picking someone else');
        P = await reload(backend, P);
        assert.equal(P.$('you-name').textContent, 'Rina Wati', 'a reload keeps the name');
        P.$('sheet-close').click();
      });

      if (!backend.signedIn) await bt.test('the name card: a person icon and "pick your name", then the name, You, and initials', async () => {
        assert.equal(P.$('you-name').textContent, 'pick your name');
        assert.equal(P.$('you-avatar').dataset.tint, 'none', 'no tint: the person icon shows');
        assert.equal(P.$('you-initials').textContent, '');
        assert.equal(P.$('you-open').dataset.empty, 'true');
        assert.equal(P.$('you-open').getAttribute('aria-label'), 'You: pick your name');
        assert.match(CSS, /\.youchip__av:not\(\[data-tint="none"\]\) svg, \.youchip__av\[data-tint="none"\] b \{ display: none; \}/,
          'the icon shows until a tint, the initials after');
        assert.match(HTML, /id="you-avatar-icon"><use href="#i-person"\/>[\s\S]*?<small>You<\/small><strong id="you-name">/);

        P.$('you-open').click();
        assert.equal(P.$('names-panel').hidden, false, 'the card opens the name picker');
        P.$('name-input').value = 'Rina Wati';
        P.$('name-form').fire('submit');
        await until(() => P.CE.rooms.me(), 'the name is used');
        rina = P.CE.rooms.me().id;
        assert.equal(P.$('you-name').textContent, 'Rina Wati');
        assert.equal(P.$('you-initials').textContent, 'RW');
        assert.ok(TINTS.includes(P.$('you-avatar').dataset.tint));
        assert.equal(P.$('you-open').dataset.empty, 'false');
        assert.equal(P.$('you-open').getAttribute('aria-label'), 'You: Rina Wati. Change name');
        const stored = await pool.query('SELECT display_name FROM people WHERE id = $1', [rina]);
        assert.equal(stored.rows[0].display_name, 'Rina Wati');
        P = await reload(backend, P);
        assert.equal(P.$('you-name').textContent, 'Rina Wati', 'a reload keeps the name');
        P.$('sheet-close').click();
      });

      await bt.test('Repeat on, off, on again from the page; the button follows the stored next week', async () => {
        P.$('arrivals-open').click();
        await P.settle();
        assert.equal(P.$('pl-repeat').getAttribute('aria-disabled'), 'true', 'nothing to repeat yet');
        P.$('pl-arrive').value = '08:30';
        P.$('arr-note').value = 'standup';
        P.$('pl-main').click();
        await until(() => P.CE.rooms.myPlan(day), 'the plan is saved');
        assert.deepEqual(lastWrite(P).what, backend.route.plan(day));
        assert.deepEqual(await rowOn(rina, day), { day, coming: true, note: 'standup', arriveAt: '08:30', left: false, arrived: false });
        assert.equal(P.$('pl-repeat').dataset.on, 'false');

        P.$('pl-repeat').click();
        await until(() => P.$('pl-repeat').dataset.on === 'true', 'Repeat lit');
        assert.equal(lastWrite(P).what, backend.route.repeat(day));
        assert.equal(P.$('pl-repeat').getAttribute('aria-pressed'), 'true');
        assert.deepEqual(await rowOn(rina, next), { day: next, coming: true, note: 'standup', arriveAt: '08:30', left: false, arrived: false });

        P.$('pl-repeat').click();
        await until(() => P.$('pl-repeat').dataset.on === 'false', 'Repeat off');
        assert.equal(lastWrite(P).what, backend.route.clear(next));
        assert.equal(lastWrite(P).args.me, rina, 'the DELETE carries me');
        assert.match(P.$('sheet-msg').textContent, /^Repeat off\./);
        assert.equal(await rowOn(rina, next), null, 'the next-week row is gone');

        P = await reload(backend, P);
        P.$('arrivals-open').click();
        await P.settle();
        assert.equal(P.CE.rooms.myPlan(next), null, 'a reload does not bring it back');
        assert.equal(P.$('pl-repeat').dataset.on, 'false');
        assert.equal(P.$('pl-repeat').getAttribute('aria-disabled'), 'false');

        P.$('pl-repeat').click();
        await until(() => P.$('pl-repeat').dataset.on === 'true', 'Repeat lit again');
        assert.ok(await rowOn(rina, next));
        P = await reload(backend, P);
        P.$('arrivals-open').click();
        await P.settle();
        assert.equal(P.$('pl-repeat').dataset.on, 'true', 'and a reload shows it on');

        /* No click flag: next week saying something else unlights the button. */
        await pool.query('UPDATE arrivals SET note = $3 WHERE person_id = $1 AND day = $2', [rina, next, 'something else']);
        await P.CE.rooms.refresh();
        await until(() => P.$('pl-repeat').dataset.on === 'false', 'a different next week is not a repeat');
        assert.equal(P.$('pl-repeat').getAttribute('aria-pressed'), 'false');
        P.$('pl-repeat').click();
        await until(() => P.$('pl-repeat').dataset.on === 'true', 'Repeat copies again');
        assert.equal((await rowOn(rina, next)).note, 'standup');
      });

      await bt.test('Repeat off on a day whose trip has started: the database refuses and the page says so', async () => {
        /* The page only clears next week; give that line a started trip so clear_day refuses for real. */
        await pool.query('UPDATE arrivals SET left_at = now() WHERE person_id = $1 AND day = $2', [rina, next]);
        await P.CE.rooms.refresh();
        await P.settle();
        assert.equal(P.$('pl-repeat').dataset.on, 'true');
        P.$('pl-repeat').click();
        await until(() => P.$('sheet-msg').dataset.tone === 'error', 'the refusal is shown');
        assert.match(P.$('sheet-msg').textContent, /^The trip in has started on \w+day \d+ \w+, so its plan stays\. Undo the trip first\.$/);
        assert.equal(lastWrite(P).what, backend.route.clear(next));
        assert.equal(P.$('pl-repeat').dataset.on, 'true', 'the button still says on');
        assert.equal((await rowOn(rina, next)).left, true, 'the row stays');
        await pool.query('UPDATE arrivals SET left_at = NULL WHERE person_id = $1 AND day = $2', [rina, next]);
      });

      await bt.test('Repeat refusals reach the caller through the store, and nothing stored changes', async () => {
        const rooms = P.CE.rooms;
        const empty = days.find((d) => d !== day && d !== next && plus7(d) < REACH_END);
        await assert.rejects(rooms.repeatDay(empty), refused(409, 'invalid_state'));
        await rooms.planDay(late, { coming: true });
        const before = await rows(rina);
        await assert.rejects(rooms.repeatDay(late), refused(400, 'validation_failed'));
        await assert.rejects(rooms.repeatDay(WEEKEND), refused(400, 'validation_failed'));
        assert.deepEqual(await rows(rina), before);
        await rooms.refresh();
        assert.equal(rooms.myPlan(plus7(late)), null);
        await rooms.clearDay(late);
      });

      await bt.test('not coming from the page drops the time, read back after a reload', async () => {
        const later = days.find((d) => d !== day && d !== next && d !== late);
        await P.CE.rooms.planDay(later, { coming: true, arriveAt: '10:00' });
        P.$('arrivals-open').click();
        await P.settle();
        while (P.$('pl-days').all().find((b) => b.getAttribute('aria-pressed') === 'true').dataset.day !== later) {
          P.$('pl-next').click();
          await P.settle();
        }
        assert.equal(P.$('pl-eta').textContent, 'Arrive by 10:00');
        P.$('arr-no').click();
        await until(() => P.CE.rooms.myPlan(later) && !P.CE.rooms.myPlan(later).coming, 'not coming saved');
        assert.deepEqual(await rowOn(rina, later), { day: later, coming: false, note: null, arriveAt: null, left: false, arrived: false });
        P = await reload(backend, P);
        P.$('arrivals-open').click();
        while (P.$('pl-days').all().find((b) => b.getAttribute('aria-pressed') === 'true').dataset.day !== later) {
          P.$('pl-next').click();
          await P.settle();
        }
        assert.equal(P.$('pl-badge').textContent, 'Not coming');
        assert.equal(P.$('pl-eta').textContent, '');
      });

      await bt.test('the people list: closed at first, then everyone with a plan that day, with a status dot', async () => {
        await call('plan_day', { me: dewi, day, coming: true, arrive_at: '09:15' });
        await call('plan_day', { me: sari, day, coming: false });
        await call('plan_day', { me: tono, day: next, coming: true });
        P = await reload(backend, P);
        P.$('arrivals-open').click();
        await P.settle();
        assert.equal(P.$('pl-list').hidden, true, 'closed at first');
        assert.equal(P.$('pl-who').getAttribute('aria-expanded'), 'false');
        P.$('pl-who').click();
        assert.equal(P.$('pl-list').hidden, false);
        assert.equal(P.$('pl-who').getAttribute('aria-expanded'), 'true');
        const list = P.$('arr-list').children;
        assert.deepEqual(list.map((li) => [li.children[1]._text, li.dataset.status]),
          [['Dewi', 'coming'], ['Rina Wati (you)', 'coming'], ['Sari', 'not']], 'Tono plans another day and is not listed');
        assert.match(CSS, /\.pl-list \.slot__time::before \{[^}]*background: var\(--dot/, 'each line has its dot');
        P.$('pl-who').click();
        assert.equal(P.$('pl-list').hidden, true, 'pressing again hides it');
      });

      await bt.test('Follow in the people list is stored and survives refreshes and a reload', async () => {
        P.$('pl-who').click();
        const dewiLine = () => P.$('arr-list').children.find((li) => li.textContent.includes('Dewi'));
        button(dewiLine(), 'Follow').click();
        await until(() => P.CE.rooms.isFollowing(dewi), 'following Dewi');
        assert.equal(lastWrite(P).what, backend.route.follow(dewi));
        assert.deepEqual([lastWrite(P).args.me, lastWrite(P).args.follow], [rina, true]);
        const f = await pool.query('SELECT count(*)::int AS n FROM follows WHERE person_id = $1 AND follows_id = $2', [rina, dewi]);
        assert.equal(f.rows[0].n, 1);
        await P.CE.rooms.refresh();
        await P.CE.rooms.refresh();
        await P.settle();
        assert.equal(button(dewiLine(), 'Following').getAttribute('aria-pressed'), 'true');
        P = await reload(backend, P);
        P.$('arrivals-open').click();
        P.$('pl-who').click();
        await P.settle();
        assert.equal(button(dewiLine(), 'Following').getAttribute('aria-pressed'), 'true', 'a reload reads it back');
        assert.doesNotMatch(CORRIDOR_SRC, /setInterval|setTimeout/, 'no timer of its own');
        P.$('sheet-close').click();
      });

      await bt.test('the notice bell: count, highlight, its name, and the list it opens', async () => {
        const B = await open(backend, device(bayu));
        assert.equal(B.$('notices-count').hidden, true);
        assert.equal(B.$('notices-open').dataset.new, 'false');
        assert.equal(B.$('notices-open').getAttribute('aria-label'), 'Notices, nothing new');
        assert.match(CSS, /\.sign__you \.bell\[data-new="true"\] \{ background: var\(--periwinkle\); \}/, 'a new notice changes the bell');
        assert.match(CSS, /\.sign__you \.bell \{[^}]*background: var\(--indigo\)/);

        const start = new Date(Date.parse(next + 'T14:00:00+07:00')).toISOString();
        const end = new Date(Date.parse(next + 'T15:00:00+07:00')).toISOString();
        await call('book_black_box', { me: rina, booking_id: crypto.randomUUID(), title: 'Sync', start_at: start, end_at: end, invite: [bayu] });
        await call('follow', { me: bayu, person_id: dewi, follow: true });
        await call('mark_arrival', { me: dewi, coming: true, note: 'from 10' });
        await B.CE.rooms.refresh();
        await until(() => B.$('notices-count').textContent === '2', 'two notices');
        assert.equal(B.$('notices-count').hidden, false);
        assert.equal(B.$('notices-open').dataset.new, 'true');
        assert.equal(B.$('notices-open').getAttribute('aria-label'), 'Notices, 2 new');
        B.$('notices-open').click();
        const items = B.$('notices-list').children.map((li) => li.children[1].textContent);
        assert.equal(items.length, 2);
        assert.match(items[0], /^Rina Wati invited you to “Sync” · Black Box · /);
        assert.equal(items[1], 'Dewi is coming in today · from 10');
        button(B.$('notices-list').children[0], 'Accept').click();
        await until(() => B.$('notices-count').textContent === '1', 'answered: one left');
        assert.equal(B.$('notices-open').getAttribute('aria-label'), 'Notices, 1 new');
        B.close();
      });

      await bt.test('booking controls dispatch to the CE.rooms writes the routes cover, and the rows follow', async () => {
        const laterDay = days.find((d) => d !== P.CE.rooms.today());
        await P.CE.rooms.refresh();
        P.$('pill-black-box').click();
        await P.settle();
        await P.book({ title: 'Pitch review', date: laterDay, from: '14:00', to: '15:30', invite: ['Bayu'] });
        await until(() => /^Booked: Pitch review/.test(P.$('book-msg').textContent), 'booked');
        const book = lastWrite(P);
        assert.equal(book.what, backend.route.book());
        assert.deepEqual([book.args.me, book.args.invite, book.args.seats], [rina, [bayu], [2]]);
        const id = book.args.id || book.args.booking_id;
        const seat = async (pid) => (await pool.query('SELECT seat, status FROM meeting_invites WHERE booking_id = $1 AND person_id = $2', [id, pid])).rows[0];
        assert.deepEqual(await seat(bayu), { seat: 2, status: 'invited' });

        P.seat('detail', 3, 'Dewi');
        await until(() => /Invited Dewi to chair 3/.test(P.$('detail-msg').textContent), 'Dewi invited');
        assert.equal(lastWrite(P).what, backend.route.invite(id));
        assert.deepEqual([lastWrite(P).args.people, lastWrite(P).args.seats], [[dewi], [3]]);
        assert.deepEqual(await seat(dewi), { seat: 3, status: 'invited' });

        const B = await open(backend, device(bayu));
        B.$('notices-open').click();
        const item = B.$('notices-list').children.find((li) => li.textContent.includes('Pitch review'));
        button(item, 'Accept').click();
        await until(async () => (await seat(bayu)).status === 'accepted', 'Bayu accepted');
        assert.equal(lastWrite(B).what, backend.route.respond(id));
        assert.deepEqual([lastWrite(B).args.me, lastWrite(B).args.response], [bayu, 'accepted']);
        B.close();

        await P.CE.rooms.refresh();
        await P.settle();
        button(P.$('detail-acts'), 'Cancel meeting').click();
        const status = async (bid) => (await pool.query('SELECT status FROM bookings WHERE id = $1', [bid])).rows[0].status;
        await until(async () => (await status(id)) === 'cancelled', 'cancelled');
        assert.equal(lastWrite(P).what, backend.route.cancel(id));

        await P.book({ room: 'ck_hall', title: 'Launch', date: laterDay, from: '16:00', to: '17:00' });
        await until(() => /^Requested: Launch/.test(P.$('book-msg').textContent), 'hall requested');
        const hall = lastWrite(P);
        assert.equal(hall.what, backend.route.hall());
        const hallId = hall.args.id || hall.args.booking_id;
        assert.equal(await status(hallId), 'requested');

        const O = await open(backend, device(pak));
        O.$('pill-ck-hall').click();
        O.$('days').children.map((li) => li.firstChild).find((b) => b.dataset.day === laterDay).click();
        let block;
        await until(() => (block = O.$('tt-col-ck_hall').children.find((n) => n.dataset.id === hallId)), 'the request on the timetable');
        block.click();
        button(O.$('detail-acts'), 'Confirm').click();
        await until(async () => (await status(hallId)) === 'confirmed', 'confirmed');
        assert.equal(lastWrite(O).what, backend.route.confirm(hallId));
        if (backend.route.confirm(hallId) === 'decide_ck_hall') assert.equal(lastWrite(O).args.decision, 'confirm');
        assert.equal(lastWrite(O).args.me, pak);
        O.close();
      });

      P.close();
    });
  }
});
