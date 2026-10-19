import Link from "next/link";
import { Arrow } from "@/components/Arrow";
import { ConstructionField } from "@/components/ConstructionField";
import { content } from "@/lib/content";

// The close every public inner page ends on: the one action, and where to find CCG.
export async function EnquireBand() {
  const offices = await content.listOffices();
  return (
    <section className="close close--band" aria-label="Get in touch">
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
  );
}
