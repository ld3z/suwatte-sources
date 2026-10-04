import { Item, PagedItemList } from "@suwatte/toolchain";
import { load } from "cheerio/slim";

import { PAGE_SIZE } from "./constants";
import { ratingForTags, seriesUrl } from "./utils";

export interface LibraryEntry {
  /** `{seriesId}/{slug}` */
  id: string;
  title: string;
  author: string;
  year?: number;
  volumes: number;
  tags: string[];
  /** Site relevance score; higher is more popular. */
  popularity: number;
  cover: string;
  description: string;
}

export interface LibraryQuery {
  text: string;
  includeTags: string[];
  excludeTags: string[];
  minVolumes: number;
  sort: string;
  ascending: boolean;
}

/** Parses `/library`, which lists the entire catalog with its metadata in `data-*` attributes. */
export function parseLibrary(html: string): LibraryEntry[] {
  const $ = load(html);
  return $("#grid article.card[data-id]")
    .toArray()
    .flatMap((el) => {
      const $card = $(el);
      const href = $card.find("a.stretched-link").attr("href") ?? "";
      const id = href.match(/^\/series\/(\d+\/[^/?#]+)/)?.[1];
      if (!id) return [];

      const year = Number($card.attr("data-d"));
      return [
        {
          id,
          title: $card.attr("data-t") ?? "",
          author: $card.attr("data-a") ?? "",
          year: year > 0 ? year : undefined,
          volumes: Number($card.attr("data-v")) || 0,
          tags: ($card.attr("data-tags") ?? "")
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0),
          popularity: Number($card.attr("data-rel")) || 0,
          cover: $card.find(".card-cover img").attr("src") ?? "",
          description: $card.find(".popup-description").text().trim(),
        },
      ];
    });
}

export function allTags(entries: LibraryEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b));
}

export function queryLibrary(entries: LibraryEntry[], query: LibraryQuery): LibraryEntry[] {
  const terms = query.text.toLowerCase().split(/\s+/).filter((t) => t.length > 0);

  const matches = entries.filter((entry) => {
    const haystack = `${entry.title} ${entry.author}`.toLowerCase();
    return (
      terms.every((term) => haystack.includes(term)) &&
      query.includeTags.every((tag) => entry.tags.includes(tag)) &&
      !query.excludeTags.some((tag) => entry.tags.includes(tag)) &&
      entry.volumes >= query.minVolumes
    );
  });

  const compare = comparator(query.sort);
  const direction = query.ascending ? 1 : -1;
  return matches.sort((a, b) => direction * compare(a, b));
}

/** Compares in ascending order for the given sort key. */
function comparator(sort: string): (a: LibraryEntry, b: LibraryEntry) => number {
  switch (sort) {
    case "title":
      return (a, b) => a.title.localeCompare(b.title);
    case "year":
      return (a, b) => (a.year ?? 0) - (b.year ?? 0);
    case "volumes":
      return (a, b) => a.volumes - b.volumes;
    case "popular":
    default:
      return (a, b) => a.popularity - b.popularity;
  }
}

export function pageOf(entries: LibraryEntry[], page: number): PagedItemList {
  const start = (page - 1) * PAGE_SIZE;
  return {
    items: entries.slice(start, start + PAGE_SIZE).map(toItem),
    total: entries.length,
    isLastPage: start + PAGE_SIZE >= entries.length,
  };
}

export function toItem(entry: LibraryEntry): Item {
  const volumes = `${entry.volumes} ${entry.volumes === 1 ? "Volume" : "Volumes"}`;
  return {
    id: entry.id,
    title: entry.title,
    subtitle: entry.author ? `${entry.author} · ${volumes}` : volumes,
    coverImage: entry.cover,
    webUrl: seriesUrl(entry.id),
    rating: ratingForTags(entry.tags),
  };
}
