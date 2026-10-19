import type { Metadata } from "next";
import { PageFrame } from "@/components/ConstructionField";
import { EnquireBand } from "@/components/scenes/EnquireBand";
import { content } from "@/lib/content";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const people = await content.listPeople();

  return (
    <>
    <PageFrame>
      <h1 className="page__title">CCG management team</h1>
      <ul className="page__body team">
        {people.map((p) => (
          <li key={p.id}>
            <h2>{p.name}</h2>
            {/* A null role means the title is not confirmed yet; the line is omitted, not guessed. */}
            {p.role && <p>{p.role}</p>}
            {p.bio && <p>{p.bio}</p>}
          </li>
        ))}
      </ul>
    </PageFrame>
    <EnquireBand />
    </>
  );
}
