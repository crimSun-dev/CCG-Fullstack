import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGoogleOidc, GOOGLE_TOKEN_URL, googleConfig } from "@/lib/google-oidc";
import { loginPage } from "@/lib/login-page";
import { CLIENT, fakeGoogleFetch, idToken, NONCE, REDIRECT_URI } from "../google-fake";

const CLAIMS = { sub: "google-sub-1", email: "editor@test.ccg", email_verified: true };

async function exchange(token: string | { status: number }, nonce = NONCE) {
  const google = fakeGoogleFetch(token);
  const oidc = createGoogleOidc(CLIENT, { fetch: google.fetch });
  return { identity: await oidc.exchangeCode({ code: "auth-code", redirectUri: REDIRECT_URI, nonce }), calls: google.calls };
}

describe("googleConfig", () => {
  it("is null unless both the client id and secret are set and non-blank", () => {
    expect(googleConfig({})).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: CLIENT.clientId })).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_SECRET: CLIENT.clientSecret })).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: " " })).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: CLIENT.clientId, GOOGLE_CLIENT_SECRET: CLIENT.clientSecret })).toEqual(CLIENT);
  });
});

describe("GoogleOidc", () => {
  it("builds an OpenID Connect authorization request with state and nonce", () => {
    const url = new URL(createGoogleOidc(CLIENT).authorizationUrl({ redirectUri: REDIRECT_URI, state: "s1", nonce: "n1" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT.clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "openid email",
      state: "s1",
      nonce: "n1",
    });
  });

  it("exchanges the code and returns the verified ID token claims", async () => {
    const { identity, calls } = await exchange(idToken(CLAIMS));
    expect(identity).toEqual({ sub: "google-sub-1", email: "editor@test.ccg", emailVerified: true });
    const tokenCall = calls.find((c) => c.url === GOOGLE_TOKEN_URL);
    expect(tokenCall?.body?.get("grant_type")).toBe("authorization_code");
    expect(tokenCall?.body?.get("redirect_uri")).toBe(REDIRECT_URI);
  });

  it("passes email_verified: false through so the link step can refuse it", async () => {
    expect((await exchange(idToken({ ...CLAIMS, email_verified: false }))).identity?.emailVerified).toBe(false);
  });

  it("rejects a token with the wrong audience, issuer, nonce, or an expired token", async () => {
    expect((await exchange(idToken({ ...CLAIMS, aud: "someone-else" }))).identity).toBeNull();
    expect((await exchange(idToken({ ...CLAIMS, iss: "https://evil.example" }))).identity).toBeNull();
    expect((await exchange(idToken(CLAIMS), "other-nonce")).identity).toBeNull();
    expect((await exchange(idToken({ ...CLAIMS, exp: Math.floor(Date.now() / 1000) - 1 }))).identity).toBeNull();
  });

  it("rejects a token signed by a key Google did not publish", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect((await exchange(idToken(CLAIMS, { key: privateKey }))).identity).toBeNull();
    expect((await exchange(idToken(CLAIMS, { kid: "unknown-kid" }))).identity).toBeNull();
  });

  it("treats a failed token exchange or garbage token as a failed sign-in", async () => {
    expect((await exchange({ status: 400 })).identity).toBeNull();
    expect((await exchange("not.a.jwt")).identity).toBeNull();
  });
});

describe("loginPage", () => {
  it("keeps the password form and links to Google when a client is configured", async () => {
    const html = await loginPage(200, { googleAvailable: true }).text();
    expect(html).toContain('<form method="post" action="/login">');
    expect(html).toContain('href="/login/google"');
    expect(html).not.toContain("admin");
    expect(html).not.toContain("unavailable");
  });

  it("keeps the password form and explains Google is unavailable without a client", async () => {
    const html = await loginPage(200, { googleAvailable: false }).text();
    expect(html).toContain('<form method="post" action="/login">');
    expect(html).toContain('name="password"');
    expect(html).toContain("Google sign-in is unavailable");
    expect(html).not.toContain('href="/login/google"');
  });
});
