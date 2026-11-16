import { SearchRequest } from "@suwatte/toolchain";

import { DEFAULT_CLASSES, DEFAULT_SORT } from "./constants";
import { buildQueryString, selectedIds } from "./utils";

export interface SearchOptions {
  query?: string;
  classes?: string[];
  sort?: string;
}

/** Builds a `/search` path; empty classes fall back to Series + Doujin. */
export function buildSearchPath(options: SearchOptions, page: number): string {
  const query = buildQueryString({
    q: options.query?.trim() || undefined,
    classes: options.classes?.length ? options.classes : DEFAULT_CLASSES,
    sort:
      options.sort && options.sort !== DEFAULT_SORT ? options.sort : undefined,
    page: page > 1 ? page : undefined,
  });
  return `/search?${query}`;
}

export function searchPathFromRequest(
  request: SearchRequest,
  page: number
): string {
  const filters = (request.filters ?? {}) as Record<string, unknown>;
  return buildSearchPath(
    {
      query: request.query,
      classes: selectedIds(filters.classes),
      sort: request.sort?.key || DEFAULT_SORT,
    },
    page
  );
}
