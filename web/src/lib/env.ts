import { z } from "zod";

// A blank line in .env (KEY="") means unset, not an invalid value.
const blankIsUnset = <T extends z.ZodType>(inner: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), inner.optional());

// Validated once, at startup (RULE-034). A missing value stops the process before it listens.
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    LEAD_TO_EMAIL: z.email("LEAD_TO_EMAIL must be an email address"),
    LEAD_IP_SALT: z.string().min(16, "LEAD_IP_SALT must be at least 16 characters"),
    RESEND_API_KEY: z.string().optional(),
    LEAD_FROM_EMAIL: z.string().default("CCG Website <onboarding@resend.dev>"),
    HUB_DATABASE_HOST: z.string().optional(),
    // Canonical origin for links in account email, e.g. https://ajarin.org. Without it the origin
    // comes from the forwarded Host header, which a client can set.
    PUBLIC_SITE_URL: blankIsUnset(z.url("PUBLIC_SITE_URL must be an absolute URL")),
    // Shared with CK Virtual Lab to sign the staff hand-off. Without it the lab button is hidden.
    LAB_ASSERTION_SECRET: blankIsUnset(z.string().min(32, "LAB_ASSERTION_SECRET must be at least 32 characters")),
    LAB_URL: blankIsUnset(z.url("LAB_URL must be an absolute URL")),
    // CK Virtual Lab served by this site at /lab (src/lib/lab-bridge.ts): the lab's own database,
    // never this site's, and its company. LAB_URL, when set, sends the button elsewhere instead.
    LAB_DATABASE_URL: blankIsUnset(z.string()),
    LAB_COMPANY_SLUG: z.string().trim().min(1).default("kmk"),
    // Optional. Without both, /admin/login offers email and password only (see googleConfig).
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  })
  .superRefine((env, ctx) => {
    // The production deployment must send real mail. Local `next start` and previews may log instead.
    if (env.VERCEL_ENV === "production" && !env.RESEND_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "RESEND_API_KEY is required in production" });
    }
    if (env.LAB_DATABASE_URL && env.LAB_DATABASE_URL === env.DATABASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["LAB_DATABASE_URL"],
        message: "LAB_DATABASE_URL is this site's database. The lab keeps its own (separate databases).",
      });
    }
    if (env.HUB_DATABASE_HOST && databaseHost(env.DATABASE_URL) === env.HUB_DATABASE_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL points at the office hub database. This site uses its own Neon project (ccg-public).",
      });
    }
  });

export type Env = z.infer<typeof schema>;

function databaseHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment, refusing to start:\n${lines.join("\n")}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

// Where the lab button goes, if anywhere: LAB_URL when set, else this site's own /lab when the lab
// is served here. Both need the hand-off secret.
export function labTarget(e: Env): "external" | "embedded" | null {
  if (!e.LAB_ASSERTION_SECRET) return null;
  if (e.LAB_URL) return "external";
  return e.LAB_DATABASE_URL ? "embedded" : null;
}
