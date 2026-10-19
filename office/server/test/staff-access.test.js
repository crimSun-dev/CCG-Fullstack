'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { permissions, staffRoleFrom } = require('../src/staff-access');

test('permissions: admin may clear, editor may not, member is not staff', () => {
  assert.equal(permissions('ADMIN').canClear, true);
  assert.equal(permissions('EDITOR').canClear, false);
  assert.equal(permissions('EDITOR').notes, true);
  assert.equal(permissions('MEMBER'), null);
  assert.equal(permissions(''), null);
});

test('a role header from outside loopback is ignored', () => {
  const req = { socket: { remoteAddress: '203.0.113.8' }, get: () => 'ADMIN' };
  assert.equal(staffRoleFrom(req), null);
});

test('staff gate: no staff header is 401, editor clear is 403', async () => {
  const app = createApp({ pool: {}, companyId: '00000000-0000-4000-8000-000000000001', staffGate: true });
  const missing = await request(app).get('/v1/notes');
  assert.equal(missing.status, 401);
  assert.equal(missing.body.error.code, 'staff_required');

  const editor = await request(app)
    .post('/v1/whiteboard/clear')
    .set('x-ccg-staff-role', 'EDITOR')
    .set('Content-Type', 'application/json')
    .send({});
  assert.equal(editor.status, 403);
  assert.equal(editor.body.error.code, 'forbidden');
});
