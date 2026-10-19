import type { Metadata } from "next";
import { PageFrame } from "@/components/ConstructionField";
import { EnquireBand } from "@/components/scenes/EnquireBand";
import { BENEFITS, PHILOSOPHY } from "@/content/deck-copy";

export const metadata: Metadata = { title: "Philosophy" };

export default function PhilosophyPage() {
  return (
    <>
    <PageFrame>
      <h1 className="page__title">Philosophy</h1>
      <div className="page__body statements">
        <section className="statement">
          <h2>Vision</h2>
          <p>{PHILOSOPHY.vision}</p>
        </section>
        <section className="statement">
          <h2>Mission</h2>
          <p>{PHILOSOPHY.mission}</p>
        </section>
        <section className="statement">
          <h2>Purpose: {PHILOSOPHY.purposeHeading}</h2>
          <p>{PHILOSOPHY.purpose}</p>
        </section>
        <section className="statement statement--values">
          <h2>Our values</h2>
          <p>{PHILOSOPHY.values}</p>
        </section>
        <section className="statement">
          <h2>Coaching program benefits</h2>
          <ul>
            {BENEFITS.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </section>
      </div>
    </PageFrame>
    <EnquireBand />
    </>
  );
}
