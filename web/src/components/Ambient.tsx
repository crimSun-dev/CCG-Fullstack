"use client";

import { useEffect } from "react";

// The black ground is a lit drafting table, not a void: a faint grid, two slow blue lights, and a
// third light that follows the pointer. This component only feeds the pointer position and the
// "scrolled" state to CSS (html --mx/--my, html[data-scrolled]); everything else is in site.css.
// Gated to fine pointers and no reduced-motion preference.
export function Ambient() {
  useEffect(() => {
    const html = document.documentElement;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    let raf = 0;
    let mx = 0.5;
    let my = 0.3;

    const onScroll = () => {
      const s = window.scrollY > 24;
      if (s !== (html.dataset.scrolled === "1")) html.dataset.scrolled = s ? "1" : "0";
    };
    const onMove = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          html.style.setProperty("--mx", `${mx}px`);
          html.style.setProperty("--my", `${my}px`);
        });
    };

    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    if (fine && !reduce) {
      html.dataset.pointer = "1";
      addEventListener("pointermove", onMove, { passive: true });
    }
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient__grid" />
      <div className="ambient__glow ambient__glow--a" />
      <div className="ambient__glow ambient__glow--b" />
      <div className="ambient__pointer" />
    </div>
  );
}
