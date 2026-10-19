import { unstable_cache } from "next/cache";
import { createContentRepository, type ContentRepository } from "./content-repository";
import { db } from "./db";
import type { ProgramCode } from "./publish-gate";

// Page-facing reads. Each list is cached under one tag; an admin save revalidates that tag.
// There is no Redis copy and no second cache (TDD 1.3).
export const CACHE_TAGS = {
  programs: "programs",
  people: "people",
  offices: "offices",
  stats: "stats",
} as const;

const repo = (): ContentRepository => createContentRepository(db());

export const content: ContentRepository = {
  listPublicPrograms: unstable_cache(() => repo().listPublicPrograms(), ["programs:list"], {
    tags: [CACHE_TAGS.programs],
  }),
  getPublicProgram: unstable_cache((code: ProgramCode) => repo().getPublicProgram(code), ["programs:one"], {
    tags: [CACHE_TAGS.programs],
  }),
  listPeople: unstable_cache(() => repo().listPeople(), ["people:list"], { tags: [CACHE_TAGS.people] }),
  listOffices: unstable_cache(() => repo().listOffices(), ["offices:list"], { tags: [CACHE_TAGS.offices] }),
  listPublicStats: unstable_cache(() => repo().listPublicStats(), ["stats:list"], { tags: [CACHE_TAGS.stats] }),
  // Pressures change with the stats copy; they share its tag.
  listPressures: unstable_cache(() => repo().listPressures(), ["pressures:list"], { tags: [CACHE_TAGS.stats] }),
};
