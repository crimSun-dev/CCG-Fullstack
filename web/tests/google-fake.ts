import { generateKeyPairSync, sign } from "node:crypto";
import { GOOGLE_JWKS_URL, GOOGLE_TOKEN_URL } from "@/lib/google-oidc";

// A stand-in for Google's token and key endpoints. Tests sign real RS256 ID tokens with a local
// key and hand them out through a mocked fetch, so no request ever reaches Google.

export const CLIENT = { clientId: "test-client.apps.googleusercontent.com", clientSecret: "test-only-secret" };
export const REDIRECT_URI = "http://localhost:3200/login/google/callback";
export const NONCE = "test-nonce";

const KID = "test-key-1";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwks = { keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" }] };

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

export function idToken(claims: Record<string, unknown>, opts: { kid?: string; key?: typeof privateKey } = {}): string {
  const body = {
    iss: "https://accounts.google.com",
    aud: CLIENT.clientId,
    exp: Math.floor(Date.now() / 1000) + 600,
    nonce: NONCE,
    ...claims,
  };
  const signingInput = `${b64({ alg: "RS256", typ: "JWT", kid: opts.kid ?? KID })}.${b64(body)}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), opts.key ?? privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

// Answers the token exchange with `token` (or a status) and the JWKS with the test key.
export function fakeGoogleFetch(token: string | { status: number }) {
  const calls: { url: string; body?: URLSearchParams }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    calls.push({ url, body: init?.body instanceof URLSearchParams ? init.body : undefined });
    if (url === GOOGLE_JWKS_URL) return Response.json(jwks);
    if (url === GOOGLE_TOKEN_URL) {
      return typeof token === "string"
        ? Response.json({ id_token: token, access_token: "ignored-access-token", token_type: "Bearer" })
        : new Response("error", { status: token.status });
    }
    throw new Error(`Unexpected fetch to ${url}`);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}
