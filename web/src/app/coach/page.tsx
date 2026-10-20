import type { Metadata } from "next";
import { PageFrame } from "@/components/ConstructionField";
import { EnquireBand } from "@/components/scenes/EnquireBand";
import { BENEFITS, COACH, WELCOME } from "@/content/deck-copy";
import { content } from "@/lib/content";

export const metadata: Metadata = { title: "The coach" };

const PORTRAIT_SRC = "/brand/ck-song.jpg";

export default async function CoachPage() {
  const founder = (await content.listPeople()).find((p) => p.isFounder);

  return (
    <>
    <PageFrame>
      <h1 className="page__title">{COACH.heading}</h1>
      <div className="coach__lead">
        <div className="coach__intro">
          <h2 className="coach__name">{WELCOME.signedBy}</h2>
          <p className="coach__tagline">{COACH.tagline}</p>
          {founder && (
            <>
              {founder.role && <p className="coach__role">{founder.role}</p>}
              <p className="coach__bio">{founder.bio}</p>
            </>
          )}
        </div>
        {/* The stage was already dark; the mask lets it fall into the page ground instead of sitting in a box. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed brand photo at its drawn size */}
        <img
          className="coach__portrait"
          src={PORTRAIT_SRC}
          alt={`${WELCOME.signedBy} speaking on stage, microphone in hand`}
          width={604}
          height={688}
        />
      </div>
      <section className="coach__benefits">
        <h2>Coaching program benefits</h2>
        <ol className="benefits-home__list">
          {BENEFITS.map((b) => (
            <li key={b}>
              <span className="benefits-home__ring" aria-hidden="true" />
              <span>{b}</span>
            </li>
          ))}
        </ol>
      </section>
    </PageFrame>
    <EnquireBand />
    </>
  );
}
