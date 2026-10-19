// The two cited figures from the coaching deck. The number counts up once (scrollcraft
// data-sc-count on home); the server renders the final value, so it is correct without JavaScript.
type Stat = { id: string; valueText: string; statement: string; sourceName: string; sourceDate: string };

export function StatFigures({ stats, animate = false }: { stats: Stat[]; animate?: boolean }) {
  return (
    <div className="figures">
      {stats.map((s, i) => {
        const m = /^(\d+(?:\.\d+)?)(.*)$/.exec(s.valueText);
        return (
          <figure key={s.id} className="figure">
            <p className="figure__value" aria-label={s.valueText}>
              {m ? (
                <>
                  <span
                    className="figure__num"
                    {...(animate ? { "data-sc-count": `0 ${m[1]}`, "data-sc-count-at": `${0.12 + i * 0.06} ${0.42 + i * 0.06}` } : {})}
                  >
                    {m[1]}
                  </span>
                  <span className="figure__unit">{m[2]}</span>
                </>
              ) : (
                s.valueText
              )}
            </p>
            <div className="figure__meter" aria-hidden="true">
              <span style={{ ["--v" as string]: m ? Math.min(100, Number(m[1])) / 100 : 0 }} />
            </div>
            <blockquote>
              <p>{s.statement}</p>
            </blockquote>
            <figcaption>
              {s.sourceName}
              {s.sourceDate && `, ${s.sourceDate}`}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
