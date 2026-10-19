'use strict';

/* /v1/hub: the hub's names list, Black Box meetings (with chairs), CK Hall rentals, invitations, follows,
 * today's arrivals, and office-day plans with the trip in.
 *
 * The rules (overlap, no past bookings, who may cancel, approve, invite or answer, the Jakarta day)
 * live in the wall_private.hq_* functions of migrations 007 and 008, the same ones the Neon Data API
 * calls, so the office server and GitHub Pages cannot disagree. This router checks shapes, passes
 * the caller's name along, and tells /v1/live what changed.
 *
 * Standalone the caller is the lab session's person (012): a body may name `me`, but only as itself. Behind
 * the CCG /office proxy (staffGate) there is no lab session and `me` in the body names the caller.
 */

const express = require('express');
const { sendError } = require('./errors');

const DECISIONS = new Set(['confirm', 'decline', 'cancel']);
const RESPONSES = new Set(['accepted', 'declined']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_INVITES = 50;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TRIP_STEPS = new Set(['on_the_way', 'arrived', 'reset']);

function isId(id) { return typeof id === 'string' && UUID_RE.test(id); }

/* One wall_private.hq_* call. Resolves the function's jsonb result. */
async function hq(pool, fn, args) {
  const { rows } = await pool.query(
    'SELECT wall_private.' + fn + '(' + args.map((_, i) => '$' + (i + 1)).join(', ') + ') AS out', args);
  return rows[0].out;
}

/* Everything the corridor shows today. The /v1/live hello carries it. */
function roomsFor(pool, companyId) {
  return hq(pool, 'hq_rooms', [companyId]);
}

/* A PTnnn error from an hq_* function is an answer for the client: status nnn, its code as the message. */
function sendHqError(res, err) {
  if (!err || typeof err.code !== 'string' || !/^PT\d{3}$/.test(err.code)) return false;
  sendError(res, Number(err.code.slice(2)), err.message, err.detail || err.message);
  return true;
}

function invalid(res, message) {
  return sendError(res, 400, 'validation_failed', message);
}

/* Shape checks before the database sees the values. The database repeats the rules that matter. */
function checkSpan(input) {
  for (const key of ['startAt', 'endAt']) {
    if (typeof input[key] !== 'string' || Number.isNaN(Date.parse(input[key]))) return key + ' must be an ISO 8601 time';
  }
  return null;
}
function checkText(input, key) {
  const v = input[key];
  return v === undefined || v === null || typeof v === 'string' ? null : key + ' must be a string';
}
function checkId(input) {
  return input.id === undefined || isId(input.id) ? null : 'id must be a UUID';
}
/* Chairs line up with the invite list: one entry per name, 2 to 8 or null (any free chair). */
function checkSeats(seats, list) {
  if (seats === undefined || seats === null) return null;
  if (!Array.isArray(seats) || !Array.isArray(list) || seats.length !== list.length) return 'seats must line up with the names invited';
  return seats.every((s) => s === null || (Number.isInteger(s) && s >= 2 && s <= 8)) ? null : 'a chair is 2 to 8, or null';
}
function readOfficeDay(value) {
  return typeof value === 'string' && DAY_RE.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) ? value : null;
}
function checkPeople(list, key) {
  if (list === undefined || list === null) return null;
  return Array.isArray(list) && list.length <= MAX_INVITES && list.every(isId) ? null : key + ' must be up to ' + MAX_INVITES + ' name ids';
}
/* me may be missing: the database answers 401 person_required. It may not be malformed. */
function readMe(input) {
  if (input.me === undefined || input.me === null) return { me: null };
  return isId(input.me) ? { me: input.me.toLowerCase() } : { problem: 'me must be a hub name id' };
}
function readDay(req) {
  const day = req.query.day;
  if (day === undefined) return { day: null };
  if (typeof day !== 'string' || !DAY_RE.test(day) || Number.isNaN(Date.parse(day + 'T00:00:00Z'))) {
    return { problem: 'day must be YYYY-MM-DD' };
  }
  return { day };
}

