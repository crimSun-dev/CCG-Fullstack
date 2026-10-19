import type { Metadata, Viewport } from "next";
import { Ambient } from "@/components/Ambient";
import { SiteNav } from "@/components/SiteNav";
import { BRAND } from "@/content/deck-copy";
import "@/styles/scrollcraft.css";
import "@/styles/site.css";

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s | ${BRAND.name}` },
  description: "CK Coaching Group: CEO coaching led by CK Song, PhD. Offices in Jakarta and Seoul.",
  icons: { icon: "/brand/ccg-mark.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#030507" };

// Decided before first paint so the home hero never flashes between its still and film states.
// Motion runs only when the visitor has not asked for reduced motion and WebGL exists.
const MOTION_GATE = `(function(){try{var d=document.documentElement;var r=matchMedia('(prefers-reduced-motion: reduce)').matches;var c=document.createElement('canvas');var g=!!(window.WebGLRenderingContext&&(c.getContext('webgl2')||c.getContext('webgl')));d.dataset.motion=(!r&&g)?'on':'off';}catch(e){}})();`;

// Direction contract (impeccable new-work section 5). Kept in the emitted HTML on purpose.
const CONTRACT = `<!--
THESIS: The C builds itself in the deck's picture order and each part is a word: outer C is CK Song, inner C is Coaching, the center is Group. Refuses the category's stock-photo hero and testimonial grid.
OWN-WORLD: Black ground, outer blue #1088f8, inner #3e9ff8, pale center #70b8f8, off-white type; Archivo throughout (heavy display, regular text); hairline rules, no cards; one control shape with the emblem's 45 degree cut. Operate pages on an off-white field.
STORY: The visitor sees the whole mark, watches it come apart and be named, sees it lock into the name, then reads the vision, the founder's note, and the three programs, and gets in touch.
FIRST VIEWPORT: The assembled 3D emblem, large and still, centered on black; the tagline alone at bottom left; the nav at top.
FORM: Brief-pinned world from the logo deck (no roll). Scrollcraft grammar: typographic poster, the emblem as the letterforms.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_GATE }} />
        <link rel="preload" href="/fonts/archivo-var.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <div hidden dangerouslySetInnerHTML={{ __html: CONTRACT }} />
        <Ambient />
        <div className="sc-grain" aria-hidden="true" />
        <SiteNav />
        <main>{children}</main>
        <footer className="site-foot">
          <div className="ccg-wrap">
            <p>
              © {BRAND.name} · <a href="/privacy">Privacy</a> · <a href="/contact">Contact</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
