# Design

> Recorded from the built world (October 2026), not written ahead of it. Product truth is in `PRODUCT.md`. The home scroll's brief is in `../scrollcraft/builds/ccg-home/BRIEF.md`.

## World

The logo deck's emblem on black. Two blue C-strokes and a pale center, opening to the right. The one decorative device is the emblem's construction drawing (`src/components/ConstructionField.tsx`): hairline circles at the mark's exact radii, the 45 degree cuts, a dial, and the outer C traced in blue. It sits behind the hero emblem (turning slowly as the sequence plays), cropped into the top right of every public inner page with a faint blue light, behind the vision on the paper field, and behind the close. A film grain covers the whole site. Nothing on the site is decoration that the mark does not already contain: rings become hairline rules and list dots, the 45 degree radial cut at the C's opening becomes the one corner cut on the primary control and the angle of the lock's leader lines.

- **Persuade (public pages):** black ground, off-white type, the blues as the only color.
- **Operate (`/login`, `/account`, `/admin`):** quiet off-white field, black type, the deep blue only where something acts. The header stays black.

## Color

| Token | Value | Role |
|---|---|---|
| `--ccg-black` | `#030507` | the ground (not pure black) |
| `--ccg-blue` | `#1088f8` | outer C; primary action; focus ring; selection |
| `--ccg-blue-inner` | `#3e9ff8` | inner C, between the two blues |
| `--ccg-pale` | `#70b8f8` | center disc and wedge; quiet emphasis, list dots, the Group line |
| `--ccg-blue-deep` | `#0a5fbf` | the same hue, darker: links and focus on the paper field |
| `--sc-ink` | `#eef2f6` | type on black |
| `--sc-ink-soft` | `#9aaabd` | secondary type on black (blue-tinted, never gray) |
| `--ccg-paper` | `#f1f3f5` | Operate field, and the vision/welcome scene on home |
| `--ccg-paper-ink` / `--ccg-paper-soft` | `#080b10` / `#475263` | type on paper |

No second hue. Errors use a muted red on the Operate field only.

## Type

One family, **Archivo** (variable, self-hosted at `/fonts/archivo-var.woff2`). Display 760 to 800 weight with tracking from -0.02em to -0.05em as size grows; text 380 to 450 weight. Section labels are set as quiet 16px headings in `--sc-ink-soft`, never as eyebrows above a heading.

## Layout and components

- `scrollcraft.css` (vendored engine floor, do not edit) provides tokens, spacing (4px base), and devices. `src/styles/site.css` themes it and draws the site.
- Content sits in `.ccg-wrap` (max 82rem, fluid gutter). Lists of things (pressures, programs, team, statements, spec sheets) are hairline-ruled rows, never cards.
- Radius is 2px everywhere. One button family (`.btn`, `src/components/Arrow.tsx`): a rectangle in Archivo 700 with a hairline arrow drawn at the emblem's 45 degree angle; on hover a pale-blue fill wipes in from the left and the arrow steps forward. Primary is solid `#1088f8`. Text links (`.text-link`) carry the same arrow. Sign in on `/login` uses the same shape in black.
- Header: sticky black bar. Top left is the deck's lockup, the flat emblem with "CK / Coaching / Group" stacked in Archivo 800, always visible; a short blue rule runs under it. The eight links sit at right; the current page is marked with a small pale disc (the emblem's center); Sign in is set apart by a hairline and an outlined box. Below 1120px the links move into a native `<details>` menu (outlined "Menu" button, full-height panel) so navigation works without JavaScript.
- Hero pause control: a ring that fills in blue as the assembly plays, with the pause or play glyph inside; the label hides on phones and the control moves to the top right there.

## The mark

`src/components/LogoMark.tsx` owns every logo asset:

