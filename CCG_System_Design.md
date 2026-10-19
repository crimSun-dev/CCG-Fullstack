# CK Coaching Group — System Design Document v1
*Companion to CCG_Website_Plan.md v2 · Oct 2026*

---

## 1. Overview

Marketing + lead-generation site with an integrated CMS for a boutique executive coaching firm (Jakarta HQ, Seoul branch). Expected load is low (hundreds of visits/day, occasional campaign spikes) but the design must keep content fresh without developer involvement and convert visits into booked discovery calls.

**Design goals:** (1) fast, SEO-first public pages; (2) self-service CMS; (3) reliable lead capture with zero spam leakage to the GM's inbox; (4) low ops overhead for a small team; (5) safe path to v2 (payments, events, client portal, Bahasa Indonesia).

## 2. High-Level Architecture

```
Browser ──► Cloudflare (CDN/WAF) ──► Next.js 15 on Vercel ──► NestJS API on Railway/Fly.io
                                          │  SSR/ISR + /admin            │  REST /api/v1
                                          │                              ├──► PostgreSQL (managed, PITR)
                                          │                              ├──► Redis (rate limit, sessions, cache)
                                          │                              ├──► BullMQ workers ──► Resend · Calendly · WhatsApp
                                          │                              └──► S3/R2 media (presigned uploads)
                                          └──► revalidate webhooks ◄─────┘
GitHub monorepo (Turborepo) ──► GitHub Actions ──► Vercel (web) + Railway (api) + Prisma migrate (db)
Sentry + OTel + uptime monitoring everywhere
```

- **Monorepo** (`apps/web`, `apps/api`, `packages/db` with Prisma schema, `packages/ui`, `packages/config`). Shared types generated from the Prisma schema keep frontend/backend contracts in sync.
- **Two deployables:** static-friendly Next.js (Vercel edge) and stateless NestJS API (2 replicas, Rolling deploys). They scale independently.
- **Content read path never hits the API at runtime:** public pages are SSR/ISR with `revalidate` tags; the API only powers the admin app and mutations.

## 3. Component Design

### 3.1 Frontend (`apps/web`, Next.js 15 App Router)
| Route group | Rendering | Data source |
|---|---|---|
| Public pages (`/`, `/why-ceo-coaching`, `/programs/*`, `/coach`, `/about`, `/methodology`, `/team`, `/locations`, `/insights/*`, `/contact`) | ISR, `revalidate: 3600` + on-demand tags (`programs`, `articles`, `team`, `stats`, `settings`) | API at build/revalidate time |
| `/admin` | Client-rendered SPA shell, JWT-gated | Live API calls |
| `/booking` | Calendly embed + completion webhook page | Calendly |

- `next-intl` middleware for EN first, `/id` phase 2.
- Image pipeline: `next/image` with remote patterns for the R2 CDN domain; brand SVGs inlined.
- SEO: metadata API, JSON-LD (`Organization` with both offices, `Course` for programs, `Person` for CK Song), generated `sitemap.xml`, OG images per page.

### 3.2 API (`apps/api`, NestJS modules)
```
AuthModule        login/refresh/logout, bcrypt hashes, JWT guard factory
ProgramsModule    CRUD + publish/unpublish, slug uniqueness
ArticlesModule    CRUD, markdown body → sanitized HTML at render
LeadsModule       public POST /leads (rate-limited, honeypot, validation)
BookingsModule    Calendly webhook ingestion, status
ContentModule     team_members, locations, stats, pressures, testimonials CRUD
MediaModule       presigned PUT (upload), POST (register), alt-text/usage tracking
SettingsModule    key-value site config (address, phone, socials)
HealthModule      /health, /health/db, /health/redis
```
- Validation: `class-validator` DTOs on every input; Zod schemas shared where the frontend mirrors them.
- Global: Helmet, CORS allowlist, request-id middleware, pino structured logs, global exception filter → Sentry.

