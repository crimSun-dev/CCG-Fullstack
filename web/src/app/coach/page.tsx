import type { Metadata } from "next";
import { PageFrame } from "@/components/ConstructionField";
import { EnquireBand } from "@/components/scenes/EnquireBand";
import { BENEFITS, COACH, WELCOME } from "@/content/deck-copy";
import { content } from "@/lib/content";

export const metadata: Metadata = { title: "The coach" };

export default async function CoachPage() {
  const founder = (await content.listPeople()).find((p) => p.isFounder);

  return (
    <>
    <PageFrame>
      <h1 className="page__title">{COACH.heading}</h1>
      <h2 className="coach__name">{WELCOME.signedBy}</h2>
      <p className="coach__tagline">{COACH.tagline}</p>
      {founder && (
        <>
          {founder.role && <p className="coach__role">{founder.role}</p>}
          <p className="coach__bio">{founder.bio}</p>
        </>
      )}
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
