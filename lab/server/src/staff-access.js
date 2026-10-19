'use strict';

const { sendError } = require('./errors');

/* CCG staff roles. MEMBER is a public visitor and is not a role here.
 * The header is honored only from a loopback peer. The Next app is that peer,
 * after it has checked the staff session. A browser cannot grant itself a role. */
const STAFF_HEADER = 'x-ccg-staff-role';

function permissions(role) {
  if (role !== 'ADMIN' && role !== 'EDITOR') return null;
  return {
    role,
    notes: true,
    draw: true,
    canClear: role === 'ADMIN',
  };
}

function isLoopback(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function staffRoleFrom(req) {
  const addr = req.socket && req.socket.remoteAddress;
  if (!isLoopback(addr)) return null;
  const role = typeof req.get === 'function' ? req.get(STAFF_HEADER) : '';
  return role === 'ADMIN' || role === 'EDITOR' ? role : null;
}

function requireStaff(req, res, next) {
  if (!req.app.locals.staffGate) return next();
  const role = staffRoleFrom(req);
  if (!role) return sendError(res, 401, 'staff_required', 'A staff account is required');
  req.staffRole = role;
  next();
}

function requireClear(req, res, next) {
  if (!req.app.locals.staffGate) return next();
  if (req.staffRole !== 'ADMIN') {
    return sendError(res, 403, 'forbidden', 'Only an admin can clear the board');
  }
  next();
}

module.exports = {
  STAFF_HEADER,
  permissions,
  isLoopback,
  staffRoleFrom,
  requireStaff,
  requireClear,
};
