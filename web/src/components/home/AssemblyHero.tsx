"use client";

import { useEffect, useRef } from "react";
import { ConstructionField } from "@/components/ConstructionField";
import { EMBLEM_GLB_SRC, MARK_CENTRED_SRC, PEOPLE_ICON_SRC } from "@/components/LogoMark";
import { BRAND, LOGO_STORY } from "@/content/deck-copy";
import type { Film, FilmFrame } from "./emblem-film";

// Act 1 of the home page. One stage, one assembly sequence, in the logo deck's order:
//   whole mark -> outer C -> inner C -> center disc -> inner C + disc + wedge -> disc + wedge
//   -> both C's + wedge (empty center) -> LOCK (each part is a word) -> Goal & Target -> Group -> icon
// It plays by itself once the hero is on screen; the visitor does not have to scroll. A pause
// control stops it (WCAG 2.2.2), and it pauses while the hero is off screen. The text cue windows
// (data-cue) and the 3D emblem share one timeline. With reduced motion, no JavaScript, or no WebGL,
// the stage is a still page: the assembled emblem, the wordmark, and the deck's sentences.

const DURATION = 26; // seconds for the whole sequence. The lock owns the largest share of it.
const END = 0.965; // the sequence rests on its last picture: the Group line and the people icon.
const START_DELAY = 1.2; // seconds of stillness on the whole mark before it comes apart.

type Cue = { el: HTMLElement; from: number; to: number | null; rIn: number; rOut: number; rise: boolean };

function readCues(root: HTMLElement): Cue[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-cue]")).map((el) => {
    const n = (el.dataset.cue ?? "").trim().split(/\s+/).map(parseFloat);
    return {
      el,
      from: n[0] || 0,
      to: n.length > 1 && !Number.isNaN(n[1]) ? n[1] : null,
      rIn: n.length > 2 && !Number.isNaN(n[2]) ? n[2] : 0.3,
      rOut: n.length > 3 && !Number.isNaN(n[3]) ? n[3] : 0.3,
      rise: el.dataset.rise !== "0",
    };
  });
}

