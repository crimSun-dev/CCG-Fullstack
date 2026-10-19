'use strict';

/* Adds a name to the hub's names list. Guests add themselves from the page; hall operators are
 * marked here, because a page must not be able to make itself one.
 * Usage: node scripts/add-person.js "Display Name" guest|hall_operator          (DATABASE_URL)
 *        node scripts/add-person.js "Display Name" hall_operator --test   (TEST_DATABASE_URL) */

const { Client } = require('pg');
const { loadDotEnv } = require('../src/env');

const ROLES = ['guest', 'hall_operator'];

async function addPerson(connectionString, companySlug, displayName, role) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query(
      'INSERT INTO people (company_id, display_name, role)' +
      ' SELECT id, $2, $3 FROM companies WHERE slug = $1 RETURNING id, display_name, role',
      [companySlug, displayName.trim(), role]
    );
    if (!rows.length) throw new Error(`HUB_COMPANY_SLUG "${companySlug}" not found in companies.`);
    return rows[0];
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  loadDotEnv();
  const args = process.argv.slice(2).filter((a) => a !== '--test');
  const name = process.argv.includes('--test') ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
  const [displayName, role] = args;
  if (!displayName || !displayName.trim() || !ROLES.includes(role)) {
    console.error('Usage: node scripts/add-person.js "Display Name" ' + ROLES.join('|') + ' [--test]');
    process.exit(1);
  }
  if (!process.env[name]) {
    console.error(`${name} is not set. Copy server/.env.example to server/.env and fill it in.`);
    process.exit(1);
  }
  addPerson(process.env[name], (process.env.HUB_COMPANY_SLUG || 'kmk').trim(), displayName, role).then((p) => {
    console.log(`${p.display_name} (${p.role}) added: ${p.id}`);
  }, (err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { addPerson, ROLES };
