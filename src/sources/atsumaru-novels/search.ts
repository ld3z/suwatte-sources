import { PagedItemList, SearchRequest } from "@suwatte/toolchain";

import { BROWSE_LIMIT } from "./constants";
import { toItem } from "./parsers";
import { AtsumaruSearchResponse } from "./types";
import {
  backtickList,
  buildQueryString,
  parseInteger,
  selectedIds,
} from "./utils";

/** Extracts an id from a pasted atsu.moe URL or a `/novel/{id}` or `/manga/{id}` path. */
export function parseDeepLinkId(query: string): string | null {
  const match = query.match(
    /(?:https?:\/\/atsu\.moe)?\/(?:novel|manga)\/([a-zA-Z0-9_-]+)/
  );
  return match ? match[1] : null;
}

export function buildSearchPath(
  request: SearchRequest,
  page: number,
  showAdult: boolean
): string {
  const rawQuery = request.query?.trim() || "";
  const query = rawQuery.length > 0 ? rawQuery : "*";

  const params: Record<string, string | number> = {
    q: query,
    filter_by: buildFilterBy(request, showAdult).join(" && "),
    page: String(page),
    per_page: String(BROWSE_LIMIT),
  };

  if (request.sort) {
    const direction = request.sort.ascending ? "asc" : "desc";
    params["sort_by"] = `${request.sort.key}:${direction}`;
  }

  if (query !== "*") {
    params["query_by"] = "title,englishTitle,otherNames,authors";
    params["query_by_weights"] = "4,3,2,1";
    params["num_typos"] = "4,3,2,1";
  }

  return `/collections/manga/documents/search?${buildQueryString(params)}`;
}

function buildFilterBy(request: SearchRequest, showAdult: boolean): string[] {
  const filters = (request.filters ?? {}) as Record<string, any>;
  const filterBy: string[] = ["hidden:!=true", "medium:=[`Novel`]"];

  const includedGenres: string[] = filters.genres?.include ?? [];
  const excludedGenres: string[] = filters.genres?.exclude ?? [];
  if (includedGenres.length > 0) {
    filterBy.push(includedGenres.map((id) => `genreIds:=\`${id}\``).join(" && "));
  }
  if (excludedGenres.length > 0) {
    filterBy.push(`genreIds:!=[${backtickList(excludedGenres)}]`);
  }

  const types = selectedIds(filters.types);
  if (types.length > 0) {
    filterBy.push(`type:=[${backtickList(types)}]`);
  }

  const statuses = selectedIds(filters.status);
  if (statuses.length > 0) {
    filterBy.push(`status:=[${backtickList(statuses)}]`);
  }

  const year = parseInteger(filters.year);
  if (year !== null) {
    filterBy.push(`releaseYear:=[${year}]`);
  }

  const minChapters = parseInteger(filters.min_chapters);
  if (minChapters !== null) {
    filterBy.push(`chapterCount:>=${minChapters}`);
  }

  if (filters.official === true) {
    filterBy.push("officialTranslation:=true");
  }

  if (!showAdult) {
    filterBy.push("isAdult:=false");
  }

  filterBy.push(
    "(mbContentRating:=[`Safe`,`Suggestive`,`Erotica`] || mbContentRating:!=*)"
  );
  filterBy.push("views:>0");

  return filterBy;
}

export function parseSearchResponse(
  data: AtsumaruSearchResponse,
  page: number
): PagedItemList {
  if (data.hits && Array.isArray(data.hits)) {
    const items = data.hits.map((h) => toItem(h.document));
    const perPage = data.request_params?.per_page ?? BROWSE_LIMIT;
    const found = data.found ?? 0;
    return {
      items,
      total: found,
      isLastPage: page * perPage >= found || items.length < perPage,
    };
  }

  if (data.items && Array.isArray(data.items)) {
    const items = data.items.map(toItem);
    return {
      items,
      isLastPage: items.length < BROWSE_LIMIT,
    };
  }

  return { items: [], isLastPage: true };
}
