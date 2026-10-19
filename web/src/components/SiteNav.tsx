"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "./LogoMark";

const LINKS = [
  ["/philosophy", "Philosophy"],
  ["/why", "Why coaching"],
  ["/programs", "Programs"],
  ["/coach", "The coach"],
  ["/team", "Team"],
  ["/locations", "Locations"],
  ["/contact", "Contact"],
] as const;

// The last nav item: "Sign in", or "Your account" once the session answers. Unknown until then.
type Session = "unknown" | "signed-in" | "signed-out";

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const pathname = usePathname() ?? "/";
  const menu = useRef<HTMLDetailsElement>(null);
  const bar = useRef<HTMLElement>(null);
  const [session, setSession] = useState<Session>("unknown");

  // Asked again on every navigation, so signing in or out shows up without a reload.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/v1/session", { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { signedIn: false }))
      .then((d: { signedIn?: boolean }) => setSession(d.signedIn ? "signed-in" : "signed-out"))
      .catch(() => {
        if (!ctrl.signal.aborted) setSession("signed-out");
      });
    return () => ctrl.abort();
  }, [pathname]);
  const account = session === "signed-in" ? (["/account", "Your account"] as const) : (["/login", "Sign in"] as const);

  // The sliding highlight: a pale bar under the nav that glides to whichever link is hovered or
  // focused, and rests on the current page.
  useEffect(() => {
    const nav = bar.current;
    if (!nav) return;
    const list = nav.querySelector("ul");
    if (!list) return;
    const place = (a: Element | null) => {
      if (!a || a.classList.contains("nav-signin")) {
        list.style.setProperty("--ind-o", "0");
        return;
      }
      const r = (a as HTMLElement).getBoundingClientRect();
      const lr = list.getBoundingClientRect();
      list.style.setProperty("--ind-x", `${r.left - lr.left + 8}px`);
      list.style.setProperty("--ind-w", `${Math.max(0, r.width - 16)}px`);
      list.style.setProperty("--ind-o", "1");
    };
    const rest = () => place(list.querySelector('a[aria-current="page"]'));
    const over = (e: Event) => {
      const a = (e.target as Element).closest("a");
      if (a) place(a);
    };
    rest();
    list.addEventListener("pointerover", over);
    list.addEventListener("focusin", over);
    list.addEventListener("pointerleave", rest);
    list.addEventListener("focusout", rest);
    addEventListener("resize", rest);
    document.fonts?.ready.then(rest);
    return () => {
      list.removeEventListener("pointerover", over);
      list.removeEventListener("focusin", over);
      list.removeEventListener("pointerleave", rest);
      list.removeEventListener("focusout", rest);
      removeEventListener("resize", rest);
    };
  }, [pathname]);

  // Close the phone menu after a client-side navigation.
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);

  const items = (
    <ul>
      {LINKS.map(([href, label]) => (
        <li key={href}>
          <Link href={href} aria-current={isCurrent(pathname, href) ? "page" : undefined}>
            {label}
          </Link>
        </li>
      ))}
      <li>
        {/* Hidden, not swapped, while the session is unknown: no "Sign in" flash for a signed-in visitor. */}
        <Link
          href={account[0]}
          className="nav-signin"
          data-pending={session === "unknown" ? "" : undefined}
          aria-current={isCurrent(pathname, account[0]) ? "page" : undefined}
        >
          {account[1]}
        </Link>
      </li>
    </ul>
  );

  return (
    <header className="site-head">
      <div className="site-head__light" aria-hidden="true" />
      <div className="site-head__progress" aria-hidden="true" />
      <div className="site-head__comet" aria-hidden="true" />
      <div className="ccg-wrap site-head__bar">
        <Link href="/" className="site-head__home">
          <LogoMark />
        </Link>
        <nav aria-label="Main" className="site-nav" ref={bar}>
          {items}
        </nav>
        <details className="site-menu" ref={menu}>
          <summary aria-label="Menu">
            <span className="site-menu__label">Menu</span>
            <span className="site-menu__glyph" aria-hidden="true" />
          </summary>
          <nav aria-label="Main" className="site-menu__panel">
            {items}
          </nav>
        </details>
      </div>
    </header>
  );
}
