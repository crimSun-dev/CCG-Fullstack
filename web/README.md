# CK Coaching Group: public site

The build contract is `CRIMSUN_POOL/TDD_CCG_WEBSITE.md`. Every route, the data layer, lead capture, and admin, with the visual world from the logo deck. Design system: `DESIGN.md`. Product truth: `PRODUCT.md`. Home scroll brief: `../scrollcraft/builds/ccg-home/BRIEF.md`.

One Next.js 16.4 app, one Postgres database, one deployment. No separate API, queue, Redis, or CMS.

## Pins that matter

- **Prisma 7.10.x** for both `prisma` and `@prisma/client`. The npm `latest` tag is a Prisma 8 RC whose CLI has no `migrate`. Never run `pnpm add prisma` without a version. `pnpm check:prisma-pin` fails if either package drifts.
- Next 16.4.2, React 19.2.x, TypeScript 5.9, Zod 4, Vitest 5, Playwright 1.64. All exact in `package.json`.

## Local setup

The repo has to live on an NTFS drive. Next.js 16 creates junctions in `.next/` and fails on exFAT (`failed to create junction point ... os error 1`). The G: drive this was written on is exFAT, so `next dev` and `next build` fail there. Tests that don't run Next (Vitest) work anywhere.

The runnable copy is `C:\Users\Draven Chen\src\ccg-public-web`. Run install, dev, and build there. The G: tree stays the workspace copy of the source.

```sh
pnpm install                 # .npmrc uses the hoisted linker (also needed on exFAT)
cp .env.example .env         # fill DATABASE_URL, TEST_DATABASE_URL, LEAD_TO_EMAIL, LEAD_IP_SALT
pnpm db:generate
pnpm db:migrate              # prisma migrate deploy
pnpm db:seed
ADMIN_PASSWORD='12+ chars' pnpm admin:create you@example.com "Your Name" ADMIN
pnpm dev
```

`pnpm db:reset` drops and recreates the database, then seeds it. It is for a local database only.

## Staff virtual office

`/office` is the staff wall. ADMIN and EDITOR open it from Admin. A member is sent back to `/account`. Both staff roles can write notes and draw. Only an admin can clear the board.

The page and the wall server live in `../office`. From `office/server`, run `npm ci` once so the wall process can start. In `web/.env`, set `OFFICE_DATABASE_URL` and `HUB_COMPANY_SLUG`. That database is the office hub. It is not `DATABASE_URL`.

## Tests

| Command | What runs | Needs |
|---|---|---|
| `pnpm test:unit` | PublishGate, lead validation, IP hashing, mail timeout, env validation | nothing |
| `pnpm test` | the above plus DB tests: CHECK constraints, seed facts, LeadService, SessionService | `TEST_DATABASE_URL` |
| `pnpm build && pnpm test:e2e` | public HTML, 404s for withheld offers, lead form with and without JS, rate limit, admin sessions, edit + revalidate, boot refusal, 390px width | `TEST_DATABASE_URL`, NTFS |

DB and e2e tests run `prisma migrate deploy` and the seed against `TEST_DATABASE_URL`, then delete lead rows there. They refuse to run if it equals `DATABASE_URL`.

## Where things are

| Concern | File |
|---|---|
| Which offers exist in public | `src/lib/publish-gate.ts` + `program_code_public` CHECK in the migration |
| Page reads + cache tags | `src/lib/content.ts` (cached), `src/lib/content-repository.ts` |
| Lead rules (consent, honeypot, rate limit, mail outcome) | `src/lib/lead-service.ts` |
| Mail (Resend, 2 s budget; logs to console without a key) | `src/lib/mailer.ts` |
| Sessions (bcrypt 12, sha256 token at rest, revocable) | `src/lib/session-service.ts` |
| Env validation, boot refusal | `src/lib/env.ts`, `src/instrumentation-node.ts` |
| Fixed deck copy (vision, mission, why lines) | `src/content/deck-copy.ts` |
| Logo | `src/components/LogoMark.tsx` owns `public/brand/ccg-mark.svg` (flat, header), `ccg-mark-centred.svg` (hero poster), `ccg-emblem.glb` (3D hero) |
| Styles | `src/styles/scrollcraft.css` (vendored engine floor, do not edit) + `src/styles/site.css`; `/login` uses `public/auth.css` |
| Home scroll | `src/components/home/` (AssemblyHero, emblem-film, ScrollStage) + `public/vendor/scrollcraft.js` |

## Behaviour worth knowing

- `POST /api/v1/leads` answers JSON with 202 / 400 / 429. A plain form post (JavaScript off) gets a 303 back to `/contact?lead=…` so the visitor never sees raw JSON.
- Every post from an IP counts toward the limit (5 per 10 minutes), including invalid ones and honeypot hits.
- `RESEND_API_KEY` is required only when `VERCEL_ENV=production`. Without it, notices go to the server log. A lead is saved even when mail fails; the admin list flags `PENDING`/`FAILED` rows.
- Admin saves call `revalidateTag(tag, { expire: 0 })`, so the next public request renders the new row.
- Last write wins on concurrent admin edits. There is no optimistic locking in v1.
- The Neon adapter is used when the database host ends in `.neon.tech`. Any other host uses `pg`.

## Open content decisions

- **Erry Sunarli's title.** Slide 29 says "GM Indonesia". The card mock says "Director | Executive Coach" and shows a phone and a `kmk.co.id` email. The seed leaves `role` null, and phone/email are not columns. Set the role in `/admin` once one is chosen.
- **Program summaries** are short lines written from the deck's facts. The deck has no paragraph copy for the programs. Edit them in `/admin`.
- **Logo.** `ccg-mark.svg` is the slide 2 emblem redrawn from measurements of `image2.png`. The 3D hero uses the Meshy emblem converted to `ccg-emblem.glb`.