### 3.3 Workers (BullMQ on Redis)
| Job | Trigger | Action |
|---|---|---|
| `lead.notify` | lead created | Email GM (Erry) + WhatsApp notify; auto-reply to lead |
| `booking.confirm` | Calendly webhook | Upsert `bookings`, link to `leads`, confirmation email with meet link |
| `media.process` | media registered | Generate WebP/AVIF derivatives + blur placeholder, write `media_assets.variants` |
| `cache.invalidate` | any content write | Call Vercel revalidate API for affected tags |

## 4. Data Model (14 tables, Prisma)

```prisma
model User          { id, name, email @unique, passwordHash, role: ADMIN|EDITOR, createdAt }
model Program       { id, slug @unique, type: ADVISORY|GROUP|PREMIUM, title, tagline, body,
                      durationMonths, sessionsPerYear, sessionLengthDays, capacity,
                      format: ONE_ON_ONE|COHORT, isFlagship, isPublished, sortOrder }
model Article       { id, slug @unique, title, excerpt, bodyMd, coverId?, authorId?, publishedAt?,
                      seoTitle, seoDesc }
model Testimonial   { id, clientName, roleCompany, quote, photoId?, isFeatured, isPublished }
model Lead          { id, name, company?, email, phone?, programId?, message?, source,
                      status: NEW|CONTACTED|WON|LOST, createdAt, indexes(email, status, createdAt) }
model Booking       { id, leadId?, calendlyEventId @unique, scheduledAt, meetUrl?, status }
model TeamMember    { id, name, role, bio, photoId?, location, sortOrder }
model Location      { id, city, address, lat, lng, isHeadOffice }
model Stat          { id, headline, valueText, sourceName, sourceDate, logoId?, isPublished }
model Pressure      { id, title, iconId?, sortOrder }          // 8 CEO pressures
model MediaAsset    { id, key, kind: LOGO|PHOTO|ICON|DOC, alt, w, h, variants Json }
model Setting       { key @id, value Json }                    // address, phone, email, socials
```
Media relations are by `MediaAsset.id`; soft-delete via `isPublished` flags on content tables. Full migration history in `packages/db/migrations`.

## 5. Key Flows

### 5.1 Public page read (hot path, ~0 API load at runtime)
```
Browser → Cloudflare (HIT? serve) → Vercel ISR render → serve + cache
Revalidation: CMS write → API commits → enqueue cache.invalidate → Vercel revalidateTag
```

### 5.2 Lead capture (the money path)
```
Visitor form (honeypot field + client-side token)
  → POST /api/v1/leads  [Redis rate limit: 5/IP/min, 20/day; Turnstile if spam persists]
  → validate DTO → insert Lead(NEW) → enqueue lead.notify
  → 202 Accepted → UI shows "We'll reach out within 1 business day" + Calendly CTA
Worker → email GM + auto-reply → admin sees lead in CMS pipeline
```

### 5.3 Booking
```
Calendly embed (/booking) → visitor picks slot → Calendly fires webhook
→ BookingsController verifies HMAC signature → upsert Booking → match/create Lead by email
→ booking.confirm worker → confirmation email → CMS pipeline updates
```

### 5.4 CMS content write + media upload
```
Admin login → access JWT (15 min) + refresh cookie (httpOnly, 7 d, rotating)
Editor saves program → API validates → DB tx → enqueue cache.invalidate → return updated row
Upload: GET /media/presign?key=... → S3 PUT (direct, max 10 MB, image MIME sniff)
→ POST /media/register {key, alt} → media.process worker derives variants
```

### 5.5 Auth refresh
```
/api/v1/auth/refresh (httpOnly cookie) → rotate refresh token (old one invalidated, reuse-detection)
→ issue new access token. Admin routes: JwtAuthGuard + RolesGuard(ADMIN|EDITOR).
```

## 6. API Surface (v1)

