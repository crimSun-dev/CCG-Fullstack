// The /login HTML, shared by the password route and the Google callback so both failures
// render the same screen. Kept out of route.ts, which may export only HTTP handlers.
// This screen is for a general visitor. Admin is a role assigned from the staff command, not a label here.

export const LOGIN_FAILED = "Email or password is incorrect.";

// Google's four-colour "G", per its sign-in branding guidelines. Decorative: the label names the action.
const GOOGLE_MARK = `<svg class="auth-google__mark" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
</svg>`;

export function loginPage(status: number, opts: { googleAvailable: boolean; error?: string }): Response {
  // No client configured: no link to Google at all, only the explanation.
  const google = opts.googleAvailable
    ? `<p><a class="auth-google" href="/login/google">${GOOGLE_MARK}<span>Continue with Google</span></a></p>`
    : `<p><button class="auth-google" type="button" disabled aria-describedby="google-unavailable">${GOOGLE_MARK}<span>Continue with Google</span></button></p>
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
