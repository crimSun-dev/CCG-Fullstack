'use strict';

/* The only thing a visitor without a lab session ever sees. Self-contained: no wall script, style, font
 * or data is served before sign-in. Arriving from the CCG site with #ccg=<hand-off>, it trades the
 * hand-off for a session and reloads into the wall. */

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/* ccgSiteUrl: the CCG site's origin, for the sign-in link. Null shows the instruction without a link. */
function entryPage(ccgSiteUrl) {
  let signIn = 'Sign in on the CCG site with a staff account, then open CK Virtual Lab from your account page.';
  if (ccgSiteUrl) {
    const login = new URL('/login', ccgSiteUrl).toString();
    signIn = 'Sign in on the CCG site with a staff account, then open CK Virtual Lab from your account page.</p>'
      + '<p><a class="go" href="' + esc(login) + '">Sign in to CCG</a>';
  }
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>CK Virtual Lab: staff only</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100svh; display: grid; place-items: center; background: #030507; color: #eef2f6;
    font: 400 1rem/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 30rem; padding: 2rem 1.25rem; }
  h1 { margin: 0 0 1rem; font-size: 1.9rem; line-height: 1.1; letter-spacing: -0.02em; }
  p { margin: 0 0 1rem; color: #c5ccd6; }
  .go { display: inline-block; padding: 0.75rem 1.1rem; background: #1088f8; color: #fff; text-decoration: none; font-weight: 700; border-radius: 2px; }
  .go:hover { background: #3e9ff8; }
  [role="status"]:empty { display: none; }
  [role="status"] { padding: 0.75rem 1rem; border: 1px solid #70b8f8; color: #eef2f6; }
</style></head>
<body><main>
<h1>CK Virtual Lab is for CCG staff</h1>
<p role="status" id="msg"></p>
<p>${signIn}</p>
</main>
<script>
(function () {
  var m = /(?:^#|&)ccg=([A-Za-z0-9_.-]+)/.exec(location.hash || '');
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  var msg = document.getElementById('msg');
  msg.textContent = 'Signing you in…';
  fetch('v1/ccg/enter', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: m[1] }) })
    .then(function (r) {
      if (r.ok) { location.replace(location.pathname); return; }
      msg.textContent = 'That sign-in link has expired or was already used. Open the lab from the CCG site again.';
    }, function () { msg.textContent = 'Could not reach the lab. Try again from the CCG site.'; });
})();
</script>
</body></html>`;
}

module.exports = { entryPage };
