import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

// Sign in with Google is OpenID Connect on top of OAuth 2 (RULE-030). Identity comes from the
// signed ID token only. The access token is never read, stored, or used as the session (TRAP-007).

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

// Register <site origin> + this path as the authorized redirect URI in the Google client.
export const GOOGLE_CALLBACK_PATH = "/login/google/callback";

export type GoogleConfig = { clientId: string; clientSecret: string };

// The claims SessionService needs from a verified ID token.
export type GoogleIdentity = { sub: string; email: string; emailVerified: boolean };

export interface GoogleOidc {
  authorizationUrl(input: { redirectUri: string; state: string; nonce: string }): string;
  // Swaps the authorization code for tokens and verifies the ID token. Null on any failure.
  exchangeCode(input: { code: string; redirectUri: string; nonce: string }): Promise<GoogleIdentity | null>;
}

// Both values or nothing. An empty string counts as unset, so a blank line in .env never turns
// into a request to Google with a placeholder client.
export function googleConfig(source: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }): GoogleConfig | null {
  const clientId = source.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = source.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

type JwtHeader = { alg?: string; kid?: string };
type JwtClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nonce?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
};

function decodeSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

export function createGoogleOidc(
  config: GoogleConfig,
  deps: { fetch?: typeof fetch; now?: () => number } = {},
): GoogleOidc {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;

  // Fetched per sign-in rather than cached: staff sign-ins are rare and Google rotates keys.
  async function signingKey(kid: string): Promise<JsonWebKey | null> {
    const res = await doFetch(GOOGLE_JWKS_URL);
    if (!res.ok) return null;
    const { keys } = (await res.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
    return keys?.find((k) => k.kid === kid) ?? null;
  }

  async function verifyIdToken(idToken: string, nonce: string): Promise<GoogleIdentity | null> {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const header = decodeSegment<JwtHeader>(h);
    if (header.alg !== "RS256" || !header.kid) return null;

    const jwk = await signingKey(header.kid);
    if (!jwk) return null;
    const signed = verify(
      "RSA-SHA256",
      Buffer.from(`${h}.${p}`),
      createPublicKey({ key: jwk, format: "jwk" }),
      Buffer.from(s, "base64url"),
    );
    if (!signed) return null;

    const claims = decodeSegment<JwtClaims>(p);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!claims.iss || !GOOGLE_ISSUERS.includes(claims.iss)) return null;
    if (!audience.includes(config.clientId)) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= now()) return null;
    if (claims.nonce !== nonce) return null;
    if (!claims.sub || !claims.email) return null;

    return {
      sub: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true || claims.email_verified === "true",
    };
  }

  return {
    authorizationUrl({ redirectUri, state, nonce }) {
      const url = new URL(GOOGLE_AUTH_URL);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email",
        state,
        nonce,
        prompt: "select_account",
      }).toString();
      return url.toString();
    },

    async exchangeCode({ code, redirectUri, nonce }) {
      try {
        const res = await doFetch(GOOGLE_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });
        if (!res.ok) return null;
        const { id_token } = (await res.json()) as { id_token?: string };
        return id_token ? await verifyIdToken(id_token, nonce) : null;
      } catch {
        // Malformed token JSON, a bad key, or a network error: all read as a failed sign-in.
        return null;
      }
    },
  };
}
