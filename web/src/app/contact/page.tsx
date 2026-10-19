import type { Metadata } from "next";
import { PageFrame } from "@/components/ConstructionField";
import { LeadForm } from "@/components/LeadForm";
import { content } from "@/lib/content";

export const metadata: Metadata = { title: "Contact" };

type Props = { searchParams: Promise<{ lead?: string; interest?: string }> };

export default async function ContactPage({ searchParams }: Props) {
  const [programs, offices] = await Promise.all([content.listPublicPrograms(), content.listOffices()]);
  // The static GitHub Page has no query string. Reading searchParams would keep this page dynamic.
  const params = process.env.GITHUB_PAGES === "1" ? {} : await searchParams;
  const head = offices.find((o) => o.kind === "HEAD");
  const interests = [
    { value: "general", label: "General enquiry" },
    ...programs.map((p) => ({ value: p.code, label: p.title })),
  ];
  const preselected = interests.some((i) => i.value === params.interest) ? params.interest : "general";

  return (
    <PageFrame>
      <h1 className="page__title">Contact</h1>
      <div className="contact">
        {head?.address && (
          <section>
            <h2>Head office, {head.city}</h2>
            <address>{head.address}</address>
          </section>
        )}
        <section className="contact__form">
          <h2>Send an enquiry</h2>
          {/* `lead` carries the outcome back to a browser that posted the form without JavaScript. */}
          <LeadForm interests={interests} defaultInterest={preselected} initialStatus={params.lead} />
        </section>
      </div>
    </PageFrame>
  );
}
