import { ConstructionField } from "@/components/ConstructionField";

// The seven pressures from the deck, set around the emblem's rings with the CEO at the center.
// A real ordered list (the /why e2e test counts its items), laid out on a circle at desktop
// widths and as a plain ruled list on phones.
export function PressureOrbit({ pressures, centerLabel }: { pressures: { id: string; title: string }[]; centerLabel: string }) {
  const n = pressures.length;
  return (
    <div className="orbit" style={{ ["--n" as string]: n }}>
      <ConstructionField className="orbit__field" />
      <div className="orbit__center" aria-hidden="true">
        <span>{centerLabel}</span>
      </div>
      <ol className="orbit__list">
        {pressures.map((p, i) => {
          const a = (-90 + (360 / n) * i) * (Math.PI / 180);
          const x = 50 + 46 * Math.cos(a);
          const y = 50 + 46 * Math.sin(a);
          const side = Math.cos(a) > 0.2 ? "right" : Math.cos(a) < -0.2 ? "left" : "mid";
          return (
            <li
              key={p.id}
              className={`orbit__item orbit__item--${side}`}
              style={{ ["--x" as string]: `${x.toFixed(2)}%`, ["--y" as string]: `${y.toFixed(2)}%`, ["--i" as string]: i }}
            >
              <span className="orbit__dot" aria-hidden="true" />
              <span className="orbit__label">{p.title}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
