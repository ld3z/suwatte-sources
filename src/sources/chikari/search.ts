import { PagedItemList, SearchRequest } from "@suwatte/toolchain";

import { BROWSE_LIMIT, DEFAULT_SORT } from "./constants";
import { toItem } from "./parsers";
import { Preferences } from "./settings";
import { ChikariNovelListResponse } from "./types";
import { buildQueryString, excludedIds, parseInteger, selectedIds } from "./utils";

export interface ListOptions {
  sort: string;
  query?: string;
  genres?: string[];
  excludedGenres?: string[];
  tags?: string[];
  excludedTags?: string[];
  statuses?: string[];
  minChapters?: number | null;
}

/**
 * Builds a `/api/novels` path. `adult=true` returns only NSFW novels and
 * omitting it returns only SFW ones, which is what Adult Mode relies on.
 */
export function buildListPath(
  options: ListOptions,
  page: number,
  prefs: Preferences
): string {
  const excludedGenres = new Set([
    ...(options.excludedGenres ?? []),
    ...prefs.excludedGenres.filter((id) => !(options.genres ?? []).includes(id)),
  ]);

  const query = buildQueryString({
    sort: options.sort,
    q: options.query?.trim() || undefined,
    adult: prefs.showAdult ? "true" : undefined,
    genre: options.genres,
    genre_exclude: [...excludedGenres],
    tag: options.tags,
    tag_exclude: options.excludedTags,
    status: options.statuses,
    min_chapters: options.minChapters && options.minChapters > 0 ? options.minChapters : undefined,
    limit: BROWSE_LIMIT,
    offset: (page - 1) * BROWSE_LIMIT,
  });
  return `/api/novels?${query}`;
}

/** Search uses the same list endpoint so filters, sorting, and paging all apply. */
export function buildSearchPath(
  request: SearchRequest,
  page: number,
  prefs: Preferences
): string {
  const filters = (request.filters ?? {}) as Record<string, any>;
  return buildListPath(
    {
      sort: request.sort?.key || DEFAULT_SORT,
      query: request.query,
      genres: selectedIds(filters.genres),
      excludedGenres: excludedIds(filters.genres),
      tags: selectedIds(filters.tags),
      excludedTags: excludedIds(filters.tags),
      statuses: selectedIds(filters.status),
      minChapters: parseInteger(filters.min_chapters),
    },
    page,
    prefs
  );
}

export function parseListResponse(
  data: ChikariNovelListResponse,
  page: number
): PagedItemList {
  const items = (data.items ?? []).map(toItem);
  const total = typeof data.total === "number" ? data.total : undefined;
  return {
    items,
    total,
    isLastPage:
      items.length < BROWSE_LIMIT ||
      (total !== undefined && page * BROWSE_LIMIT >= total),
  };
}
