'use strict';

/* The lab session: what makes someone signed in here. Born only in POST /v1/ccg/enter, from the CCG
 * site's signed hand-off. The cookie holds a random token; lab_sessions (012) holds its SHA-256, the
 * person it acts as, and the CCG role. Nothing else in the lab grants access. */

const crypto = require('node:crypto');
const { sendError } = require('./errors');

const COOKIE = 'lab_session';
// A working day. After it the person comes back through the CCG site, which re-checks the role.
const SESSION_HOURS = 10;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function readCookie(header, name) {
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      const value = part.slice(i + 1).trim();
      return /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : null;
    }
  }
  return null;
}

/* HttpOnly: page script never sees it. SameSite=Lax: not sent on cross-site posts. Secure on https. */
function cookieHeader(token, maxAgeSeconds, secure) {
  const parts = [COOKIE + '=' + token, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + maxAgeSeconds];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function createSessions({ pool, companyId }) {
  return {
    /* Inside the caller's transaction. Returns the raw token, which leaves the server once. */
    async start(client, { personId, role }) {
      const token = crypto.randomBytes(32).toString('base64url');
      await client.query(
        "INSERT INTO lab_sessions (token_hash, company_id, person_id, role, expires_at) VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))",
        [hashToken(token), companyId, personId, role, SESSION_HOURS]);
      return token;
    },

    /* The live session behind a Cookie header, or null. Expired, revoked and other-company rows are null. */
    async read(cookie) {
      const token = readCookie(cookie, COOKIE);
      if (!token) return null;
      const { rows } = await pool.query(
        'SELECT person_id, role FROM lab_sessions WHERE token_hash = $1 AND company_id = $2 AND revoked_at IS NULL AND expires_at > now()',
        [hashToken(token), companyId]);
      return rows.length ? { personId: rows[0].person_id, role: rows[0].role, tokenHash: hashToken(token) } : null;
    },

    async revoke(tokenHash) {
      await pool.query('UPDATE lab_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash]);
    },
  };
}

/* For /v1: no session, 401. The session rides on req.labSession for the routers. */
function requireSession(sessions) {
  return async (req, res, next) => {
    const session = await sessions.read(req.headers.cookie);
    if (!session) return sendError(res, 401, 'sign_in_required', 'Sign in through the CCG site to use CK Virtual Lab');
    req.labSession = session;
    next();
  };
}

module.exports = { COOKIE, SESSION_HOURS, hashToken, readCookie, cookieHeader, createSessions, requireSession };
