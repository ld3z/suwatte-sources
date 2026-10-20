import { PagedItemList, SearchRequest } from "@suwatte/toolchain";

import { BROWSE_LIMIT, DEFAULT_CONTENT_TYPES, DEFAULT_SORT } from "./constants";
import { toItem } from "./parsers";
import { excludedRatingGenres, Preferences } from "./settings";
import { ChikariSeriesListResponse } from "./types";
import {
  buildQueryString,
  excludedIds,
  matchesHiddenKeyword,
  parseInteger,
  selectedIds,
} from "./utils";

export interface ListOptions {
  sort: string;
  query?: string;
  types?: string[];
  genres?: string[];
  excludedGenres?: string[];
  tags?: string[];
  excludedTags?: string[];
  statuses?: string[];
  minChapters?: number | null;
  /** When true, browse defaults apply: excluded genres and default content types. */
  browse?: boolean;
}

/**
 * Builds a `/api/series` path. `adult=true` returns only NSFW series and
 * omitting it returns only SFW ones, which is what Adult Mode relies on.
 */
export function buildListPath(
  options: ListOptions,
  page: number,
  prefs: Preferences
): string {
  const includedGenres = options.genres ?? [];
  const excludedGenres = new Set(options.excludedGenres ?? []);
  if (options.browse || prefs.excludeGenresInSearch) {
    prefs.excludedGenres
      .filter((id) => !includedGenres.includes(id))
      .forEach((id) => excludedGenres.add(id));
  }
  excludedRatingGenres(prefs.maxContentRating)
    .filter((id) => !includedGenres.includes(id))
    .forEach((id) => excludedGenres.add(id));

  const requestedTypes = options.types ?? [];
  const types = requestedTypes.length
    ? requestedTypes
    : options.browse
      ? (prefs.contentTypes ?? DEFAULT_CONTENT_TYPES)
      : prefs.contentTypes;
  const minChapters = options.minChapters ?? prefs.minChapters;

  const query = buildQueryString({
    sort: options.sort,
    q: options.query?.trim() || undefined,
    adult: prefs.showAdult ? "true" : undefined,
    type: types && types.length > 0 ? types : undefined,
    genre: options.genres,
    genre_exclude: [...excludedGenres],
    tag: options.tags,
    tag_exclude: options.excludedTags,
    status: options.statuses,
    min_chapters: minChapters > 0 ? minChapters : undefined,
    limit: BROWSE_LIMIT,
    offset: (page - 1) * BROWSE_LIMIT,
  });
  return `/api/series?${query}`;
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
      types: selectedIds(filters.types),
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
  data: ChikariSeriesListResponse,
  page: number,
  hiddenKeywords: string[] = []
): PagedItemList {
  const rawItems = data.items ?? [];
  const items = rawItems
    .filter((item) => !matchesHiddenKeyword(item, hiddenKeywords))
    .map(toItem);
  const total = typeof data.total === "number" ? data.total : undefined;
  return {
    items,
    total,
    isLastPage:
      rawItems.length < BROWSE_LIMIT ||
      (total !== undefined && page * BROWSE_LIMIT >= total),
  };
}
