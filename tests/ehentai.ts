import emulate from "@suwatte/toolchain/emulator";
import { wrapDelegateWithValidation } from "@suwatte/toolchain/validate";
import { readSourceVariants } from "@suwatte/toolchain/runtime";
import EHentai from "../src/sources/ehentai";
import { parseStarSprite } from "../src/sources/ehentai/parsers";
import { buildSearchOptions as buildEHSearchOptions, computeCategoryMask, parseDeepLink as parseEHDeepLink } from "../src/sources/ehentai/search";
import { runWhenDirect } from "./support";

export async function testEHentai(): Promise<void> {
  console.log("\n==================================================");
  console.log("Testing E-Hentai...");
  console.log("==================================================");

  console.log("\n1. Testing offline helpers...");
  const ehVariants = readSourceVariants(EHentai as any);
  if (
    ehVariants.length < 40 ||
    ehVariants[0].id !== "all.ldez.ehentai" ||
    !ehVariants.some((v) => v.id === "en.ldez.ehentai" && v.args?.language === "english") ||
    !ehVariants.some((v) => v.id === "ja.ldez.ehentai" && v.args?.language === "japanese")
  ) {
    throw new Error("Expected an all-languages variant plus one variant per E-Hentai language");
  }
  if (
    parseStarSprite("background-position:0px -1px;opacity:1") !== 5 ||
    parseStarSprite("background-position:-16px -1px;opacity:1") !== 4 ||
    parseStarSprite("background-position:-32px -21px;opacity:1") !== 2.5
  ) {
    throw new Error("Expected E-Hentai star sprite offsets to decode to 0..5 stars");
  }
  if (
    computeCategoryMask({ include: ["doujinshi"] }, []) !== 1021 ||
    computeCategoryMask({ include: ["doujinshi", "manga"] }, []) !== 1017 ||
    computeCategoryMask(undefined, ["misc", "asianporn"]) !== 129
  ) {
    throw new Error("Expected E-Hentai category bitmask calculation to match f_cats");
  }
  if (
    parseEHDeepLink("https://e-hentai.org/g/4319954/e3409766d6/?p=1")?.kind !== "gallery" ||
    parseEHDeepLink("https://exhentai.org/s/ccf50100a6/4319961-1")?.kind !== "reader"
  ) {
    throw new Error("Expected E-Hentai gallery and reader deep links to parse");
  }
  const ehBuilt = buildEHSearchOptions(
    {
      query: 'female:big_breasts -male:yaoi "exact phrase"',
      filters: {
        category: { include: ["doujinshi"], exclude: [] },
        artists: "shindol, crimson",
        min_rating: "4",
        pages: "20-100",
      },
    },
    "english",
    {
      hiddenTags: ["male:yaoi", "other:ai generated"],
      excludedCategories: [],
      titleDisplay: "default",
    }
  );
  if (
    ehBuilt.params.f_cats !== 1021 ||
    ehBuilt.params.advsearch !== 1 ||
    ehBuilt.params.f_srdd !== 4 ||
    ehBuilt.params.f_spf !== 20 ||
    ehBuilt.params.f_spt !== 100 ||
    !String(ehBuilt.params.f_search).includes('female:"big breasts$"') ||
    !String(ehBuilt.params.f_search).includes('~artist:"shindol$" ~artist:"crimson$"') ||
    !String(ehBuilt.params.f_search).includes('language:"english$"') ||
    !String(ehBuilt.params.f_search).includes('-other:"ai generated$"')
  ) {
    throw new Error(`Unexpected E-Hentai search options: ${JSON.stringify(ehBuilt)}`);
  }

  console.log("\n2. Testing feeds, cursor pagination & search (English variant)...");
  const ehentai = wrapDelegateWithValidation(
    emulate(EHentai, { variantId: "en.ldez.ehentai" }),
    "E-Hentai EN"
  );
  await ehentai.onFormSubmitted("reset", {
    pref_hidden_tags: "",
    pref_excluded_categories: { include: [], exclude: [] },
    pref_title_display: "default",
  });
  const ehHome = await ehentai.getHomePage();
  for (const feed of ehHome.feeds) {
    const list = await ehentai.getItemList({ key: feed.id }, 1);
    console.log(` - ${feed.id}: ${list.items.length} items of ${list.total}`);
    if (list.items.length === 0) {
      throw new Error(`Expected galleries in E-Hentai EN feed '${feed.id}'`);
    }
  }
  const ehPage1 = await ehentai.getItemList({ key: "latest" }, 1);
  const ehPage2 = await ehentai.getItemList({ key: "latest" }, 2);
  if (ehPage1.items[0]?.id === ehPage2.items[0]?.id) {
    throw new Error("Expected E-Hentai cursor pagination page 2 to differ from page 1");
  }

  const ehTagSearch = await ehentai.getSearchResults(
    {
      query: 'female:"big breasts$" -male:"yaoi$"',
      filters: {
        category: { include: ["doujinshi"], exclude: [] },
        min_rating: "4",
        pages: ">=15",
      },
    },
    1
  );
  console.log("Tag/filter search hits:", ehTagSearch.total, ehTagSearch.items[0]?.title);
  if (
    ehTagSearch.items.length === 0 ||
    ehTagSearch.items.some((i) => !i.subtitle?.startsWith("Doujinshi"))
  ) {
    throw new Error("Expected doujinshi-only E-Hentai search results");
  }

  console.log("\n3. Testing content, tag links & lazy H@H image interceptor...");
  const ehGalleryId = ehTagSearch.items[0].id;
  const ehGallery = await ehentai.getContent(ehGalleryId);
  console.log("Content:", {
    title: ehGallery.title,
    details: ehGallery.additionalDetails,
    credits: ehGallery.credits?.slice(0, 2),
    stats: ehGallery.statistics,
  });
  const ehTagKey = (ehGallery.genres?.[0]?.destination as any)?.list?.props?.key;
  if (!ehTagKey?.startsWith("q:")) {
    throw new Error("Expected E-Hentai tags to link to their listing");
  }
  const ehTagList = await ehentai.getItemList({ key: ehTagKey }, 1);
  if (ehTagList.items.length === 0) {
    throw new Error(`Expected galleries for E-Hentai tag link '${ehTagKey}'`);
  }
  const ehChapters = await ehentai.getChapters(ehGalleryId);
  const ehPages = await ehentai.getChapterPages(ehGalleryId, ehChapters[0].id);
  console.log("Pages:", ehPages.length, "| viewer url:", ehPages[0]?.url);
  const ehImageRes = await (ehentai as any).client.get(ehPages[0].url!);
  console.log(
    "Resolved H@H image:",
    ehImageRes.status,
    ehImageRes.headers.get("content-type"),
    "bytes:",
    (await ehImageRes.bytes()).length
  );
  if (
    ehChapters.length !== 1 ||
    !ehImageRes.ok ||
    !ehImageRes.headers.get("content-type")?.startsWith("image/")
  ) {
    throw new Error("Expected E-Hentai viewer page URL to resolve to a valid H@H image through Source.client");
  }

  const ehDeepReader = await ehentai.getSearchResults({ query: ehPages[0].url! }, 1);
  if (ehDeepReader.items[0]?.id !== ehGalleryId) {
    throw new Error("Expected E-Hentai reader URL deep link to resolve back to its gallery");
  }

  console.log("\n4. Testing All variant (Popular, Toplists & gdata fallback)...");
  const ehentaiAll = wrapDelegateWithValidation(emulate(EHentai), "E-Hentai All");
  const ehPopular = await ehentaiAll.getItemList({ key: "popular" }, 1);
  const ehTopDay = await ehentaiAll.getItemList({ key: "top_day" }, 1);
  const ehRestricted = await ehentaiAll.getContent("596447/3894f02c20");
  console.log(
    "Popular:",
    ehPopular.items.length,
    "| Top Yesterday:",
    ehTopDay.items.length,
    "| gdata fallback title:",
    ehRestricted.title
  );
  if (
    ehPopular.items.length === 0 ||
    ehTopDay.items.length === 0 ||
    ehTopDay.items.slice(5, 10).some((i) => !i.coverImage) ||
    !ehRestricted.title.includes("Shapeshifter")
  ) {
    throw new Error("Expected Popular, Toplist (with lazy data-src covers), and gdata fallback to succeed");
  }
}

runWhenDirect(import.meta.url, testEHentai);
