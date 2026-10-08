import { PagedItemList, SearchRequest } from "@suwatte/toolchain";

import { DEFAULT_SORT, SEARCH_LIMIT } from "./constants";
import { dbItem } from "./parsers";
import { DbSearchResponse } from "./types";
import { buildQueryString, excludedIds, parseCount, selectedIds } from "./utils";

/**
 * Builds a `/api/novels/db/search` path. Keyword search only covers Lunar's
 * own database, not the larger mirrored catalog shown on the home page.
 */
export function buildSearchPath(request: SearchRequest, page: number): string {
  const filters = (request.filters ?? {}) as Record<string, any>;
  const join = (ids: string[]) => (ids.length > 0 ? ids.join(",") : undefined);

  const query = buildQueryString({
    query: request.query?.trim() || undefined,
    genres: join(selectedIds(filters.genres)),
    exclude_genres: join(excludedIds(filters.genres)),
    status: filters.status || undefined,
    content: join(selectedIds(filters.content)),
    sort: request.sort?.key || DEFAULT_SORT,
    page,
    limit: SEARCH_LIMIT,
  });
  return `/api/novels/db/search?${query}`;
}

export function parseSearchResponse(data: DbSearchResponse, page: number): PagedItemList {
  const items = (data.novels ?? []).map(dbItem);
  return {
    items,
    total: parseCount(data.total),
    isLastPage:
      items.length < SEARCH_LIMIT ||
      (typeof data.total_pages === "number" && page >= data.total_pages),
  };
}
