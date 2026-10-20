import { PagedItemList, SearchRequest } from "@suwatte/toolchain";

import { BROWSE_LIMIT, DEFAULT_CONTENT_TYPES, DEFAULT_SORT } from "./constants";
import { toItem } from "./parsers";
import { allowedContentRatings, Preferences } from "./settings";
import { ChikariSeriesListResponse } from "./types";
import {
  buildQueryString,
  excludedIds,
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
  minChapters?: number;
}

/**
 * Builds a `/api/series` path the way the website does: Adult Mode sends only
 * `adult=true`; otherwise it sends `adult=false` with a `content_rating` list,
 * and the hidden genres and tags apply everywhere.
 */
export function buildListPath(
  options: ListOptions,
  page: number,
  prefs: Preferences
): string {
  // The website ignores content preferences entirely while Adult Mode is on.
  const prefsActive = !prefs.showAdult;

  // The API defaults to the manga/manhwa/manhua trio when `type` is missing,
  // so the trio is what the site sends whenever nothing narrower is chosen.
  const userTypes = options.types ?? [];
  const types = userTypes.length > 0
    ? userTypes
    : prefsActive
      ? prefs.contentTypes
      : DEFAULT_CONTENT_TYPES;

  // Excluded genres and tags are merged, and anything the search explicitly
  // includes stops being excluded (site behavior).
  const includedGenres = options.genres ?? [];
  const includedTags = options.tags ?? [];
  const excludedGenres = mergeExcluded(
    prefsActive ? prefs.excludedGenres : [],
    options.excludedGenres ?? [],
    includedGenres
  );
  const excludedTags = mergeExcluded(
    prefsActive ? prefs.excludedTags : [],
    options.excludedTags ?? [],
    includedTags
  );

  const minChapters = options.minChapters ?? 0;
  const contentRatings = prefsActive ? allowedContentRatings(prefs.maxContentRating) : [];

  const query = buildQueryString({
    sort: options.sort,
    q: options.query?.trim() || undefined,
    adult: prefs.showAdult ? "true" : "false",
    type: types.length > 0 ? types : undefined,
    genre: options.genres,
    genre_exclude: excludedGenres,
    tag: options.tags,
    tag_exclude: excludedTags,
    status: options.statuses,
    // Minimum chapters is only a search filter on the website, never a setting.
    min_chapters: minChapters > 0 ? minChapters : undefined,
    content_rating: contentRatings.length > 0 ? contentRatings.join(",") : undefined,
    limit: BROWSE_LIMIT,
    offset: (page - 1) * BROWSE_LIMIT,
  });
  return `/api/series?${query}`;
}

function mergeExcluded(
  fromPrefs: string[],
  fromFilters: string[],
  included: string[]
): string[] {
  const excluded = new Set<string>();
  for (const id of [...fromPrefs, ...fromFilters]) {
    if (!included.includes(id)) {
      excluded.add(id);
    }
  }
  return [...excluded];
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
      minChapters: parseInteger(filters.min_chapters) ?? 0,
    },
    page,
    prefs
  );
}

export function parseListResponse(
  data: ChikariSeriesListResponse,
  page: number
): PagedItemList {
  const rawItems = data.items ?? [];
  const items = rawItems.map(toItem);
  const total = typeof data.total === "number" ? data.total : undefined;
  return {
    items,
    total,
    isLastPage:
      rawItems.length < BROWSE_LIMIT ||
      (total !== undefined && page * BROWSE_LIMIT >= total),
  };
}
