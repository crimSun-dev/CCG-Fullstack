'use strict';

/* The corridor script in index.html, run on ce-store.js with just enough DOM to paint, on any of the
 * three backends; and the Neon Data API reduced to what ce-store.js asks of it. Shared by the corridor
 * tests (local backend) and the office player proofs (office server and GitHub Pages backends). */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SITE_DIR } = require('../src/app');
const { asApi } = require('./helpers');

const HTML = fs.readFileSync(path.join(SITE_DIR, 'index.html'), 'utf8');
const STORE_SRC = fs.readFileSync(path.join(SITE_DIR, 'ce-store.js'), 'utf8');
const CORRIDOR_SRC = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  .find((s) => s.includes("The corridor's rooms"));
const CSS = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
const HOUR = 3600_000;

/* ------------------------------------------------------------ a small DOM -- */
class Node {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.min = '';
    this.type = '';
    this.className = '';
    this.open = false;
    this.listeners = {};
    this._text = '';
    const styles = {};
    this.style = new Proxy(styles, { get: (o, k) => (k === 'setProperty' ? (n, v) => { o[n] = v; } : o[k]), set: (o, k, v) => { o[k] = v; return true; } });
    const self = this;
    this.classList = {
      add: (c) => { if (!self.classList.contains(c)) self.className = (self.className + ' ' + c).trim(); },
      remove: (c) => { self.className = self.className.split(' ').filter((x) => x !== c).join(' '); },
      contains: (c) => self.className.split(' ').includes(c),
    };
  }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  fire(type, extra = {}) {
    const ev = Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, extra);
    (this.listeners[type] || []).forEach((fn) => fn.call(this, ev));
  }
  click() { if (!this.disabled) this.fire('click'); }
  showModal() { this.open = true; }
  /* Like a browser, a dialog's close event is queued, not fired inside close(). */
  close() { this.open = false; setImmediate(() => this.fire('close')); }
  focus() {}
  setAttribute(k, v) { this['@' + k] = String(v); }
  getAttribute(k) { return this['@' + k] === undefined ? null : this['@' + k]; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
}

/* One device's localStorage. Pass the same one to a second page to reload the page on that device. */
function deviceStorage(items = new Map()) {
  return {
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => { items.set(k, String(v)); },
    removeItem: (k) => { items.delete(k); },
  };
}