```
PUBLIC
  GET  /health /health/db /health/redis
  GET  /programs  /programs/:slug
  GET  /articles  /articles/:slug        (?locale= for /id later)
  GET  /testimonials /team /locations /stats /pressures
  POST /leads
  POST /webhooks/calendly                (HMAC-verified)
AUTH
  POST /auth/login   POST /auth/refresh   POST /auth/logout
ADMIN (JWT + role)
  CRUD /admin/{programs,articles,testimonials,team,locations,stats,pressures}
  PATCH /admin/leads/:id/status          GET /admin/leads?status=&from=&to=
  GET /admin/media/presign  POST /admin/media  PATCH /admin/media/:id
  GET/PATCH /admin/settings
```

Conventions: cursor-less offset pagination (`?page=&size=`), RFC 7807 problem+json errors, `If-Match` optimistic locking on admin writes, request-id header echoed.

## 7. Security Design

| Layer | Controls |
|---|---|
| Edge | Cloudflare WAF, DDoS shield, TLS 1.3 everywhere, HSTS |
| API | Helmet headers, CORS allowlist (web origin only), rate limits per IP+route, payload cap 1 MB (JSON) |
| Auth | bcrypt(12), JWT RS256 (short-lived access), rotating httpOnly refresh cookies, reuse detection → force logout, role guard on every admin route |
| Input | DTO validation, output encoding in React (XSS-safe), markdown sanitized (DOMPurify server-side), SQL via Prisma (parameterized) |
| Media | Presigned URLs, MIME sniff + extension allowlist, image-only, strip EXIF, size cap |
| Secrets | env via platform secret managers; no secrets in repo; DB creds rotated quarterly |
| Privacy | UU ITE consent checkbox on lead form, retention policy (leads purged after 24 mo), privacy page |

## 8. Caching Strategy

| Layer | What | TTL / invalidation |
|---|---|---|
| Cloudflare | static assets, media derivatives | immutable hashes, 1 yr |
| Next.js ISR | public HTML per route | 1 h default + on-demand tag revalidation on writes |
| Redis | public content snapshots, rate-limit counters, sessions | content 10 min; counters sliding window |
| Prisma | query result caching off (small DB; avoid staleness) | — |

## 9. Reliability, Observability, DR

- **Health checks:** `/health/db`, `/health/redis`; Railway restarts unhealthy replicas; uptime monitor pings every 30 s.
- **Errors/tracing:** Sentry on web + api, OTel traces propagated via `x-request-id`, pino logs shipped to a log drain.
- **DB:** managed Postgres with daily backups + PITR (7-day window); quarterly restore drill. Migrations run in CI before API deploy (expand-contract for zero-downtime).
- **Workers:** retry with exponential backoff (5 attempts), dead-letter queue + Sentry alert.
- **RTO 4 h / RPO 24 h** (appropriate for a marketing site; tighten if booking becomes revenue-critical).
- **Environments:** `dev` (PR previews + ephemeral API), `staging` (prod-like, seeded), `prod`. Promotion only via CI.

## 10. Scalability & v2 Hooks

- Stateless API scales horizontally (add replicas); ISR keeps public traffic off the API entirely.
- Redis + BullMQ already present → payments (Xendit webhooks), event registration, and email digests slot in as new workers.
- `Setting`/content tables are locale-ready (`locale` column + `next-intl` routing) for the `/id` rollout.
- Program fees/checkout: add `Price` + `Order` tables; never store card data (redirect to Xendit/Midtrans hosted pages).

## 11. Deployment

```
PR opened      → CI: lint, typecheck, unit tests, build → preview env (Vercel + ephemeral API/DB branch)
merge to main  → CI: migrate prod (expand phase) → deploy API (rolling, 2 replicas) → deploy web → smoke tests
                 → migrate (contract phase) → post-deploy health gate
```
Rollback: Vercel instant; API re-deploy previous image; DB migrations are backward-compatible by policy.

## 12. Risks & Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Monolith API vs microservices | Single NestJS app | Team of 2; module boundaries give structure without ops cost |
| Calendly vs native scheduling | Calendly v1 | Don't rebuild scheduling; native booking is a v2 worker |
| SSR vs SSG-only | ISR hybrid | Fresh content without full rebuilds |
| Managed DB vs self-host | Managed (PITR) | Backups are not a side project |
| i18n | Deferred routing, ready schema | English first, `/id` phase 2 |
