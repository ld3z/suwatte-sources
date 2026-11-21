import emulate from "@suwatte/toolchain/emulator";
import { ContentRating, ContentType, ReadingMode } from "@suwatte/toolchain";
import Chikari from "../src/sources/chikari";
import { buildListPath } from "../src/sources/chikari/search";
import { Preferences as ChikariPreferences } from "../src/sources/chikari/settings";
import { wrapDelegateWithValidation } from "@suwatte/toolchain/validate";
import { runWhenDirect } from "./support";

export async function testChikariComics(): Promise<void> {
  console.log("\n==================================================");
  console.log("Testing Chikari (Comics)...");
  console.log("==================================================");

  console.log("\n0. Testing preference query building...");
  const chikariPrefs: ChikariPreferences = {
    showAdult: false,
    maxContentRating: "suggestive",
    contentTypes: ["manga"],
    excludedGenres: ["romance"],
    excludedTags: ["12", "34"],
  };
  const chikariBrowse = buildListPath({ sort: "popular" }, 1, chikariPrefs);
  if (
    !chikariBrowse.includes("content_rating=safe%2Csuggestive") ||
    !chikariBrowse.includes("type=manga") ||
    !chikariBrowse.includes("genre_exclude=romance") ||
    !chikariBrowse.includes("tag_exclude=12") ||
    !chikariBrowse.includes("adult=false")
  ) {
    throw new Error("Expected Chikari browse to send the website's content prefs");
  }
  const chikariSearchPath = buildListPath(
    {
      sort: "popular",
      genres: ["action"],
      minChapters: 10,
      tags: ["56"],
    },
    1,
    chikariPrefs
  );
  if (!chikariSearchPath.includes("genre_exclude=romance")) {
    throw new Error("Expected Chikari search to apply excluded genres like the website");
  }
  if (!chikariSearchPath.includes("min_chapters=10")) {
    throw new Error("Expected Chikari search to pass the minimum chapters filter");
  }
  if (chikariSearchPath.includes("tag_exclude=56")) {
    throw new Error("Expected tags included by the search filter to stay out of tag exclusions");
  }
  const chikariAdultPath = buildListPath({ sort: "popular" }, 1, {
    ...chikariPrefs,
    showAdult: true,
  });
  if (
    !chikariAdultPath.includes("adult=true") ||
    chikariAdultPath.includes("content_rating") ||
    chikariAdultPath.includes("genre_exclude") ||
    chikariAdultPath.includes("tag_exclude") ||
    !chikariAdultPath.includes("type=manhwa")
  ) {
    throw new Error("Expected Adult Mode to request adult content without content prefs");
  }

  const chikariComics = wrapDelegateWithValidation(emulate(Chikari), "Chikari");
  await chikariComics.onFormSubmitted("reset", {
    pref_18_mode: false,
    pref_content_types: { include: ["manga", "manhwa", "manhua"], exclude: [] },
    pref_max_content_rating: "suggestive",
    pref_exclude_genres: { include: [], exclude: [] },
    pref_excluded_tags: { include: [], exclude: [] },
  });
  const chikariSettings = await chikariComics.getSettingsPage();
  if (chikariSettings.sections.length !== 2) {
    throw new Error("Expected Chikari settings to have content and advanced sections");
  }
  console.log("Settings controls:", chikariSettings.sections[0].views.map((v) => v.id).filter(Boolean));

  console.log("\n1. Testing getHomePage & getItemList...");
  const comicsHome = await chikariComics.getHomePage();
  for (const feed of comicsHome.feeds) {
    const list = await chikariComics.getItemList({ key: feed.id }, 1);
    console.log(` - ${feed.id}: ${list.items.length} items`);
    if (list.items.length === 0) {
      throw new Error(`Expected items in Chikari comics feed '${feed.id}'`);
    }
  }

  console.log("\n2. Testing getSearchResults (keyword, filters & deep link)...");
  const comicsSearch = await chikariComics.getSearchResults({ query: "stellar swordmaster" }, 1);
  console.log("Keyword hits:", comicsSearch.items.map((i) => i.title).slice(0, 3));
  if (!comicsSearch.items.some((i) => i.id === "the-stellar-swordmaster")) {
    throw new Error("Expected 'the-stellar-swordmaster' in Chikari comics keyword results");
  }
  const mangaOnly = await chikariComics.getSearchResults(
    { filters: { types: { include: ["manga"] }, genres: { include: ["action"], exclude: ["romance"] } } },
    1
  );
  console.log("Manga-only hits:", mangaOnly.items.length, "subtitles:", mangaOnly.items.slice(0, 2).map((i) => i.subtitle));
  if (mangaOnly.items.length === 0 || mangaOnly.items.some((i) => !i.subtitle?.startsWith("Manga"))) {
    throw new Error("Expected only manga in the type-filtered Chikari results");
  }
  const comicsDeepLink = await chikariComics.getSearchResults(
    { query: "https://chikari.moe/series/the-bastard-of-swordborne/12" },
    1
  );
  if (comicsDeepLink.items[0]?.id !== "the-bastard-of-swordborne") {
    throw new Error("Expected Chikari deep link to resolve to The Bastard of Swordborne");
  }
  const comicsFilters = await chikariComics.getSearchFilters();
  console.log("Filters:", comicsFilters.map((f) => f.id));

  console.log("\n3. Testing Adult Mode shows only 18+ titles...");
  await chikariComics.onFormSubmitted("test", { pref_18_mode: true });
  const comicsAdult = await chikariComics.getItemList({ key: "popular" }, 1);
  await chikariComics.onFormSubmitted("test", { pref_18_mode: false });
  if (comicsAdult.items.length === 0 || comicsAdult.items.some((i) => i.rating !== ContentRating.MATURE)) {
    throw new Error("Expected only mature comics in Adult Mode");
  }

  console.log("\n4. Testing getContent ('the-bastard-of-swordborne')...");
  const bastard = await chikariComics.getContent("the-bastard-of-swordborne");
  console.log("Content:", {
    title: bastard.title,
    contentType: bastard.contentType,
    readingMode: bastard.readingMode,
    credits: bastard.credits,
    endpoints: bastard.endpoints,
  });
  if (bastard.contentType !== ContentType.MANHWA || bastard.readingMode !== ReadingMode.VERTICAL) {
    throw new Error("Expected a vertical MANHWA");
  }

  console.log("\n5. Testing getChapters & getChapterPages...");
  const bastardChapters = await chikariComics.getChapters("the-bastard-of-swordborne");
  console.log("Chapters:", bastardChapters.length, "| latest:", bastardChapters[0]?.id, "| oldest:", bastardChapters.at(-1)?.id);
  if (bastardChapters.at(-1)?.number !== 1 || !bastardChapters.some((c) => c.number === 100.5)) {
    throw new Error("Expected chapter 1 as the oldest chapter and chapter 100.5 to be kept");
  }
  const bastardPages = await chikariComics.getChapterPages("the-bastard-of-swordborne", "1");
  console.log("Pages:", bastardPages.length, "| first:", bastardPages[0]?.url);
  if (bastardPages.length === 0) {
    throw new Error("Expected pages for chapter 1");
  }

  console.log("\n6. Testing scan groups ('the-stellar-swordmaster')...");
  const stellarChapters = await chikariComics.getChapters("the-stellar-swordmaster");
  const groups = [...new Set(stellarChapters.map((c) => c.providers?.[0]?.name))];
  console.log("Chapters:", stellarChapters.length, "| groups:", groups);
  const flame = stellarChapters.find((c) => c.id.endsWith("/flamecomics"));
  const asura = stellarChapters.find((c) => c.number === flame?.number && c.id.endsWith("/asura"));
  if (!flame || !asura) {
    throw new Error("Expected one chapter per scan group");
  }
  const [flamePages, asuraPages] = await Promise.all([
    chikariComics.getChapterPages("the-stellar-swordmaster", flame.id),
    chikariComics.getChapterPages("the-stellar-swordmaster", asura.id),
  ]);
  console.log("Flame first page:", flamePages[0]?.url, "| Asura first page:", asuraPages[0]?.url);
  if (!flamePages[0]?.url?.includes("/flamecomics/") || !asuraPages[0]?.url?.includes("/asura/")) {
    throw new Error("Expected pages from the requested scan group");
  }
}

runWhenDirect(import.meta.url, testChikariComics);