- `public/brand/ccg-mark.svg`: the flat emblem, geometry measured from `image2.png` (outer ring r 72.57 to 100, inner ring 32.35 to 59.94, disc 18.32, cuts at plus and minus 45 degrees). Header and favicon.
- `public/brand/ccg-mark-centred.svg`: the same mark on a square, ring-centred box; the hero poster and the still hero.
- `public/brand/ccg-emblem.glb`: the Meshy emblem, split into `outer`, `inner`, `disc`, `wedge`; meshopt-compressed, with the base color, normal, and packed roughness/metallic maps (WebP). Materials are rebuilt at runtime in the brand blues; the base map only modulates them (plus or minus 18%). Metalness 0.08, roughness about 0.55.
- `public/brand/ccg-people.png`: the deck's people icon, used once, after the Group line.

No second logo in the footer, on buttons, or as a pattern.

## Scenes added 18 Oct (owner: more elements, less empty ground)

- Home, after the welcome note: **Why a CEO needs a coach**. The seven forces from the deck sit in orbit around a pale "CEO" disc over a slowly turning construction drawing (`scenes/PressureOrbit.tsx`, a real `<ol>`), with the two cited figures counting up once and a fill bar under each (`scenes/StatFigures.tsx`). A pointer-follow light (scrollcraft `data-sc-spotlight`) sits on this scene and the programs.
- Home, after the programs: the three **benefits** in hairline columns topped by the three blues, then the values line ("We lead with Respect and Integrity.") running as a slow blue band; then the **team strip**.
- Every public inner page ends on the same **Get in touch** band with both offices (`scenes/EnquireBand.tsx`). `/locations` draws the route between the two offices (`scenes/OfficeRoute.tsx`, not a map). `/coach` lists the benefits. `/why` uses the orbit and the figures.
- Entrances: inner page titles rise and the construction drawing traces itself on load; list rows, figures, benefits and team cells settle in as they scroll into view (CSS scroll-driven animation where supported). All of it stops under reduced motion.

## The living ground and the bar (18 Oct)

- Behind every dark page (`src/components/Ambient.tsx`): a faint 72px drafting grid that drifts and fades toward the bottom, two slow-moving blue lights, and a third light that follows the pointer (fine pointers only).
- The top bar is translucent black with a background blur, deepens and drops a soft shadow once the page scrolls, and the logo tightens slightly. Its lower edge carries a reading-progress line in the three blues (CSS scroll timeline) and a small light that runs along it every nine seconds. A pointer light follows the cursor inside the bar.
- Nav: a pale bar slides under whichever link is hovered or focused and rests on the current page. Sign in fills with blue from the left on hover. The logo turns through its 45 degree opening on hover and the three words step out in the three blues.
- Hero: rings ripple outward from the emblem's center while the assembly plays.
- Reduced motion stops all of it.

## Gradients (18 Oct, owner request)

All inside the mark's range (black, #0a5fbf, #1088f8, #3e9ff8, #70b8f8). Dark scenes fall into deep navy (#04101f to #0a2a52) and back; section rules glow blue in the middle and fade at both ends; the paper field has a cool light from the upper left; a deep blue well sits behind the hero emblem. The primary button, the values band, the benefit rules, the figure bars, the progress line and the pause ring run blue to pale; the CEO disc is a lit sphere. Gradient text is limited to display sizes: the cited figures, the coach's name, the values line on /philosophy, and "Song" at the lock.

## Motion

- Home only. One authored moment: the assembly (`src/components/home/AssemblyHero.tsx`, `emblem-film.ts`) plays by itself in one viewport, about 26 seconds, once the hero is on screen, and rests on its last picture (the Group line and the people icon). It pauses off screen. A Pause / Play / Replay control sits bottom right. Captions use the same cue contract as the scrollcraft engine, driven by the clock.
- After the lock the page is quiet: a kinetic vision line, a staggered welcome note, program bands wiped in. Nothing keeps spinning.
- Hover transitions 160ms ease-out. `transform`, `opacity`, `clip-path` only.
- `prefers-reduced-motion`, no JavaScript, or no WebGL: `html[data-motion]` is not `on`, and the hero renders as the still emblem, the wordmark, and the deck's sentences.