/* hub: the /v1/live fan-out (src/live.js). Every change is told to the open walls. */
function roomsRouter({ pool, companyId, hub }) {
  const router = express.Router();

  /* One hq_* call. Its answer goes to done; an hq refusal (400/401/403/404/409) goes back to the client as is. */
  async function run(res, fn, args, done) {
    let out;
    try {
      out = await hq(pool, fn, args);
    } catch (err) {
      if (sendHqError(res, err)) return;
      throw err;
    }
    done(out);
  }
  function bookingDone(res, status) {
    return (booking) => {
      if (hub) hub.bookingChanged(booking);
      res.status(status).json(booking);
    };
  }
  /* The body of a write, with `me` read. Answers 400 itself and resolves null when it is malformed.
   * Signed in (012): the lab session is the caller. A body naming anyone else is refused, not ignored. */
  function writeInput(req, res) {
    const input = req.body || {};
    const { me, problem } = readMe(input);
    if (problem) { invalid(res, problem); return null; }
    if (req.labSession) {
      const self = req.labSession.personId.toLowerCase();
      if (me && me !== self) { sendError(res, 403, 'not_you', 'You can only act as yourself'); return null; }
      return Object.assign({}, input, { me: self });
    }
    return Object.assign({}, input, { me });
  }

  /* ----- the names list */
  router.get('/people', async (req, res) => {
    res.json({ people: await hq(pool, 'hq_people', [companyId]) });
  });

  /* No guest names (012). A name comes only from a CCG staff account entering (src/ccg-entry.js). */
  router.post('/people', (req, res) => {
    sendError(res, 403, 'names_from_ccg', 'Names come from CCG staff sign-in; they cannot be added here');
  });

  router.put('/follows/:personId', async (req, res) => {
    const input = writeInput(req, res);
    if (!input) return;
    if (!isId(req.params.personId)) return sendError(res, 404, 'not_found', 'No one on the hub has this name');
    if (input.follow !== undefined && typeof input.follow !== 'boolean') return invalid(res, 'follow must be true or false');
    await run(res, 'hq_follow', [companyId, input.me, req.params.personId, input.follow !== false], (out) => {
      if (hub) hub.followsChanged(out);
      res.json(out);
    });
  });

  router.get('/rooms', async (req, res) => {
    res.json(await roomsFor(pool, companyId));
  });

  /* ----- bookings */
  for (const [path, room] of [['/black-box', 'black_box'], ['/ck-hall', 'ck_hall']]) {
    router.get(path, async (req, res) => {
      const { day, problem } = readDay(req);
      if (problem) return invalid(res, problem);
      await run(res, 'hq_list_bookings', [companyId, room, day], (list) => res.json({ bookings: list }));
    });

    router.post(path, async (req, res) => {
      const input = writeInput(req, res);
      if (!input) return;
      const titleKey = room === 'black_box' ? 'title' : 'name';
      const problem = checkId(input) || checkText(input, titleKey) || checkText(input, 'note') ||
        checkSpan(input) || checkPeople(input.invite, 'invite') || checkSeats(input.seats, input.invite);
      if (problem) return invalid(res, problem);
      if (room === 'ck_hall' && Array.isArray(input.seats) && input.seats.some((s) => s !== null)) {
        return invalid(res, 'Only Black Box has chairs');
      }
      await run(res, 'hq_book',
        [companyId, input.me, room, input.id || null, input[titleKey], input.startAt, input.endAt, input.note,
          input.invite || null, input.seats || null],
        bookingDone(res, 201));
    });
  }

  router.post('/black-box/:id/cancel', async (req, res) => {
    const input = writeInput(req, res);
    if (!input) return;
    if (!isId(req.params.id)) return sendError(res, 404, 'not_found', 'Meeting not found');
    await run(res, 'hq_cancel_black_box', [companyId, input.me, req.params.id], bookingDone(res, 200));
  });

  router.post('/ck-hall/:id/:decision', async (req, res) => {
    const input = writeInput(req, res);
    if (!input) return;
    if (!DECISIONS.has(req.params.decision)) return sendError(res, 404, 'not_found', 'Not found');
    if (!isId(req.params.id)) return sendError(res, 404, 'not_found', 'Hall booking not found');
    await run(res, 'hq_decide_ck_hall', [companyId, input.me, req.params.id, req.params.decision], bookingDone(res, 200));
  });

  router.post('/bookings/:id/invite', async (req, res) => {
    const input = writeInput(req, res);
    if (!input) return;
    if (!isId(req.params.id)) return sendError(res, 404, 'not_found', 'Booking not found');
    const problem = checkPeople(input.people, 'people') || checkSeats(input.seats, input.people);
    if (problem || !Array.isArray(input.people)) return invalid(res, problem || 'people must be a list of name ids');
    await run(res, 'hq_invite', [companyId, input.me, req.params.id, input.people, input.seats || null], bookingDone(res, 200));
  });

  router.post('/bookings/:id/respond', async (req, res) => {
    const input = writeInput(req, res);
    if (!input) return;
    if (!isId(req.params.id)) return sendError(res, 404, 'not_found', 'Booking not found');
    if (!RESPONSES.has(input.response)) return invalid(res, 'response must be accepted or declined');
    await run(res, 'hq_respond', [companyId, input.me, req.params.id, input.response], bookingDone(res, 200));
  });

  /* ----- arrivals, today in Asia/Jakarta */
  router.get('/arrivals', async (req, res) => {
    res.json({ arrivals: await hq(pool, 'hq_list_arrivals', [companyId]) });
  });

  router.put('/arrivals/today', async (req, res) => {
    const input = writeInput(req, res);
    if (!input) return;
    if (typeof input.coming !== 'boolean') return invalid(res, 'coming must be true or false');
    const problem = checkText(input, 'note');
    if (problem) return invalid(res, problem);
    await run(res, 'hq_mark_arrival', [companyId, input.me, input.coming, input.note], (arrival) => {
      if (hub) hub.arrivalChanged(arrival);
      res.json(arrival);
    });
  });

  /* ----- office days: a plan for any weekday in the 14-day reach, and today's trip in */
  router.get('/plans', async (req, res) => {
    res.json({ plans: await hq(pool, 'hq_list_plans', [companyId]) });
  });

  function arrivalDone(res) {
    return (arrival) => {
      if (hub) hub.arrivalChanged(arrival);
      res.json(arrival);
    };
  }

  router.post('/arrivals/today/trip', async (req, res) => {
    const input = writeInput(req, res);
    if (!input) return;
    if (!TRIP_STEPS.has(input.step)) return invalid(res, 'step must be on_the_way, arrived or reset');
    await run(res, 'hq_trip', [companyId, input.me, input.step], arrivalDone(res));
  });

  router.put('/arrivals/:day', async (req, res) => {
    const input = writeInput(req, res);
    if (!input) return;
    const day = readOfficeDay(req.params.day);
    if (!day) return invalid(res, 'day must be YYYY-MM-DD');
    if (typeof input.coming !== 'boolean') return invalid(res, 'coming must be true or false');
    const problem = checkText(input, 'note');
    if (problem) return invalid(res, problem);
    if (input.arriveAt !== undefined && input.arriveAt !== null && !(typeof input.arriveAt === 'string' && TIME_RE.test(input.arriveAt))) {
      return invalid(res, 'arriveAt must be HH:MM');
    }
    await run(res, 'hq_plan_day', [companyId, input.me, day, input.coming, input.note, input.arriveAt || null], arrivalDone(res));
  });

  router.post('/arrivals/:day/repeat', async (req, res) => {
    const input = writeInput(req, res);
    if (!input) return;
    const day = readOfficeDay(req.params.day);
    if (!day) return invalid(res, 'day must be YYYY-MM-DD');
    await run(res, 'hq_repeat_day', [companyId, input.me, day], arrivalDone(res));
  });

  router.delete('/arrivals/:day', async (req, res) => {
    const input = writeInput(req, res);
    if (!input) return;
    const day = readOfficeDay(req.params.day);
    if (!day) return invalid(res, 'day must be YYYY-MM-DD');
    await run(res, 'hq_clear_day', [companyId, input.me, day], arrivalDone(res));
  });

  return router;
}

module.exports = { roomsRouter, roomsFor };
