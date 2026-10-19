import type { Metadata } from "next";
import { PageFrame } from "@/components/ConstructionField";
import { EnquireBand } from "@/components/scenes/EnquireBand";
import { WHY } from "@/content/deck-copy";
import { content } from "@/lib/content";
import { PressureOrbit } from "@/components/scenes/PressureOrbit";
import { StatFigures } from "@/components/scenes/StatFigures";

export const metadata: Metadata = { title: "Why coaching" };

export default async function WhyPage() {
  const [pressures, stats] = await Promise.all([content.listPressures(), content.listPublicStats()]);

  return (
    <>
    <PageFrame>
      <h1 className="why__open">{WHY.openingLines[0]}</h1>
      <p className="why__second">{WHY.openingLines[1]}</p>

      <section className="why__block">
        <h2>The forces on a CEO</h2>
        <PressureOrbit pressures={pressures} centerLabel="CEO" />
      </section>

      <section className="why__block">
        <h2>What the research says</h2>
        <StatFigures stats={stats} />
      </section>

      <section className="why__block why__coach">
        <h2>{WHY.whoHelps}</h2>
        <p>{WHY.coachDefinition}</p>
        <p>{WHY.topPerformers}</p>
      </section>
    </PageFrame>
    <EnquireBand />
    </>
  );
}