/* One page: ce-store.js, then the corridor script. extra is merged into its window (CE_STORE, fetch, ...). */
function corridorPage(extra = {}) {
  const ids = new Set([...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const byId = new Map();
  const get = (id) => {
    assert.ok(ids.has(id), 'index.html has no #' + id);
    if (!byId.has(id)) { const n = new Node('div'); n.id = id; byId.set(id, n); }
    return byId.get(id);
  };
  const radios = ['black_box', 'ck_hall'].map((v, i) => {
    const r = new Node('input'); r.type = 'radio'; r.value = v; r.checked = i === 0; return r;
  });
  const docListeners = {};
  const document = {
    getElementById: get,
    createElement: (tag) => new Node(tag),
    querySelector: (sel) => {
      assert.equal(sel, 'input[name="book-room"]:checked');
      return radios.find((r) => r.checked) || null;
    },
    querySelectorAll: (sel) => { assert.equal(sel, 'input[name="book-room"]'); return radios; },
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
    dispatchEvent: (ev) => { (docListeners[ev.type] || []).forEach((fn) => fn(ev)); return true; },
    hidden: false,
  };
  const ctx = Object.assign({
    console, crypto: globalThis.crypto, document,
    localStorage: deviceStorage(),
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return t; },
    clearTimeout,
  }, extra);
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(STORE_SRC, ctx);
  vm.runInContext(CORRIDOR_SRC, ctx);
  const page = {
    CE: ctx.CE, $: get, radios, document, localStorage: ctx.localStorage,
    async settle() { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); },
    /* A tab in the background: the Pages poller rests (it reads document.hidden). */
    close() { document.hidden = true; },
    /* Jakarta wall clock, h hours from now: { date, time }. */
    jakarta(h = 0) {
      const t = new Date(Date.now() + h * HOUR + 7 * HOUR).toISOString();
      return { date: t.slice(0, 10), time: t.slice(11, 16) };
    },
    /* Fill the booking form and submit it. */
    async book({ room = 'black_box', title, date, from, to, invite = [] }) {
      radios.forEach((r) => { r.checked = r.value === room; });
      radios.find((r) => r.checked).fire('change');
      get('book-title').value = title;
      get('book-date').value = date;
      get('book-start').value = from;
      get('book-end').value = to;
      if (room === 'black_box') {
        /* Black Box invites by seating: chair 2 onward, one name each, through the chair's name picker. */
        invite.forEach((name, k) => page.seat('book', 2 + k, name));
      } else {
        get('book-invite').children.forEach((label) => { label.firstChild.checked = invite.includes(label.textContent); });
      }
      get('book-form').fire('submit');
      await page.settle();
      return get('book-msg').textContent;
    },
    /* The chair node n of a table (book | detail). */
    chair(where, n) { return get(where + '-table').children.find((c) => c.dataset.seat === String(n)); },
    /* Tap chair n, then the name in its picker. */
    seat(where, n, name) {
      const c = page.chair(where, n);
      assert.equal(c.tagName, 'BUTTON', 'chair ' + n + ' can be tapped');
      c.click();
      assert.equal(get(where + '-pick').hidden, false, 'the picker opens');
      const pickBtn = get(where + '-pick-list').all().find((x) => x.tagName === 'BUTTON' && x.textContent.startsWith(name));
      assert.ok(pickBtn, name + ' is in the picker');
      pickBtn.click();
    },
  };
  return page;
}
const buttons = (n) => n.all().filter((x) => x.tagName === 'BUTTON');
const button = (n, label) => buttons(n).find((b) => b.textContent === label);

async function until(pred, what, ms = 4000) {
  const end = Date.now() + ms;
  while (!(await pred())) {
    if (Date.now() > end) throw new Error('timed out waiting for ' + what);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/* The Neon Data API, reduced to what ce-store.js asks of it: an anonymous token, and POST /rpc/fn
 * with named arguments, run as the API role. A PTnnn error answers with HTTP nnn like PostgREST.
 * onCall(fn, args), if given, hears each RPC. */
const NEON = { api: 'https://neon.test/rest/v1', auth: 'https://neon.test/auth' };
function neonStandIn(pool, onCall) {
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  return async function dataApi(url, opts = {}) {
    url = String(url);
    if (url === NEON.auth + '/token/anonymous') return json(200, { token: 'h.' + Buffer.from('{"exp":9999999999}').toString('base64') + '.s' });
    const fn = url.slice((NEON.api + '/rpc/').length);
    if (!/^[a-z_]+$/.test(fn)) return json(404, {});
    const args = JSON.parse(opts.body || '{}');
    if (onCall) onCall(fn, args);
    const names = Object.keys(args);
    try {
      const out = await asApi(pool, null,
        'SELECT wall.' + fn + '(' + names.map((n, i) => n + ' => $' + (i + 1)).join(', ') + ')',
        names.map((n) => (args[n] !== null && typeof args[n] === 'object' && !Array.isArray(args[n]) ? JSON.stringify(args[n]) : args[n])));
      return json(200, out === undefined ? null : out);
    } catch (err) {
      const status = /^PT\d{3}$/.test(err.code) ? Number(err.code.slice(2)) : 400;
      return json(status, { code: err.code, message: err.message, details: err.detail || null });
    }
  };
}

module.exports = { HTML, STORE_SRC, CORRIDOR_SRC, CSS, Node, deviceStorage, corridorPage, buttons, button, until, NEON, neonStandIn };
