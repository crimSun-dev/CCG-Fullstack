'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/env');

const SECRET = 'test-lab-secret-of-at-least-32-characters';

test('fails fast naming every missing required variable', () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL, HUB_COMPANY_SLUG, LAB_ASSERTION_SECRET/);
  assert.throws(() => loadConfig({ DATABASE_URL: 'x', HUB_COMPANY_SLUG: '  ', LAB_ASSERTION_SECRET: SECRET }), /HUB_COMPANY_SLUG/);
});

test('defaults to a private listen address and port 3000', () => {
  const c = loadConfig({ DATABASE_URL: 'postgres://x', HUB_COMPANY_SLUG: 'kmk', LAB_ASSERTION_SECRET: SECRET });
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.port, 3000);
  assert.equal(c.companySlug, 'kmk');
});

test('proxy trust is off unless set', () => {
  const c = loadConfig({ DATABASE_URL: 'postgres://x', HUB_COMPANY_SLUG: 'kmk', LAB_ASSERTION_SECRET: SECRET });
  assert.equal(c.trustProxy, 0);
  const r = loadConfig({ DATABASE_URL: 'postgres://x', HUB_COMPANY_SLUG: 'kmk', LAB_ASSERTION_SECRET: SECRET, TRUST_PROXY: '1' });
  assert.equal(r.trustProxy, 1);
});

test('rejects a TRUST_PROXY that is not a hop count', () => {
  assert.throws(() => loadConfig({ DATABASE_URL: 'x', HUB_COMPANY_SLUG: 'kmk', LAB_ASSERTION_SECRET: SECRET, TRUST_PROXY: 'true' }), /TRUST_PROXY/);
});

test('rejects a non-numeric PORT', () => {
  assert.throws(() => loadConfig({ DATABASE_URL: 'x', HUB_COMPANY_SLUG: 'kmk', LAB_ASSERTION_SECRET: SECRET, PORT: 'abc' }), /PORT/);
});

test('the lab will not start without the CCG secret, or with a short one (staff only, 012)', () => {
  assert.throws(() => loadConfig({ DATABASE_URL: 'x', HUB_COMPANY_SLUG: 'kmk' }), /LAB_ASSERTION_SECRET/);
  assert.throws(() => loadConfig({ DATABASE_URL: 'x', HUB_COMPANY_SLUG: 'kmk', LAB_ASSERTION_SECRET: 'short' }), /LAB_ASSERTION_SECRET/);
  const c = loadConfig({ DATABASE_URL: 'x', HUB_COMPANY_SLUG: 'kmk', LAB_ASSERTION_SECRET: SECRET, CCG_SITE_URL: 'https://ajarin.org/x' });
  assert.equal(c.ccgSecret, SECRET);
  assert.equal(c.ccgSiteUrl, 'https://ajarin.org');
  assert.throws(() => loadConfig({ DATABASE_URL: 'x', HUB_COMPANY_SLUG: 'kmk', LAB_ASSERTION_SECRET: SECRET, CCG_SITE_URL: 'ajarin' }), /CCG_SITE_URL/);
});
