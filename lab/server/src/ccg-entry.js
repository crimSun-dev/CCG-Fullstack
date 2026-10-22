'use strict';

/* POST /v1/ccg/enter: a CCG staff account arrives with the CCG site's signed hand-off and leaves with
 * its hub name, so the page skips the name sheet.
 *
 * The token is base64url(JSON payload) + '.' + base64url(HMAC-SHA256(secret, first part)), issued by
 * web/src/lib/token-assertion.ts on the CCG site. This file mirrors its verifyLabAssertion and adds the
 * one thing only the receiver can do: refuse a jti it has seen. No password ever arrives here, and the
 * CCG database is never contacted. Without a secret configured the route answers 404. */

const crypto = require('node:crypto');
const express = require('express');
const { sendError } = require('./errors');
const { SESSION_HOURS, cookieHeader } = require('./lab-session');

const ISSUER = 'ccg';
const AUDIENCE = 'ck-virtual-lab';
// A removal notice is signed for its own audience, so it can never be replayed as a way in, nor a
// hand-off as a removal.
const REMOVE_AUDIENCE = 'ck-virtual-lab:remove';
const STAFF_ROLES = new Set(['OWNER', 'ADMIN', 'EDITOR', 'STAFF']);
const MAX_LIFE_SECONDS = 300;   // CCG issues 60; anything longer was not minted by it
const LEEWAY_SECONDS = 15;      // clock drift between the two hosts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The profile picture's URL on the CCG site (013). Optional: absent or null means none.
const AVATAR_RE = /^https?:\/\/[^\s"'<>]+$/;
const AVATAR_MAX = 512;

function sign(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

/* The claims, or null. Checks signature (constant time), then iss, aud, v, role, shape, and time. */
function verifyAssertion(token, secret, nowMs = Date.now()) {
  const c = signedClaims(token, secret, nowMs);
  if (!c || c.aud !== AUDIENCE || !STAFF_ROLES.has(c.role)) return null;
  if (typeof c.email !== 'string' || !c.email.includes('@') || typeof c.name !== 'string' || !c.name.trim()) return null;
  if (c.avatar != null && (typeof c.avatar !== 'string' || c.avatar.length > AVATAR_MAX || !AVATAR_RE.test(c.avatar))) return null;
  return c;
}

/* The signature and timing checks a hand-off and a removal notice share. Null when they fail. */
function signedClaims(token, secret, nowMs) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = Buffer.from(sign(secret, parts[0]));
  const given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  let c;
  try {
    c = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!c || c.v !== 1 || c.iss !== ISSUER) return null;
  if (typeof c.sub !== 'string' || !UUID_RE.test(c.sub) || typeof c.jti !== 'string' || !UUID_RE.test(c.jti)) return null;
  if (!Number.isInteger(c.iat) || !Number.isInteger(c.exp) || c.exp <= c.iat || c.exp - c.iat > MAX_LIFE_SECONDS) return null;
  const now = Math.floor(nowMs / 1000);
  if (c.iat > now + LEEWAY_SECONDS || c.exp + LEEWAY_SECONDS <= now) return null;
  return c;
}

/* A CCG removal notice (web/src/lib/token-assertion.ts issueLabRemoval): { v, iss, aud, sub, iat, exp, jti }. */
function verifyRemoval(token, secret, nowMs = Date.now()) {
  const c = signedClaims(token, secret, nowMs);
  return c && c.aud === REMOVE_AUDIENCE ? c : null;
}

/* Records a jti inside the caller's transaction. False when it was already used. */
async function spend(client, jti) {
  await client.query("DELETE FROM ccg_assertions_used WHERE used_at < now() - interval '1 day'");
  const used = await client.query(
    'INSERT INTO ccg_assertions_used (jti) VALUES ($1) ON CONFLICT DO NOTHING RETURNING jti', [jti]);
  return used.rowCount > 0;
}

/* secret: LAB_ASSERTION_SECRET, shared with the CCG site. hub: told when a new name joins.
 * sessions: src/lab-session.js. An accepted hand-off is the only way a lab session starts. */
function ccgRouter({ pool, companyId, hub, secret, sessions }) {
  const router = express.Router();

  router.post('/enter', async (req, res) => {
    if (!secret) return sendError(res, 404, 'not_found', 'Not found');
    const claims = verifyAssertion(req.body && req.body.token, secret);
    if (!claims) return sendError(res, 401, 'invalid_assertion', 'This CCG sign-in link is not valid. Open the lab from the CCG site again.');

    const client = await pool.connect();
    let person;
    let isNew;
    let token;
    try {
      await client.query('BEGIN');
      if (!(await spend(client, claims.jti))) {
        await client.query('ROLLBACK');
        return sendError(res, 409, 'assertion_used', 'This CCG sign-in link was already used. Open the lab from the CCG site again.');
      }
      const before = await client.query('SELECT 1 FROM people WHERE company_id = $1 AND ccg_sub = $2', [companyId, claims.sub]);
      const { rows } = await client.query(
        'SELECT wall_private.hq_claim_ccg($1, $2, $3, $4) AS person', [companyId, claims.sub, claims.email, claims.name]);
      // Every entry brings the current picture, so a changed or removed one follows on the next visit.
      const pic = await client.query(
        'UPDATE people SET avatar_url = $2 WHERE id = $1 RETURNING wall_private.hq_person_json(people) AS person',
        [rows[0].person.id, claims.avatar || null]);
      person = pic.rows[0].person;
      token = await sessions.start(client, { personId: person.id, role: claims.role });
      await client.query('COMMIT');
      isNew = !before.rowCount;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    if (hub) hub.personAdded(person);
    res.set('Cache-Control', 'no-store')
      .append('Set-Cookie', cookieHeader(token, SESSION_HOURS * 3600, req.secure))
      .json({ person, verified: true, created: isNew });
  });

  /* The CCG site cleared this account's staff: the person, their sessions and everything they made go.
   * Answers 200 whether or not the account ever entered, so CCG can send it again safely. */
  router.post('/remove', async (req, res) => {
    if (!secret) return sendError(res, 404, 'not_found', 'Not found');
    const claims = verifyRemoval(req.body && req.body.token, secret);
    if (!claims) return sendError(res, 401, 'invalid_assertion', 'This removal notice is not valid.');

    const client = await pool.connect();
    let removed;
    try {
      await client.query('BEGIN');
      if (!(await spend(client, claims.jti))) {
        await client.query('ROLLBACK');
        return sendError(res, 409, 'assertion_used', 'This removal notice was already used.');
      }
      const { rows } = await client.query('SELECT wall_private.hq_remove_ccg($1, $2) AS removed', [companyId, claims.sub]);
      removed = rows[0].removed;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    if (removed && hub) hub.personRemoved(removed.personId, removed.noteIds);
    res.set('Cache-Control', 'no-store').json({ removed: !!removed });
  });

  /* Who this session is. The page uses it as its name; there is no picker. */
  router.get('/me', async (req, res) => {
    const session = await sessions.read(req.headers.cookie);
    if (!session) return sendError(res, 401, 'sign_in_required', 'Sign in through the CCG site to use CK Virtual Lab');
    const { rows } = await pool.query('SELECT wall_private.hq_person_json(p) AS person FROM people p WHERE p.id = $1', [session.personId]);
    res.set('Cache-Control', 'no-store').json({ person: rows[0].person, role: session.role });
  });

  router.post('/logout', async (req, res) => {
    const session = await sessions.read(req.headers.cookie);
    if (session) await sessions.revoke(session.tokenHash);
    res.set('Cache-Control', 'no-store').append('Set-Cookie', cookieHeader('', 0, req.secure)).status(204).end();
  });

  return router;
}

module.exports = { ccgRouter, verifyAssertion, verifyRemoval, ISSUER, AUDIENCE, REMOVE_AUDIENCE };
