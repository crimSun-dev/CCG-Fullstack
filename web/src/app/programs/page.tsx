import type { Metadata } from "next";
import { PageFrame } from "@/components/ConstructionField";
import { EnquireBand } from "@/components/scenes/EnquireBand";
import Link from "next/link";
import { content } from "@/lib/content";

export const metadata: Metadata = { title: "Programs" };

export default async function ProgramsPage() {
  const programs = await content.listPublicPrograms();

  return (
    <>
    <PageFrame>
      <h1 className="page__title">Programs</h1>
      <div className="page__body program-list">
        {programs.map((p) => (
          <section key={p.code}>
            <h2>
              <Link href={`/programs/${p.code}`}>{p.title}</Link>
            </h2>
            <p>{p.summary}</p>
          </section>
        ))}
      </div>
    </PageFrame>
    <EnquireBand />
    </>
  );
}
