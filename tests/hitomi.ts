import emulate from "@suwatte/toolchain/emulator";
import { wrapDelegateWithValidation } from "@suwatte/toolchain/validate";
import { readSourceVariants } from "@suwatte/toolchain/runtime";
import Hitomi from "../src/sources/hitomi";
import { imageIdFromHash, parseImageServerRules } from "../src/sources/hitomi/images";
import { nozomiPath } from "../src/sources/hitomi/nozomi";
import { parseDeepLinkId as parseHitomiLink, parseQueryString } from "../src/sources/hitomi/search";
import { runWhenDirect } from "./support";

export async function testHitomi(): Promise<void> {
  console.log("\n==================================================");
  console.log("Testing Hitomi...");
  console.log("==================================================");

  console.log("\n1. Testing offline helpers...");
  const hitomiVariants = readSourceVariants(Hitomi as any);
  if (
    hitomiVariants.length < 40 ||
    hitomiVariants[0].id !== "all.ldez.hitomi" ||
    !hitomiVariants.some((v) => v.id === "ja.ldez.hitomi" && v.args?.language === "japanese")
  ) {
    throw new Error("Expected an all-languages variant plus one variant per site language");
  }
  const ggRules = parseImageServerRules(
    "'use strict';\ngg = { m: function(g) {\nvar o = 0;\nswitch (g) {\ncase 12:\ncase 34:\no = 1; break;\n}\nreturn o;\n},\nb: '1700000000/'\n};"
  );
  if (ggRules.basePath !== "1700000000/" || ggRules.offsets.get(34) !== 1 || ggRules.offsets.has(56)) {
    throw new Error("Expected gg.js image server rules to parse");
  }
  if (imageIdFromHash("41ebbbd94b1967687f1d3e0d4320b482091c65bc4e75974e3a2e413a5e5c9294") !== 1065) {
    throw new Error("Expected gg.s image ids from the hash tail");
  }
  const week = { language: "english", orderby: "popular" as const, orderbykey: "week" as const };
  const added = { language: "english", orderby: "date" as const, orderbykey: "added" as const };
  if (
    nozomiPath(added, undefined, true) !== "/index-english.nozomi" ||
    nozomiPath(week) !== "/n/popular/week-english.nozomi" ||
    nozomiPath(week, { ns: "female", value: "big breasts" }) !==
      "/n/tag/popular/week/female%3Abig%20breasts-english.nozomi" ||
    nozomiPath(added, { ns: "artist", value: "shindol" }, true) !== "/artist/shindol-english.nozomi"
  ) {
    throw new Error("Expected nozomi paths to match the site's layout");
  }
  const parsedQuery = parseQueryString("female:big_breasts -male:yaoi tutor artist:a or artist:b language:japanese");
  if (
    parsedQuery.positive.length !== 2 ||
    parsedQuery.negative[0]?.value !== "yaoi" ||
    parsedQuery.anyOf[0]?.length !== 2 ||
    parsedQuery.language !== "japanese"
  ) {
    throw new Error("Expected the site's search syntax to parse");
  }
  if (
    parseHitomiLink("https://hitomi.la/doujinshi/some-title-english-4316112.html") !== "4316112" ||
    parseHitomiLink("https://hitomi.la/reader/4316112.html#3") !== "4316112" ||
    parseHitomiLink("id:4316112") !== "4316112" ||
    parseHitomiLink("2023") !== null
  ) {
    throw new Error("Expected Hitomi gallery links to resolve");
  }

  console.log("\n2. Testing feeds & search (English variant)...");
  const hitomi = wrapDelegateWithValidation(emulate(Hitomi, { variantId: "en.ldez.hitomi" }), "Hitomi EN");
  await hitomi.onFormSubmitted("reset", { pref_hidden_tags: "", pref_hide_anime: true, pref_image_format: "webp" });
  const hitomiHome = await hitomi.getHomePage();
  for (const feed of hitomiHome.feeds) {
    const list = await hitomi.getItemList({ key: feed.id }, 1);
    console.log(` - ${feed.id}: ${list.items.length} items of ${list.total}`);
    if (list.items.length === 0 || !Number.isInteger(list.total) || (list.total ?? 0) < 1000) {
      throw new Error(`Expected a full page of galleries in Hitomi feed '${feed.id}'`);
    }
  }
  const titleSearch = await hitomi.getSearchResults({ query: "tutor" }, 1);
  console.log("Title search hits:", titleSearch.total, titleSearch.items.slice(0, 2).map((i) => i.title));
  if (titleSearch.items.length === 0) {
    throw new Error("Expected Hitomi title search results");
  }
  const tagSearch = await hitomi.getSearchResults(
    {
      query: "female:big_breasts -male:yaoi",
      filters: { type: { include: ["doujinshi"], exclude: [] }, artists: "shindol" },
    },
    1
  );
  console.log("Tag/filter search hits:", tagSearch.total);
  if (tagSearch.items.length === 0 || tagSearch.items.some((i) => !i.subtitle?.startsWith("Doujinshi"))) {
    throw new Error("Expected doujinshi-only Hitomi tag search results");
  }

  console.log("\n3. Testing content, tag links & pages...");
  const galleryId = titleSearch.items[0].id;
  const gallery = await hitomi.getContent(galleryId);
  console.log("Content:", { title: gallery.title, details: gallery.additionalDetails, credits: gallery.credits });
  const tagKey = (gallery.genres?.[0]?.destination as any)?.list?.props?.key;
  if (!tagKey?.startsWith("q:")) {
    throw new Error("Expected Hitomi tags to link to their listing");
  }
  const tagList = await hitomi.getItemList({ key: tagKey }, 1);
  if (tagList.items.length === 0) {
    throw new Error(`Expected galleries for tag link '${tagKey}'`);
  }
  const hitomiChapters = await hitomi.getChapters(galleryId);
  const hitomiPages = await hitomi.getChapterPages(galleryId, hitomiChapters[0].id);
  console.log("Pages:", hitomiPages.length, "| first:", hitomiPages[0]?.url);
  const firstPage = await fetch(hitomiPages[0].url!, { headers: { Referer: "https://hitomi.la/" } });
  if (hitomiChapters.length !== 1 || !firstPage.ok || !firstPage.headers.get("content-type")?.startsWith("image/")) {
    throw new Error("Expected one chapter whose first page loads from the image CDN");
  }

  console.log("\n4. Testing the all-languages variant...");
  const hitomiAll = wrapDelegateWithValidation(emulate(Hitomi), "Hitomi All");
  const allFilters = await hitomiAll.getSearchFilters();
  const japaneseOnly = await hitomiAll.getSearchResults({ filters: { language: "japanese" } }, 1);
  console.log("Japanese-filtered subtitles:", japaneseOnly.items.slice(0, 2).map((i) => i.subtitle));
  if (
    !allFilters.some((f) => f.id === "language") ||
    japaneseOnly.items.some((i) => !i.subtitle?.endsWith("Japanese"))
  ) {
    throw new Error("Expected the language filter to scope the all-languages variant");
  }
}

runWhenDirect(import.meta.url, testHitomi);
