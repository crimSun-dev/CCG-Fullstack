"use client";

import { useEffect, useRef } from "react";

// Loads the scrollcraft engine (public/vendor/scrollcraft.js, vendored untouched) and mounts it on
// the home page's acts. The engine reads data-sc-* attributes off the server-rendered markup; it
// never builds DOM. Without JavaScript the page is complete: see the noscript rule below.

type ScrollCraftApi = { mount: (root: Element) => unknown };
declare global {
  interface Window {
    ScrollCraft?: ScrollCraftApi;
  }
}

let loading: Promise<ScrollCraftApi> | null = null;
function loadEngine(): Promise<ScrollCraftApi> {
  if (window.ScrollCraft) return Promise.resolve(window.ScrollCraft);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/vendor/scrollcraft.js";
    s.async = true;
    s.onload = () => (window.ScrollCraft ? resolve(window.ScrollCraft) : reject(new Error("scrollcraft missing")));
    s.onerror = () => reject(new Error("scrollcraft failed to load"));
    document.head.appendChild(s);
  });
  return loading;
}

const mounted = new WeakSet<Element>();

export function ScrollStage({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || mounted.has(el)) return;
    mounted.add(el);
    loadEngine()
      .then((sc) => sc.mount(el))
      .catch(() => {
        // The engine failed: show every cue as plain content rather than leave it at opacity 0.
        el.classList.add("sc-off");
      });
  }, []);

  return (
    <div ref={root} className="sc-root">
      <noscript>
        <style>{`[data-sc-cue],[data-sc-in],[data-sc-stagger]>*{opacity:1!important;transform:none!important}[data-sc-reveal]{clip-path:none!important}`}</style>
      </noscript>
      {children}
    </div>
  );
}