// Same contract as the scrollcraft engine's cues: "from [to [rampIn [rampOut]]]", ramps as fractions
// of the window, one value holds to the end, a rampIn of 0 is already lit when its window opens.
function cueOpacity(c: Cue, p: number): number {
  const to = c.to ?? 1;
  const w = Math.max(to - c.from, 1e-6);
  const inEnd = c.from + c.rIn * w;
  const outStart = to - c.rOut * w;
  if (p < c.from) return c.from === 0 && c.rIn === 0 ? 1 : 0;
  if (p < inEnd) return (p - c.from) / Math.max(inEnd - c.from, 1e-6);
  if (c.to === null || p < outStart) return 1;
  if (p < to) return (to - p) / Math.max(to - outStart, 1e-6);
  return 0;
}
const smooth = (v: number) => v * v * (3 - 2 * v);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function AssemblyHero({ tagline }: { tagline: string }) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const leaders = useRef<SVGSVGElement>(null);
  const words = useRef<HTMLHeadingElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    if (html.dataset.motion !== "on") return;
    const sec = section.current;
    const stg = stage.current;
    const cv = canvas.current;
    if (!sec || !stg || !cv) return;

    let film: Film | null = null;
    let disposed = false;
    let visible = true;
    const cues = readCues(stg);
    const button = toggle.current;

    // The clock. Time only advances while playing and on screen.
    let elapsed = -START_DELAY;
    let playing = true;
    let last = 0;
    let raf = 0;

    const applyCues = (p: number) => {
      for (const c of cues) {
        const o = smooth(clamp01(cueOpacity(c, p)));
        c.el.style.opacity = o.toFixed(3);
        c.el.style.transform = c.rise ? `translate3d(0, ${((1 - o) * 14).toFixed(1)}px, 0)` : "";
        c.el.style.visibility = o < 0.01 ? "hidden" : "visible";
      }
    };

    const setButton = () => {
      if (!button) return;
      const done = elapsed / DURATION >= END;
      button.dataset.state = done ? "done" : playing ? "playing" : "paused";
      const label = button.querySelector(".hero__toggle-label");
      if (label) label.textContent = done ? "Replay" : playing ? "Pause" : "Play";
      button.setAttribute("aria-label", done ? "Replay the logo animation" : playing ? "Pause the logo animation" : "Play the logo animation");
    };

    const frame = (now: number) => {
      raf = 0;
      // Real time, so a slow device still finishes on schedule; long gaps (a background tab) are capped.
      const dt = last ? Math.min(0.5, (now - last) / 1000) : 0;
      last = now;
      if (playing && visible) elapsed += dt;
      const p = Math.min(END, Math.max(0, elapsed / DURATION));
      film?.setProgress(p);
      applyCues(p);
      button?.style.setProperty("--played", (p / END).toFixed(4));
      if (p >= END && playing) {
        playing = false;
        setButton();
      }
      if (playing && visible) raf = requestAnimationFrame(frame);
      else last = 0;
    };
    const run = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const onToggle = () => {
      if (elapsed / DURATION >= END) {
        elapsed = -START_DELAY * 0.5; // replay from the whole mark
        playing = true;
      } else {
        playing = !playing;
      }
      setButton();
      run();
    };
    button?.addEventListener("click", onToggle);

    const onFrame = (f: FilmFrame) => {
      placeWords(f);
      // The construction field rides behind the emblem: same centre, a dial around its rim.
      stg.style.setProperty("--field-x", `${f.center.x.toFixed(1)}px`);
      stg.style.setProperty("--field-y", `${f.center.y.toFixed(1)}px`);
      stg.style.setProperty("--field-size", `${(Math.max(f.emblemHeight, 40) * 1.24).toFixed(1)}px`);
      stg.style.setProperty("--hero-p", f.p.toFixed(4));
    };

    const placeWords = (f: FilmFrame) => {
      const h = words.current;
      const svg = leaders.current;
      if (!h || !svg) return;
      // Lock window: words and leaders arrive as the parts close, the founder's name collapses
      // into the wordmark, then all of it gives way to the deck's two lines.
      const lockIn = clamp01((f.p - 0.715) / 0.05);
      const lockOut = 1 - clamp01((f.p - 0.865) / 0.025);
      const draw = lockIn * lockOut;
      const song = 1 - clamp01((f.p - 0.8) / 0.035); // "CK Song" -> "CK"
      h.style.setProperty("--song", song.toFixed(3));
      const size = f.portrait ? Math.min(46, f.emblemHeight * 0.2) : Math.max(30, f.emblemHeight * 0.165);
      // Desktop rows: the three words stacked as the wordmark, centred on the ring centre.
      const centreY = (f.emblemTop + f.emblemBottom) / 2;
      h.style.setProperty("--lock-size", `${size.toFixed(1)}px`);
      const order = ["outer", "inner", "disc"] as const;
      const wordX = f.portrait ? 0 : f.emblemRight + Math.max(36, f.emblemHeight * 0.16);
      order.forEach((part, i) => {
        const el = h.querySelector<HTMLElement>(`[data-part="${part}"]`);
        const line = svg.querySelector<SVGPolylineElement>(`polyline[data-part="${part}"]`);
        const dot = svg.querySelector<SVGCircleElement>(`circle[data-part="${part}"]`);
        if (!el || !line || !dot) return;
        const a = f.anchors[part];
        if (f.portrait) {
          const x = parseFloat(getComputedStyle(stg).paddingLeft) || 20;
          el.style.setProperty("--lx", `${x}px`);
          el.style.setProperty("--ly", `${(f.emblemBottom + size * (1.1 + i * 1.02)).toFixed(1)}px`);
          line.style.opacity = "0";
          dot.style.opacity = "0";
          return;
        }
        const rowY = centreY + (i - 1) * size * 1.06;
        el.style.setProperty("--lx", `${wordX.toFixed(1)}px`);
        el.style.setProperty("--ly", `${rowY.toFixed(1)}px`);
        // Elbow leader: out of the ring's opening horizontally, then a 45 degree run (the
        // emblem's own cut angle) to the word. Drawn progressively as the parts lock.
        const x2 = wordX - 14;
        const dy = rowY - a.y;
        const elbowX = Math.max(a.x + 8, x2 - Math.abs(dy));
        const pts: [number, number][] = [
          [a.x, a.y],
          [elbowX, a.y],
          [x2, rowY],
        ];
        const lens = [elbowX - a.x, Math.hypot(x2 - elbowX, dy)];
        const total = lens[0] + lens[1];
        let left = total * clamp01(draw * 1.4 - i * 0.12);
        const shown: string[] = [`${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`];
        for (let s = 0; s < 2 && left > 0; s++) {
          const k = Math.min(1, left / Math.max(lens[s], 0.001));
          const x = pts[s][0] + (pts[s + 1][0] - pts[s][0]) * k;
          const y = pts[s][1] + (pts[s + 1][1] - pts[s][1]) * k;
          shown.push(`${x.toFixed(1)},${y.toFixed(1)}`);
          left -= lens[s];
        }
        line.setAttribute("points", shown.join(" "));
        line.style.opacity = (draw * song + draw * 0.35 * (1 - song)).toFixed(3);
        dot.setAttribute("cx", a.x.toFixed(1));
        dot.setAttribute("cy", a.y.toFixed(1));
        dot.style.opacity = draw.toFixed(3);
      });
    };

    const onResize = () => {
      film?.resize();
      run();
    };

    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        run();
      },
      { threshold: 0.25 },
    );

    (async () => {
      try {
        const { createFilm } = await import("./emblem-film");
        if (disposed) return;
        film = await createFilm({ canvas: cv, stage: stg, src: EMBLEM_GLB_SRC, onFrame });
        if (disposed) {
          film.dispose();
          return;
        }
        sec.classList.add("is-live");
        io.observe(sec);
        addEventListener("resize", onResize, { passive: true });
        setButton();
        applyCues(0);
        run();
      } catch (err) {
        // No WebGL context, or the model failed to load: fall back to the still hero.
        console.warn("[ccg] hero film unavailable, showing the still emblem", err);
        html.dataset.motion = "off";
      }
    })();

    return () => {
      disposed = true;
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      button?.removeEventListener("click", onToggle);
      removeEventListener("resize", onResize);
      film?.dispose();
    };
  }, []);

  const { outer, inner, center, goal, group } = LOGO_STORY;

  return (
    <section ref={section} className="hero" aria-label={BRAND.name}>
      <div ref={stage} className="hero__stage">
        <ConstructionField className="hero__field" />
        <div className="hero__ripples" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <img className="hero__poster" src={MARK_CENTRED_SRC} alt="" width={600} height={600} />
        <canvas ref={canvas} className="hero__canvas" aria-hidden="true" />
        <svg ref={leaders} className="hero__leaders" aria-hidden="true">
          <polyline data-part="outer" stroke="#1088f8" />
          <polyline data-part="inner" stroke="#3e9ff8" />
          <polyline data-part="disc" stroke="#70b8f8" />
          <circle data-part="outer" r="4" fill="#1088f8" />
          <circle data-part="inner" r="4" fill="#3e9ff8" />
          <circle data-part="disc" r="4" fill="#70b8f8" />
        </svg>

        {/* Arrival: the whole mark, still. One line of text. */}
        <p className="hero__arrival" data-cue="0 0.07 0">
          {tagline}
        </p>

        {/* Separation and naming, in the deck's words. */}
        <div className="hero__caption hero__caption--trail" data-part="outer" data-cue="0.1 0.235 0.25 0.25">
          <h2>{outer.name}</h2>
          <p>
            {outer.line} “<b>{outer.initial}</b>
            {outer.rest}”
          </p>
        </div>
        <div className="hero__caption hero__caption--lead" data-part="inner" data-cue="0.255 0.36 0.25 0.25">
          <h2>{inner.name}</h2>
          <p>
            {inner.line} “<b>{inner.initial}</b>
            {inner.rest}”
          </p>
        </div>
        <div className="hero__caption hero__caption--trail" data-part="disc" data-cue="0.385 0.48 0.25 0.25">
          <h2>{center.name}</h2>
          <p>
            {center.line} “<b>{center.initial}</b>
            {center.rest}”
          </p>
        </div>

        {/* The lock. Each part is a word; the founder's name is the outer ring. */}
        <h1 ref={words} className="hero__lockup" data-cue="0.705 0.885 0.12 0.18" data-rise="0">
          <span className="lock-word" data-part="outer">
            <span className="lock-word__text">
              <span className="lock-init">C</span>K<span className="lock-song" aria-hidden="true">
                {" "}
                Song
              </span>
            </span>
          </span>{" "}
          <span className="lock-word" data-part="inner">
            <span className="lock-word__text">
              <span className="lock-init">C</span>oaching
            </span>
          </span>{" "}
          <span className="lock-word" data-part="disc">
            <span className="lock-word__text">
              <span className="lock-init">G</span>roup
            </span>
          </span>
        </h1>

        <figure className="hero__line hero__line--goal" data-cue="0.875">
          <blockquote>
            <p>“{goal}”</p>
          </blockquote>
        </figure>
        <div className="hero__line hero__line--group" data-cue="0.905">
          <p>{group}</p>
          <img className="hero__people" src={PEOPLE_ICON_SRC} alt="" width={111} height={86} data-cue="0.93" data-rise="0" />
        </div>
        {/* Pause control. Its ring fills as the assembly plays: the mark's outer C as a progress line. */}
        <button ref={toggle} type="button" className="hero__toggle" data-state="playing" aria-label="Pause the logo animation">
          <svg className="hero__toggle-ring" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="ccg-ring-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#1088f8" />
                <stop offset="1" stopColor="#70b8f8" />
              </linearGradient>
            </defs>
            <circle cx="20" cy="20" r="17" className="hero__toggle-track" />
            <circle cx="20" cy="20" r="17" className="hero__toggle-fill" pathLength={1} />
            <g className="hero__toggle-pause">
              <rect x="15" y="13.5" width="3" height="13" />
              <rect x="22" y="13.5" width="3" height="13" />
            </g>
            <path className="hero__toggle-play" d="M16.5 13 L27 20 L16.5 27 Z" />
          </svg>
          <span className="hero__toggle-label">Pause</span>
        </button>
      </div>
    </section>
  );
}
