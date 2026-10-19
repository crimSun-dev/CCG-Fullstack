// The only list of offers that exist in public. It never reads the database.
// The program table's CHECK constraint lists the same three strings; change both in one commit.

export const PUBLIC_PROGRAM_CODES = [
  "leadership-advisory",
  "group-coaching",
  "premium-coaching",
] as const;

export type ProgramCode = (typeof PUBLIC_PROGRAM_CODES)[number];

export class OfferNotPublicError extends Error {
  readonly code = "OFFER_NOT_PUBLIC" as const;
  constructor(readonly slug: string) {
    super(`Offer is not on the public site: ${slug}`);
  }
}

export function isPublicPath(slug: string): slug is ProgramCode {
  return (PUBLIC_PROGRAM_CODES as readonly string[]).includes(slug);
}

export function assertPublicCode(slug: string): ProgramCode {
  if (!isPublicPath(slug)) throw new OfferNotPublicError(slug);
  return slug;
}
