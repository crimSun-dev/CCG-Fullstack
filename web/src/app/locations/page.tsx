import type { Metadata } from "next";
import { PageFrame } from "@/components/ConstructionField";
import { EnquireBand } from "@/components/scenes/EnquireBand";
import { content } from "@/lib/content";
import { OfficeRoute } from "@/components/scenes/OfficeRoute";

export const metadata: Metadata = { title: "Locations" };

const KIND_LABEL = { HEAD: "Head office", BRANCH: "Branch office" } as const;

export default async function LocationsPage() {
  const offices = await content.listOffices();

  return (
    <>
    <PageFrame>
      <h1 className="page__title">Office locations</h1>
      {offices.length > 1 && <OfficeRoute from={offices[0].city} to={offices[offices.length - 1].city} />}
      <div className="page__body offices">
        {offices.map((o) => (
          <section key={o.id}>
            <h2>{o.city}</h2>
            <p>{KIND_LABEL[o.kind]}</p>
            {o.address && <address>{o.address}</address>}
          </section>
        ))}
      </div>
    </PageFrame>
    <EnquireBand />
    </>
  );
}
