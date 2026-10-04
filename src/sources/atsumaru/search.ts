import { PagedItemList, SearchRequest } from "@suwatte/toolchain";

import { BROWSE_LIMIT } from "./constants";
import { toItem } from "./parsers";
import { allowedContentRatings, Preferences } from "./settings";
import { AtsumaruSearchResponse } from "./types";
import {
  backtickList,
  buildQueryString,
  matchesHiddenKeyword,
  parseInteger,
  selectedIds,
} from "./utils";

/** Extracts a manga id from a pasted atsu.moe URL or `/manga/{id}` path. */
export function parseDeepLinkId(query: string): string | null {
  const match = query.match(/(?:https?:\/\/atsu\.moe)?\/manga\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/** Builds the Typesense search path. Filters chosen in the search override preferences. */
export function buildSearchPath(
  request: SearchRequest,
  page: number,
  prefs: Preferences
): string {
  const rawQuery = request.query?.trim() || "";
  const query = rawQuery.length > 0 ? rawQuery : "*";

  const params: Record<string, string | number> = {
    q: query,
    filter_by: buildFilterBy(request, prefs).join(" && "),
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

function buildFilterBy(request: SearchRequest, prefs: Preferences): string[] {
  const filters = (request.filters ?? {}) as Record<string, any>;
  const filterBy: string[] = ["hidden:!=true"];

  // Genres: explicitly included genres win over excluded ones from settings.
  const includedGenres: string[] = filters.genres?.include ?? [];
  const excludedGenres = new Set<string>(filters.genres?.exclude ?? []);
  if (prefs.excludeGenresInSearch) {
    prefs.excludedGenres
      .filter((id) => !includedGenres.includes(id))
      .forEach((id) => excludedGenres.add(id));
  }
  if (includedGenres.length > 0) {
    filterBy.push(includedGenres.map((id) => `genreIds:=\`${id}\``).join(" && "));
  }
  if (excludedGenres.size > 0) {
    filterBy.push(`genreIds:!=[${backtickList(excludedGenres)}]`);
  }

  const requestedTypes = selectedIds(filters.types);
  const types = requestedTypes.length > 0 ? requestedTypes : prefs.contentTypes;
  if (types && types.length > 0) {
    filterBy.push(`type:=[${backtickList(types)}]`);
  }

  const minChapters = parseInteger(filters.min_chapters) ?? prefs.minChapters;
  if (minChapters > 0) {
    filterBy.push(`chapterCount:>=${minChapters}`);
  }

  if (filters.official === true || prefs.officialOnly) {
    filterBy.push("officialTranslation:=true");
  }

  const statuses = selectedIds(filters.status);
  if (statuses.length > 0) {
    filterBy.push(`status:=[${backtickList(statuses)}]`);
  }

  const year = parseInteger(filters.year);
  if (year !== null) {
    filterBy.push(`releaseYear:=[${year}]`);
  }

  if (!prefs.showAdult) {
    filterBy.push("isAdult:=false");
  }

  const ratings = backtickList(allowedContentRatings(prefs.maxContentRating));
  filterBy.push(`(mbContentRating:=[${ratings}] || mbContentRating:!=*)`);
  filterBy.push("medium:!=[`Novel`]");
  filterBy.push("views:>0");

  return filterBy;
}

export function parseSearchResponse(
  data: AtsumaruSearchResponse,
  page: number,
  hiddenKeywords: string[]
): PagedItemList {
  const isVisible = (item: Parameters<typeof toItem>[0]) =>
    !matchesHiddenKeyword(item, hiddenKeywords);

  if (data.hits && Array.isArray(data.hits)) {
    const documents = data.hits.map((h) => h.document);
    const perPage = data.request_params?.per_page ?? BROWSE_LIMIT;
    const found = data.found ?? 0;
    return {
      items: documents.filter(isVisible).map(toItem),
      total: found,
      isLastPage: page * perPage >= found || documents.length < perPage,
    };
  }

  if (data.items && Array.isArray(data.items)) {
    return {
      items: data.items.filter(isVisible).map(toItem),
      isLastPage: data.items.length < BROWSE_LIMIT,
    };
  }

  return { items: [], isLastPage: true };
}
