# Product

<!-- impeccable:product-schema 1 -->

> Authored from the CCG logo deck (`CCG Power Point Logo.pptx`), the coaching deck (`CK COACHING_2026.pptx`), `web/src/content/deck-copy.ts`, the seeded Postgres rows, and the live routes. Not written from a live interview: the owner's build prompt said "Do not interview again. The brief below is the interview." Every line below traces to one of those sources.

## Platform

web

## Users

- **Public visitor:** a CEO, C-suite leader, or business owner (Jakarta and Seoul) deciding whether to speak to CK Song about coaching. They read, then enquire through `/contact`.
- **Member:** a general visitor who signs in at `/login` and lands on `/account`.
- **Staff editor:** ADMIN or EDITOR, granted only by `pnpm admin:create`. Lands on `/admin`, reads leads, edits program summaries and people.

## Product Purpose

The public site for CK Coaching Group (CCG), a CEO coaching practice founded by CK Song, PhD. It states the philosophy, why a CEO needs a coach, the three programs, the coach, the team, the offices, and takes enquiries. Success is a qualified enquiry that the staff can answer within one business day.

## Positioning

"CEO Coaching: a tailor-made coaching program." The mark itself carries the offer: the outer C is CK Song, the inner C is Coaching, the center is Group. No other practice can truthfully claim that construction.

## Operating Context

- Head office (owner-confirmed 18 Oct 2026): Marketing Gallery, Alam Sutera Marketing Office, Jl. Jalur Sutera Boulevard Kav. 28A, RT.002/RW.003, Panunggangan Tim., Kec. Pinang, Tangerang 15143, Floor 21A. Branch: Seoul (no street address).
- Leads are stored in Postgres; a notice email goes out through Resend. Staff reply by hand when the email status is PENDING or FAILED.
- Admin saves revalidate the public cache tag.

## Capabilities and Constraints

- Next.js 16.4, React 19, Prisma 7.10 pinned, Postgres. One app, one database.
- Exactly three public programs: Leadership Advisory, Group Coaching, Premium Coaching. Every other program path is a 404 (`/programs/internship` included).
- `/contact` and `/login` are real `<form>` posts that work with JavaScript off.
- No prices, checkout, internship, camp, university, or bank details anywhere.
- No registration, username, or password-change screen. Google sign-in only when a client is configured.
- `G:` is exFAT; build and run on the NTFS copy `C:\Users\Draven Chen\src\ccg-public-web`.

## Brand Commitments

- Name: CK Coaching Group. Short name: CCG.
- The mark is the assembled emblem on slide 2 of the logo deck: two blue C-strokes and a pale center disc, opening to the right, on black. Outer C `#1088f8`, center disc and wedge `#70b8f8`, inner C between the two.
- The deck's "Letter G" is the pale disc, never a G glyph. No K monogram, no letter inside the rings, no second logo.
- Fixed copy lives in `src/content/deck-copy.ts`. Words, fields, and controls do not change for visual reasons.
- Slides 3 and 4 of the logo deck are lorem ipsum and never appear.

## Evidence on Hand

- Logo deck pictures in `output/logo-source/` (image2 assembled mark, image3 to image8 the assembly steps, image9 the people icon).
- Meshy 3D emblem `Assets/Meshy_AI_CK_Logo_Emblem_1017052629_image-to-3d-texture_fbx/` with base color, metallic, roughness and normal maps. Shipped as `public/brand/ccg-emblem.glb`.
- Two cited stats (PwC 2024, Stanford and Miles) and seven CEO pressures, from the coaching deck, in the database.
- **Absent and not to be invented:** approved placement for the 45 coaching-deck photographs (`CLARIFY-002`), Erry Sunarli's title, prices, testimonials, client names.

## Product Principles

1. The deck is the authority. Its picture order and its sentences outrank taste.
2. Say less, exactly. Every line on the site is a line the owner wrote or approved.
3. Private by default: no tracking claims, no stored IP, no public admin label.
4. The site works without JavaScript; motion is an addition, never the path to content.

## Accessibility & Inclusion

Reduced motion shows the still emblem and the wordmark with no orbit, explode, or autoplay. Desktop and a 390px phone width both keep headlines readable and the enquiry form usable.
