import { SearchRequest } from "@suwatte/toolchain";

import { DEFAULT_SORT } from "./constants";
import { buildQueryString, selectedIds } from "./utils";

export interface BrowseOptions {
  sort?: string;
  ascending?: boolean;
  query?: string;
  types?: string[];
  genres?: string[];
  statuses?: string[];
  content?: string[];
}

/** Builds a `/browse` path from sort, search text, and filters. */
export function buildBrowsePath(options: BrowseOptions, page: number): string {
  const query = buildQueryString({
    q: options.query?.trim() || undefined,
    sort: options.sort || DEFAULT_SORT,
    dir: options.ascending ? "asc" : undefined,
    type: options.types,
    genre: options.genres,
    status: options.statuses,
    content: options.content,
    page: page > 1 ? page : undefined,
  });
  return query ? `/browse?${query}` : "/browse";
}

export function buildSearchPath(request: SearchRequest, page: number): string {
  const filters = (request.filters ?? {}) as Record<string, unknown>;
  return buildBrowsePath(
    {
      sort: request.sort?.key || DEFAULT_SORT,
      ascending: request.sort?.ascending,
      query: request.query,
      types: selectedIds(filters.types),
      genres: selectedIds(filters.genres),
      statuses: selectedIds(filters.status),
      content: selectedIds(filters.content),
    },
    page
  );
}
