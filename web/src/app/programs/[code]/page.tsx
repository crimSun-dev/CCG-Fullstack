import type { Metadata } from "next";
import { PageFrame } from "@/components/ConstructionField";
import { EnquireBand } from "@/components/scenes/EnquireBand";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Arrow } from "@/components/Arrow";
import { content } from "@/lib/content";
import { isPublicPath, PUBLIC_PROGRAM_CODES } from "@/lib/publish-gate";

// Only the three gated codes are pages. Any other slug is a 404 with no query (TDD 1.2, withheld offer).
export const dynamicParams = false;

export function generateStaticParams() {
  return PUBLIC_PROGRAM_CODES.map((code) => ({ code }));
}

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  if (!isPublicPath(code)) return {};
  const program = await content.getPublicProgram(code);
  return program ? { title: program.title, description: program.summary } : {};
}

export default async function ProgramPage({ params }: Props) {
  const { code } = await params;
  if (!isPublicPath(code)) notFound();
  const program = await content.getPublicProgram(code);
  if (!program) notFound();

  return (
    <>
    <PageFrame>
      <h1 className="page__title">{program.title}</h1>
      <p className="program__summary">{program.summary}</p>
      <dl className="spec">
        {program.durationLabel && (
          <div>
            <dt>Duration</dt>
            <dd>{program.durationLabel}</dd>
          </div>
        )}
        {program.sessionsPerYear !== null && (
          <div>
            <dt>Sessions</dt>
            <dd>{`${program.sessionsPerYear} sessions per year`}</dd>
          </div>
        )}
        {program.sessionLengthLabel && (
          <div>
            <dt>Each session</dt>
            <dd>{program.sessionLengthLabel}</dd>
          </div>
        )}
        {program.capacity !== null && (
          <div>
            <dt>Participants</dt>
            <dd>{`Maximum ${program.capacity} persons`}</dd>
          </div>
        )}
        {program.formatLabel && (
          <div>
            <dt>Format</dt>
            <dd>{program.formatLabel}</dd>
          </div>
        )}
      </dl>
      <p className="program__enquire">
        <Link className="btn btn--primary" href={`/contact?interest=${program.code}`}>
          <span>Enquire about {program.title}</span>
          <Arrow />
        </Link>
      </p>
    </PageFrame>
    <EnquireBand />
    </>
  );
}
