// The emblem's construction drawing: the exact radii of the slide 2 mark (outer C 72.57 to 100,
// inner C 32.35 to 59.94, center disc 18.32), its two 45 degree cuts, the horizontal edge of the
// wedge, and a dial around it ("Goal & Target"). It is geometry, never the logo: no filled parts,
// no letters. Used as the site's one decorative device, behind headings and the hero.

const RADII = [100, 72.57, 59.94, 32.35, 18.32];
const toXY = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [+(r * Math.cos(a)).toFixed(2), +(-r * Math.sin(a)).toFixed(2)] as const;
};

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5).map((deg) => {
  const major = deg % 45 === 0;
  const [x1, y1] = toXY(major ? 104 : 108, deg);
  const [x2, y2] = toXY(114, deg);
  return { deg, major, x1, y1, x2, y2 };
});

// The outer C as an open arc (45 -> 315 degrees, through the left), in SVG coordinates.
const OUTER_ARC = (() => {
  const [x0, y0] = toXY(86.3, 45);
  const [x1, y1] = toXY(86.3, 315);
  return `M${x0} ${y0}A86.3 86.3 0 1 0 ${x1} ${y1}`;
})();

export function ConstructionField(props: { className?: string; tone?: "ink" | "paper"; accent?: boolean }) {
  const [c45x, c45y] = toXY(122, 45);
  const [c315x, c315y] = toXY(122, -45);
  return (
    <svg
      className={["field", props.tone === "paper" ? "field--paper" : "", props.className].filter(Boolean).join(" ")}
      viewBox="-124 -124 248 248"
      aria-hidden="true"
      focusable="false"
    >
      <g className="field__lines">
        <circle r="114" />
        {RADII.map((r) => (
          <circle key={r} r={r} />
        ))}
        <line x1="0" y1="0" x2={c45x} y2={c45y} className="field__guide" />
        <line x1="0" y1="0" x2={c315x} y2={c315y} className="field__guide" />
        <line x1="0" y1="0" x2="122" y2="0" className="field__guide" />
        <line x1="-122" y1="0" x2="-104" y2="0" />
        <line x1="0" y1="-122" x2="0" y2="-104" />
        <line x1="0" y1="104" x2="0" y2="122" />
        <line x1="-6" y1="0" x2="6" y2="0" />
        <line x1="0" y1="-6" x2="0" y2="6" />
      </g>
      <g className="field__ticks">
        {TICKS.map((t) => (
          <line key={t.deg} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className={t.major ? "is-major" : undefined} />
        ))}
      </g>
      {props.accent !== false && <path className="field__accent" d={OUTER_ARC} pathLength={1} />}
    </svg>
  );
}

// A public inner page: the construction field cropped into the top-right of the title band.
export function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-shell">
      <ConstructionField className="page-shell__field" />
      <div className="page ccg-wrap">{children}</div>
    </div>
  );
}
