import Link from "next/link";
import { AssemblyHero } from "@/components/home/AssemblyHero";
import { ScrollStage } from "@/components/home/ScrollStage";
import { ConstructionField } from "@/components/ConstructionField";
import { Arrow } from "@/components/Arrow";
import { PressureOrbit } from "@/components/scenes/PressureOrbit";
import { StatFigures } from "@/components/scenes/StatFigures";
import { BENEFITS, BRAND, PHILOSOPHY, WELCOME, WHY } from "@/content/deck-copy";
import { content } from "@/lib/content";

// Home. Scroll grammar: typographic poster, where the emblem is the letterforms.
//   Act 1  autoplay the assembly (AssemblyHero), plays by itself; the peak is the lock
//   Act 2  kinetic  the vision, on the paper field
//   Act 3  in       the welcome note, signed by CK Song
//   Act 4  count    why a CEO needs a coach: the seven forces in orbit, cited figures counting up
//   Act 5  reveal   the three programs, wiped in as full-width bands
//   Then            benefits, the values line running as a slow band, the team, and the close
export default async function HomePage() {
  const [people, programs, offices, pressures, stats] = await Promise.all([
    content.listPeople(),
    content.listPublicPrograms(),
    content.listOffices(),
    content.listPressures(),
    content.listPublicStats(),
  ]);
  const founder = people.find((p) => p.isFounder);

  return (
    <ScrollStage>
      <AssemblyHero tagline={BRAND.tagline} />

      <div className="scene scene--paper">
        <section className="vision" data-sc-act="flow" aria-label="Vision">
          <ConstructionField className="vision__field" tone="paper" />
          <div className="ccg-wrap">
            <p className="vision__line" data-sc-cue="0.08 1.6 0.12 0.01" data-sc-kinetic="lines">
              {PHILOSOPHY.vision}
            </p>
          </div>
        </section>

        {founder && (
          <section className="welcome">
            <div className="ccg-wrap welcome__grid" data-sc-in data-sc-stagger="70">
              <h2>{WELCOME.heading}</h2>
              <div className="welcome__body">
                <p className="welcome__bio">{founder.bio}</p>
                <p className="welcome__sign">
                  {WELCOME.signedBy}, {WELCOME.signedRole}
                </p>
                <p className="welcome__more">
                  <Link href="/coach" className="text-link">
                    <span>About {founder.name}</span>
                    <Arrow />
                  </Link>
                </p>
              </div>
            </div>
          </section>
        )}
      </div>


      {/* Act 4: why a CEO needs a coach. The deck's seven forces around the rings, the two cited
          figures counting up once, then the answer. */}
      <section className="why-home" data-sc-act="flow" data-sc-spotlight aria-labelledby="why-home-title">
        <div className="ccg-wrap why-home__grid">
          <div className="why-home__copy" data-sc-in data-sc-stagger="70">
            <h2 id="why-home-title">{WHY.openingLines[0]}</h2>
            <p className="why-home__second">{WHY.openingLines[1]}</p>
            <StatFigures stats={stats} animate />
          </div>
          <PressureOrbit pressures={pressures} centerLabel="CEO" />
        </div>
        <div className="ccg-wrap why-home__answer">
          <p className="why-home__ask">{WHY.whoHelps}</p>
          <p className="why-home__def">{WHY.coachDefinition}</p>
          <p>
            <Link href="/why" className="text-link">
              <span>Why coaching</span>
              <Arrow />
            </Link>
          </p>
        </div>
      </section>

      <section className="programs-home" data-sc-act="flow" data-sc-spotlight>
        <div className="ccg-wrap">
          <h2>Programs</h2>
          <ul className="program-rows">
            {programs.map((p, i) => (
              <li key={p.code} data-sc-reveal="left" data-sc-reveal-at={`${0.08 + i * 0.07} ${0.3 + i * 0.07}`}>
                <Link href={`/programs/${p.code}`}>{p.title}</Link>
                <div className="program-rows__meta">
                  <p>{p.summary}</p>
                  {(p.durationLabel || p.capacity !== null) && (
                    <p className="program-rows__spec">
                      {[p.durationLabel, p.sessionsPerYear !== null ? `${p.sessionsPerYear} sessions per year` : "", p.capacity !== null ? `Maximum ${p.capacity} persons` : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>


      {/* What the programs give, and the value they are run on. */}
      <section className="benefits-home">
        <div className="ccg-wrap benefits-home__grid">
          <h2>Coaching program benefits</h2>
          <ol className="benefits-home__list" data-sc-in data-sc-stagger="80">
            {BENEFITS.map((b) => (
              <li key={b}>
                <span className="benefits-home__ring" aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="values-band">
          <div className="values-band__track" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i}>{PHILOSOPHY.values}</span>
            ))}
          </div>
          <p className="ccg-visually-hidden">{PHILOSOPHY.values}</p>
        </div>
      </section>

      <section className="team-home">
        <div className="ccg-wrap">
          <div className="team-home__head">
            <h2>CCG management team</h2>
            <Link href="/team" className="text-link">
              <span>Team</span>
              <Arrow />
            </Link>
          </div>
          <ul className="team-home__list" data-sc-in data-sc-stagger="60">
            {people.map((p) => (
              <li key={p.id} className={p.isFounder ? "is-founder" : undefined}>
                <span className="team-home__name">{p.name}</span>
                {p.role && <span className="team-home__role">{p.role}</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="close">
        <ConstructionField className="close__field" />
        <div className="ccg-wrap close__grid">
          <p className="close__action">
            <Link href="/contact" className="close__link">
              <span>Get in touch</span>
              <Arrow />
            </Link>
          </p>
          <ul className="close__offices">
            {offices.map((o) => (
              <li key={o.id}>
                <span className="close__city">{o.city}</span>
                {o.address && <span className="close__address">{o.address}</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </ScrollStage>
  );
}
