// The /login HTML, shared by the password route and the Google callback so both failures
// render the same screen. Kept out of route.ts, which may export only HTTP handlers.
// This screen is for a general visitor. Admin is a role assigned from the staff command, not a label here.

export const LOGIN_FAILED = "Email or password is incorrect.";

export function loginPage(status: number, opts: { googleAvailable: boolean; error?: string }): Response {
  // No client configured: no link to Google at all, only the explanation.
  const google = opts.googleAvailable
    ? `<p><a class="auth-google" href="/login/google">Continue with Google</a></p>`
    : `<p><button class="auth-google" type="button" disabled aria-describedby="google-unavailable">Continue with Google</button></p>
<p id="google-unavailable">Google sign-in is unavailable: this server has no Google client configured. Use your email and password.</p>`;
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><meta name="theme-color" content="#030507"><title>Sign in | CK Coaching Group</title>
<link rel="icon" href="/brand/ccg-mark.svg"><link rel="preload" href="/fonts/archivo-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/auth.css"></head>
<body>
<header class="auth-head"><a href="/" class="auth-home"><img src="/brand/ccg-mark.svg" alt="CK Coaching Group" width="37" height="43"><span aria-hidden="true"><span>CK</span><span>Coaching</span><span>Group</span></span></a></header>
<main class="auth">
<div class="auth__panel">
<h1>Sign in</h1>
${opts.error ? `<p role="alert">${opts.error}</p>` : ""}
<form method="post" action="/login">
<p><label>Email <input name="email" type="email" required autocomplete="username"></label></p>
<p><label>Password <input name="password" type="password" required autocomplete="current-password"></label></p>
<p><button type="submit"><span>Sign in</span><svg viewBox="0 0 18 12" aria-hidden="true" focusable="false"><path d="M0 6H16.5M11.5 1L16.5 6L11.5 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/></svg></button></p>
</form>
<section aria-label="Google sign-in">
${google}
</section>
</div>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
