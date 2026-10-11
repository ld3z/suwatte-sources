import { SearchRequest } from "@suwatte/toolchain";

import { DEFAULT_SORT, PAGE_LIMIT } from "./constants";
import { buildQueryString, excludedIds, selectedIds } from "./utils";

export interface ListOptions {
  sort?: string;
  query?: string;
  genres?: string[];
  excludedGenres?: string[];
  status?: string;
  type?: string;
  minChapters?: number | null;
  mtlOnly?: boolean;
}

/** Builds a `/titles/search` path; the endpoint takes a keyword and filters together. */
export function buildListPath(options: ListOptions, page: number): string {
  const query = buildQueryString({
    q: options.query?.trim() || undefined,
    genres: options.genres?.join(","),
    exclude: options.excludedGenres?.join(","),
    status: options.status,
    type: options.type,
    min_ch: options.minChapters && options.minChapters > 0 ? options.minChapters : undefined,
    is_mtl: options.mtlOnly ? "true" : undefined,
    sort: options.sort,
    page,
    limit: PAGE_LIMIT,
  });
  return `/titles/search?${query}`;
}

/** Keyword searches default to best match (no sort) unless a sort is picked. */
export function buildSearchPath(request: SearchRequest, page: number): string {
  const filters = (request.filters ?? {}) as Record<string, any>;
  const query = request.query?.trim();
  const minChapters = parseInt(String(filters.min_chapters ?? ""), 10);
  return buildListPath(
    {
      sort: request.sort?.key || (query ? undefined : DEFAULT_SORT),
      query,
      genres: selectedIds(filters.genres),
      excludedGenres: excludedIds(filters.genres),
      status: filters.status || undefined,
      type: filters.type || undefined,
      minChapters: isNaN(minChapters) ? null : minChapters,
      mtlOnly: filters.mtl === true,
    },
    page
  );
}
