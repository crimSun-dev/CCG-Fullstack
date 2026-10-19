'use strict';

const path = require('node:path');
const express = require('express');
const { sameOrigin, requireJson, writeLimiter } = require('./guards');
const { requireStaff, requireClear } = require('./staff-access');
const { notesRouter } = require('./notes');
const { whiteboardRouter } = require('./whiteboard');
const { roomsRouter } = require('./rooms');
const { ccgRouter } = require('./ccg-entry');
const { createSessions, requireSession } = require('./lab-session');
const { entryPage } = require('./entry-page');
const { sendError } = require('./errors');
const { createHub } = require('./live');

const SITE_DIR = path.join(__dirname, '..', '..', 'scrollcraft', 'builds', 'creative-episode');
const CE_CONFIG = "window.CE_STORE = 'api';\n";

/* rateLimit: { notes: { limit, windowMs }, whiteboard: { limit, windowMs }, hub: { limit, windowMs } } overrides, mainly for tests.
 * trustProxy: proxy hops in front (Render: 1). Without it, HTTPS behind a proxy looks like http and every write fails the Origin check.
 * hub: the /v1/live room (src/live.js). REST writes are told to it; app.locals.hub hands it to attachLive.
 * ccgSecret: LAB_ASSERTION_SECRET, shared with the CCG site for the staff hand-off (src/ccg-entry.js).
 * ccgSiteUrl: the CCG site's origin, linked from the sign-in page.
 *
 * Staff only (012). Standalone, every page, asset, /v1 call and /v1/live socket needs a lab session, and
 * the only way to get one is the CCG hand-off; so ccgSecret is required and the app refuses to start
 * without it. staffGate: served behind the CCG site's /office proxy, which has already checked the CCG
 * session and asserts the role on loopback (src/staff-access.js); no lab session is used there. */
function createApp({ pool, companyId, rateLimit = {}, siteDir = SITE_DIR, trustProxy = 0, hub = createHub(), staffGate = false,
  ccgSecret = null, ccgSiteUrl = null }) {
  if (!staffGate && !ccgSecret) {
    throw new Error('ccgSecret (LAB_ASSERTION_SECRET) is required: CK Virtual Lab is open only to CCG staff who signed in');
  }
  const app = express();
  const sessions = createSessions({ pool, companyId });
  app.locals.hub = hub;
  app.locals.staffGate = staffGate;
  app.locals.sessions = sessions;
  // attachLive asks this before opening a socket. Behind the CCG proxy the proxy has already asked.
  app.locals.authenticate = staffGate ? async () => ({ staffGate: true }) : (req) => sessions.read(req.headers.cookie);
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', trustProxy);

  /* The page and everything it loads. Without a session: the sign-in page at / and 401 for the rest. */
  const signedIn = staffGate ? (req, res, next) => next() : async (req, res, next) => {
    const session = await sessions.read(req.headers.cookie);
    if (session) { req.labSession = session; return next(); }
    if ((req.method === 'GET' || req.method === 'HEAD') && (req.path === '/' || req.path === '/index.html')) {
      return res.status(200).type('html').set('Cache-Control', 'no-store').send(entryPage(ccgSiteUrl));
    }
    sendError(res, 401, 'sign_in_required', 'Sign in through the CCG site to use CK Virtual Lab');
  };

  // Tells index.html it is being served by this server, so it uses the API store.
  app.get('/ce-config.js', signedIn, (req, res) => {
    res.type('application/javascript').set('Cache-Control', 'no-store').send(CE_CONFIG);
  });

  const v1 = express.Router();
  v1.use(requireStaff, sameOrigin, requireJson);
  // Before the session gate: entering is how a session starts.
  v1.use('/ccg',
    writeLimiter(Object.assign({ limit: 30 }, rateLimit.ccg)),
    express.json({ limit: '8kb' }),
    ccgRouter({ pool, companyId, hub, secret: ccgSecret, sessions }));
  if (!staffGate) v1.use(requireSession(sessions));
  v1.use('/whiteboard/clear', requireClear);
  // Each surface gets its own body cap and its own per-IP write budget: drawing writes far more often than typing.
  v1.use('/notes',
    writeLimiter(Object.assign({ limit: 300 }, rateLimit.notes)),
    express.json({ limit: '16kb' }),
    notesRouter({ pool, companyId, hub }));
  v1.use('/whiteboard',
    writeLimiter(Object.assign({ limit: 1200 }, rateLimit.whiteboard)),
    express.json({ limit: '96kb' }),
    whiteboardRouter({ pool, companyId, hub }));
  v1.use('/hub',
    writeLimiter(Object.assign({ limit: 120 }, rateLimit.hub)),
    express.json({ limit: '8kb' }),
    roomsRouter({ pool, companyId, hub }));
  v1.use((req, res) => sendError(res, 404, 'not_found', 'Not found'));
  app.use('/v1', v1);

  // The wall's files are staff-only too: a stranger gets the sign-in page, not the app.
  app.use(signedIn, express.static(siteDir, { setHeaders: (res) => res.set('Cache-Control', 'private, no-cache') }));

  // Last: never leak SQL, stack traces, or connection details to the client.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.parse.failed') return sendError(res, 400, 'invalid_json', 'Request body is not valid JSON');
    if (err.type === 'entity.too.large') return sendError(res, 413, 'payload_too_large', 'Request body is too large');
    if (err.code === '23514') return sendError(res, 400, 'validation_failed', 'Note failed validation');
    console.error(err.stack || err);
    sendError(res, 500, 'server_error', 'Internal server error');
  });

  return app;
}

module.exports = { createApp, SITE_DIR };
