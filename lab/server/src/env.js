'use strict';

const path = require('node:path');

// LAB_ASSERTION_SECRET: the lab is staff only (012) and the CCG hand-off is the only way in. No secret, no lab.
const REQUIRED = ['DATABASE_URL', 'HUB_COMPANY_SLUG', 'LAB_ASSERTION_SECRET'];

/* Load server/.env if present. Real environment variables win. */
function loadDotEnv() {
  try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function siteUrl(value) {
  if (value === undefined || !String(value).trim()) return null;
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('scheme');
    return url.origin;
  } catch (e) {
    throw new Error(`CCG_SITE_URL must be an absolute http(s) URL (got "${value}").`);
  }
}

/* Validate config at boot so a misconfigured server fails fast instead of on first request. */
function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((k) => !env[k] || !String(env[k]).trim());
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
      'Copy server/.env.example to server/.env and fill them in.'
    );
  }
  const port = env.PORT === undefined || env.PORT === '' ? 3000 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535 (got "${env.PORT}").`);
  }
  const hops = env.TRUST_PROXY === undefined || env.TRUST_PROXY === '' ? 0 : Number(env.TRUST_PROXY);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error(`TRUST_PROXY must be the number of proxy hops in front of the server, e.g. 1 (got "${env.TRUST_PROXY}").`);
  }
  const ccgSecret = String(env.LAB_ASSERTION_SECRET).trim();
  if (ccgSecret.length < 32) {
    throw new Error('LAB_ASSERTION_SECRET must be at least 32 characters (the same value as on the CCG site).');
  }
  return {
    databaseUrl: env.DATABASE_URL,
    ccgSecret,
    // Optional: the CCG site's origin, linked from the lab's sign-in page.
    ccgSiteUrl: siteUrl(env.CCG_SITE_URL),
    companySlug: env.HUB_COMPANY_SLUG.trim(),
    host: env.HOST && env.HOST.trim() ? env.HOST.trim() : '127.0.0.1',
    port,
    trustProxy: hops,
  };
}

module.exports = { loadDotEnv, loadConfig, REQUIRED };
