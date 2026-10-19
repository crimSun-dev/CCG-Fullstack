import Link from "next/link";
import { Arrow } from "@/components/Arrow";

export default function NotFound() {
  return (
    <div className="lost ccg-wrap">
      <h1 className="page__title">Page not found</h1>
      <p>
        <Link href="/" className="text-link">
          <span>Back to the home page</span>
          <Arrow />
        </Link>
      </p>
    </div>
  );
}
