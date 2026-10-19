import { z } from "zod";

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
