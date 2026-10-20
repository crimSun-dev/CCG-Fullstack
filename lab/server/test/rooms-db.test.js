'use strict';

/* The base of the HQ rooms test pyramid: the overlap rule, guest names, invitations, activity, no past
 * bookings, and the daily arrival row, against the database itself and the wall.* functions the Neon
 * Data API calls (as role authenticated). PTnnn is the HTTP status the Data API answers with. */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { SKIP_DB, BOOK_T0, setupDb, resetRooms, stubAuth, asApi } = require('./helpers');

const HOUR = 3600_000;
// One base an hour ahead, on the minute, so at(2) is the same instant every time and never in the past.
const T0 = BOOK_T0;   // a weekday morning, never in the past
const at = (hours) => new Date(T0 + hours * HOUR).toISOString();

test('HQ rooms in the database', { skip: SKIP_DB }, async (t) => {
  const { pool, companyId } = await setupDb();
  t.after(() => pool.end());
  await stubAuth(pool);

  /* An anonymous Data API call (the GitHub Pages wall) to wall.fn with named arguments. */
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
  async function person(name, role = 'guest') {
    const { rows } = await pool.query(
      'INSERT INTO people (company_id, display_name, role) VALUES ($1, $2, $3) RETURNING id', [companyId, name, role]);
    return rows[0].id;
  }
  /* A booking that covers now cannot be made through the rules (no past starts), so fixtures insert it. */
  async function covering(room, status, by, title = 'Now') {
    const { rows } = await pool.query(
      "INSERT INTO bookings (company_id, room, title, start_at, end_at, status, created_by)" +
      " VALUES ($1, $2, $3, now() - interval '30 minutes', now() + interval '30 minutes', $4, $5) RETURNING id",
      [companyId, room, title, status, by]);
    return rows[0].id;
  }
  const meeting = (me, start, end, over = {}) => call('book_black_box', Object.assign(
    { me, booking_id: crypto.randomUUID(), title: 'Standup', start_at: start, end_at: end }, over));
  const hallRequest = (me, start, end, over = {}) => call('request_ck_hall', Object.assign(
    { me, booking_id: crypto.randomUUID(), name: 'Rina', start_at: start, end_at: end }, over));
  const decide = (me, id, decision) => call('decide_ck_hall', { me, booking_id: id, decision });
  const count = async (where, params) =>
    (await pool.query('SELECT count(*)::int AS n FROM ' + where, params)).rows[0].n;

  let rina, dewi, sari, operator;
  t.beforeEach(async () => {
    await resetRooms(pool);
    rina = await person('Rina');
    dewi = await person('Dewi');
    sari = await person('Sari');
    operator = await person('Pak Hall', 'hall_operator');
  });

  await t.test('names: adding a guest name needs no code, and adding it again picks the same name', async () => {
    const a = await call('hub_add_person', { display_name: '  Budi  ' });
    assert.deepEqual([a.displayName, a.role], ['Budi', 'guest']);
    const b = await call('hub_add_person', { display_name: 'budi' });
    assert.equal(b.id, a.id);
    const names = await call('hub_people');
    assert.deepEqual(names.map((p) => p.displayName), ['Budi', 'Dewi', 'Pak Hall', 'Rina', 'Sari']);
    await assert.rejects(call('hub_add_person', { display_name: ' ' }), fails(400, 'validation_failed'));
    await assert.rejects(pool.query("INSERT INTO people (company_id, display_name, role) VALUES ($1, 'x', 'staff')", [companyId]),
      (err) => err.code === '23514', 'staff is no longer a role');
  });

  await t.test('any name books Black Box; overlapping meetings: one row stays, the other is 409 booking_conflict', async () => {
    const results = await Promise.allSettled([meeting(rina, at(1), at(2)), meeting(sari, at(1.5), at(3))]);
    assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
    fails(409, 'booking_conflict')(results.find((r) => r.status === 'rejected').reason);
    const kept = results.find((r) => r.status === 'fulfilled').value;
    const { rows } = await pool.query("SELECT id, status FROM bookings WHERE room = 'black_box'");
    assert.deepEqual(rows, [{ id: kept.id, status: 'active' }], 'the stored meeting is unchanged');
    assert.ok([rina, sari].includes(kept.createdBy));
  });

  await t.test('the database refuses the overlap even without the functions (23P01)', async () => {
    const insert = (start, end) => pool.query(
      "INSERT INTO bookings (company_id, room, title, start_at, end_at, status, created_by) VALUES ($1, 'black_box', 'x', $2, $3, 'active', $4)",
      [companyId, start, end, rina]);
    await insert(at(1), at(2));
    await assert.rejects(insert(at(1.5), at(2.5)), (err) => err.code === '23P01');
  });

  await t.test('back-to-back meetings that touch at the boundary both succeed', async () => {
    await meeting(rina, at(1), at(2));
    await meeting(dewi, at(2), at(3));
    assert.equal(await count("bookings WHERE room = 'black_box' AND status = 'active'"), 2);
  });

  await t.test('no past bookings: a start before the current minute and a day before today are refused', async () => {
    const ago = new Date(Date.now() - 10 * 60_000).toISOString();
    await assert.rejects(meeting(rina, ago, at(0)), fails(400, 'validation_failed'));
    await assert.rejects(hallRequest(rina, ago, at(0)), fails(400, 'validation_failed'));
    await assert.rejects(call('list_bookings', { room: 'black_box', day: '2001-01-01' }), fails(400, 'validation_failed'));
    assert.deepEqual(await call('list_bookings', { room: 'black_box', day: '2099-01-01' }), []);
    assert.equal(await count('bookings'), 0);
  });

  await t.test('only the booker cancels; a cancelled meeting frees its span', async () => {
    const first = await meeting(rina, at(1), at(2));
    await assert.rejects(call('cancel_black_box', { me: sari, booking_id: first.id }), fails(403, 'forbidden'));
    await assert.rejects(meeting(sari, at(1), at(2)), fails(409, 'booking_conflict'));
    assert.equal((await call('cancel_black_box', { me: rina, booking_id: first.id })).status, 'cancelled');
    assert.equal((await call('cancel_black_box', { me: rina, booking_id: first.id })).status, 'cancelled', 'cancelling twice is fine');
    const second = await meeting(sari, at(1), at(2));
    const day = await call('list_bookings', { room: 'black_box', day: at(1).slice(0, 10) > at(2).slice(0, 10) ? null : null });
    assert.ok(!day.some((b) => b.id === first.id), 'the cancelled meeting leaves the day list');
    assert.equal(second.status, 'active');
    await assert.rejects(call('cancel_black_box', { me: rina, booking_id: crypto.randomUUID() }), fails(404, 'not_found'));
  });

  await t.test('a retried create with the same id does not book twice', async () => {
    const id = crypto.randomUUID();
    const a = await meeting(rina, at(1), at(2), { booking_id: id });
    const b = await meeting(rina, at(1), at(2), { booking_id: id });
    assert.deepEqual(b, a);
    assert.equal(await count('bookings'), 1);
    await assert.rejects(meeting(dewi, at(4), at(5), { booking_id: id }), fails(409, 'id_conflict'));
  });

  await t.test('meetings need a name, a title, and an end after the start', async () => {
    await assert.rejects(meeting(null, at(1), at(2)), fails(401, 'person_required'));
    await assert.rejects(meeting(crypto.randomUUID(), at(1), at(2)), fails(401, 'person_required'));
    await assert.rejects(meeting(rina, at(1), at(2), { title: '   ' }), fails(400, 'validation_failed'));
    await assert.rejects(meeting(rina, at(2), at(2)), fails(400, 'validation_failed'));
    await assert.rejects(meeting(rina, at(2), at(1)), fails(400, 'validation_failed'));
    assert.equal(await count('bookings'), 0);
    const ok = await meeting(rina, at(1), at(2), { title: '  Pitch review  ', note: '   ' });
    assert.deepEqual([ok.title, ok.note, ok.byName], ['Pitch review', null, 'Rina']);
  });

  await t.test('invitations: invite while booking, an invitee invites more, nobody twice', async () => {
    const m = await meeting(rina, at(1), at(2), { invite: [dewi, sari, rina, dewi] });
    assert.deepEqual(m.invites.map((i) => [i.name, i.status]), [['Dewi', 'invited'], ['Sari', 'invited']],
      'the booker is not invited to their own meeting, and Dewi once');
    const budi = await person('Budi');
    const more = await call('invite', { me: dewi, booking_id: m.id, people: [budi, sari] });
    assert.deepEqual(more.invites.map((i) => i.name), ['Budi', 'Dewi', 'Sari']);
    const outsider = await person('Outsider');
    await assert.rejects(call('invite', { me: outsider, booking_id: m.id, people: [outsider] }), fails(403, 'forbidden'));
    await assert.rejects(call('invite', { me: rina, booking_id: m.id, people: [crypto.randomUUID()] }), fails(400, 'validation_failed'));
    await assert.rejects(call('invite', { me: rina, booking_id: m.id, people: [] }), fails(400, 'validation_failed'));
  });

  await t.test('invitations: accept, decline, change your mind; only invitees answer', async () => {
    const m = await meeting(rina, at(1), at(2), { invite: [dewi, sari] });
    const a = await call('respond', { me: sari, booking_id: m.id, response: 'accepted' });
    assert.equal(a.invites.find((i) => i.personId === sari).status, 'accepted');
    const b = await call('respond', { me: dewi, booking_id: m.id, response: 'declined' });
    assert.equal(b.invites.find((i) => i.personId === dewi).status, 'declined');
    const c = await call('respond', { me: dewi, booking_id: m.id, response: 'accepted' });
    assert.equal(c.invites.find((i) => i.personId === dewi).status, 'accepted');
    await assert.rejects(call('respond', { me: operator, booking_id: m.id, response: 'accepted' }), fails(403, 'forbidden'));
    await assert.rejects(call('respond', { me: sari, booking_id: m.id, response: 'maybe' }), fails(400, 'validation_failed'));
    await call('cancel_black_box', { me: rina, booking_id: m.id });
    await assert.rejects(call('respond', { me: sari, booking_id: m.id, response: 'declined' }), fails(409, 'invalid_state'));
    await assert.rejects(call('invite', { me: rina, booking_id: m.id, people: [operator] }), fails(409, 'invalid_state'));
  });

  await t.test('CK Hall: guests request, overlapping requests are kept, the second overlapping confirm is 409', async () => {
    const a = await hallRequest(sari, at(1), at(3), { invite: [dewi] });
    const b = await hallRequest(dewi, at(2), at(4), { name: 'Budi' });
    assert.deepEqual([a.status, b.status], ['requested', 'requested']);
    assert.equal(a.invites[0].name, 'Dewi');
    await assert.rejects(decide(sari, a.id, 'confirm'), fails(403, 'forbidden'), 'a guest cannot approve');
    await assert.rejects(decide(sari, a.id, 'decline'), fails(403, 'forbidden'));
    assert.equal((await decide(operator, a.id, 'confirm')).status, 'confirmed');
    await assert.rejects(decide(operator, b.id, 'confirm'), fails(409, 'booking_conflict'));
    const { rows } = await pool.query("SELECT id, status FROM bookings WHERE room = 'ck_hall' ORDER BY start_at");
    assert.deepEqual(rows, [{ id: a.id, status: 'confirmed' }, { id: b.id, status: 'requested' }]);
  });

  await t.test('CK Hall: the booker or an operator cancels; decisions follow the request lifecycle', async () => {
    const a = await hallRequest(sari, at(1), at(2));
    await assert.rejects(decide(dewi, a.id, 'cancel'), fails(403, 'forbidden'), 'not your booking');
    assert.equal((await decide(sari, a.id, 'cancel')).status, 'cancelled', 'the booker cancels their own');
    const b = await hallRequest(sari, at(1), at(2));
    await decide(operator, b.id, 'confirm');
    assert.equal((await decide(operator, b.id, 'confirm')).status, 'confirmed', 'confirming twice is fine');
    assert.equal((await decide(operator, b.id, 'decline')).status, 'declined');
    await assert.rejects(decide(operator, b.id, 'confirm'), fails(409, 'invalid_state'));
    await assert.rejects(decide(operator, b.id, 'approve'), fails(400, 'validation_failed'));
    await assert.rejects(decide(operator, crypto.randomUUID(), 'confirm'), fails(404, 'not_found'));
  });

  await t.test('marking coming twice in one Asia/Jakarta day updates the single row; everyone sees the list', async () => {
    const first = await call('mark_arrival', { me: sari, coming: true });
    const jakarta = (await pool.query("SELECT to_char((now() AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS d")).rows[0].d;
    assert.deepEqual([first.day, first.name, first.personId], [jakarta, 'Sari', sari]);
    const second = await call('mark_arrival', { me: sari, coming: true, note: 'after lunch' });
    assert.deepEqual([second.id, second.note], [first.id, 'after lunch']);
    const off = await call('mark_arrival', { me: sari, coming: false });
    assert.deepEqual([off.id, off.coming], [first.id, false]);
    assert.equal(await count('arrivals WHERE person_id = $1', [sari]), 1);
    await call('mark_arrival', { me: dewi, coming: true });
    assert.deepEqual((await call('list_arrivals')).map((a) => [a.name, a.coming]), [['Dewi', true], ['Sari', false]]);
    await assert.rejects(call('mark_arrival', { me: null, coming: true }), fails(401, 'person_required'));
    await assert.rejects(call('mark_arrival', { me: sari, coming: null }), fails(400, 'validation_failed'));
  });

  await t.test('activity (016): every write is one line naming who did it; follows are gone', async () => {
    assert.equal((await pool.query("SELECT to_regclass('follows') AS t")).rows[0].t, null);
    await pool.query('TRUNCATE activity');
    const m = await meeting(rina, at(40), at(41), { title: 'Retro', invite: [sari, dewi] });
    await call('respond', { me: sari, booking_id: m.id, response: 'accepted' });
    await call('respond', { me: dewi, booking_id: m.id, response: 'declined' });
    await call('cancel_black_box', { me: rina, booking_id: m.id });
    const h = await hallRequest(sari, at(42), at(43));
    await decide(operator, h.id, 'confirm');
    await call('mark_arrival', { me: dewi, coming: true, note: 'by 10' });
    await call('mark_arrival', { me: dewi, coming: true, note: 'by 10' });   // said again: no new line
    await call('mark_arrival', { me: dewi, coming: false });
    const lines = (await call('hub_activity')).reverse();
    const opName = (await pool.query('SELECT display_name FROM people WHERE id = $1', [operator])).rows[0].display_name;
    assert.deepEqual(lines.map((l) => [l.kind, l.actorName, l.subjectName]), [
      ['meeting_booked', 'Rina', null], ['invited', 'Rina', 'Sari'], ['invited', 'Rina', 'Dewi'],
      ['accepted', 'Sari', 'Sari'], ['declined', 'Dewi', 'Dewi'], ['booking_cancelled', 'Rina', 'Rina'],
      ['hall_requested', 'Sari', null], ['hall_confirmed', opName, 'Sari'],
      ['coming_in', 'Dewi', null], ['not_coming', 'Dewi', null]]);
    assert.deepEqual([lines[0].detail.title, lines[0].detail.room, lines[8].detail.note], ['Retro', 'black_box', 'by 10']);
    assert.equal(lines[1].at, lines[0].at, 'a booking and the invitations it sends share one moment');
  });

  await t.test('the snapshot carries today: names, both rooms, arrivals, activity, and the database clock', async () => {
    const m = await covering('black_box', 'active', rina, 'Board talk');
    const h = await covering('ck_hall', 'confirmed', sari, 'Podcast');
    await call('mark_arrival', { me: dewi, coming: true });
    const rooms = await call('hub_rooms');
    assert.ok(Date.parse(rooms.now));
    assert.equal(rooms.people.length, 4);
    assert.equal(rooms.follows, undefined);
    assert.deepEqual(rooms.activity.slice(0, 1).map((l) => [l.kind, l.actorName]), [['coming_in', 'Dewi']]);
    const byId = Object.fromEntries(rooms.bookings.map((b) => [b.id, b]));
    assert.deepEqual([byId[m].room, byId[m].title, byId[m].byName], ['black_box', 'Board talk', 'Rina']);
    assert.equal(byId[h].room, 'ck_hall');
    assert.equal(rooms.days, 14);
    assert.equal(rooms.arrivals[0].name, 'Dewi');
  });

  await t.test('notes carry their author\'s name; an unknown author is refused', async () => {
    const n = await call('create_note', { note_id: crypto.randomUUID(), note_body: 'Pojok baca', author_id: sari });
    assert.deepEqual([n.authorId, n.authorName], [sari, 'Sari']);
    const old = await call('create_note', { note_id: crypto.randomUUID(), note_body: 'no name' });
    assert.deepEqual([old.authorId, old.authorName], [null, null]);
    await assert.rejects(call('create_note', { note_id: crypto.randomUUID(), note_body: 'x', author_id: crypto.randomUUID() }),
      fails(400, 'validation_failed'));
    assert.equal((await call('list_notes')).notes.find((x) => x.id === n.id).authorName, 'Sari');
  });

  await t.test('the snapshot reaches 14 days ahead, and further for bookings with invitations', async () => {
    const soon = await meeting(rina, at(24), at(25));
    const far = await meeting(rina, at(24 * 30), at(24 * 30 + 1));
    const farInvited = await meeting(rina, at(24 * 31), at(24 * 31 + 1), { invite: [sari] });
    const ids = (await call('hub_rooms')).bookings.map((b) => b.id);
    assert.ok(ids.includes(soon.id));
    assert.ok(!ids.includes(far.id), 'beyond the timetable and no one invited');
    assert.ok(ids.includes(farInvited.id), 'an invitation reaches its notices however far ahead');
  });

  await t.test('the API role cannot read or write the room tables directly', async () => {
    for (const sql of ['SELECT * FROM people', 'SELECT * FROM bookings', 'SELECT * FROM arrivals',
      'SELECT * FROM meeting_invites', 'SELECT * FROM activity', 'SELECT wall_private.hq_rooms(NULL)']) {
      await assert.rejects(asApi(pool, null, sql, [], 'anonymous'), (err) => err.code === '42501', sql);
    }
  });

  await t.test('012: the Data API is closed: neither API role can call any wall.* function', async () => {
    for (const role of ['anonymous', 'authenticated']) {
      for (const sql of ['SELECT wall.hub_people()', 'SELECT wall.hub_rooms()', "SELECT wall.hub_add_person('Guest')",
        "SELECT wall.list_notes()", "SELECT wall.create_note(NULL, 'x')"]) {
        await assert.rejects(asApi(pool, null, sql, [], role), (err) => err.code === '42501', role + ': ' + sql);
      }
    }
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace " +
      "WHERE n.nspname = 'wall' AND (has_function_privilege('anonymous', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))");
    assert.equal(rows[0].n, 0, 'no wall function is executable by a Data API role');
  });
});
