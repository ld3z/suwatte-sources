import emulate from "@suwatte/toolchain/emulator";
import { wrapDelegateWithValidation } from "@suwatte/toolchain/validate";
import { readSourceVariants } from "@suwatte/toolchain/runtime";
import Nhentai from "../src/sources/nhentai";
import { imageUrl as nhentaiImageUrl, thumbnailUrl as nhentaiThumbUrl } from "../src/sources/nhentai/images";
import { cleanPrettyTitle } from "../src/sources/nhentai/parsers";
import { buildEffectiveQuery, parseDeepLinkId as parseNhentaiLink, parseQueryString as parseNhentaiQuery, parseSearchRequest as parseNhentaiSearchRequest } from "../src/sources/nhentai/search";
import { runWhenDirect } from "./support";

export async function testNhentai(): Promise<void> {
  console.log("\n==================================================");
  console.log("Testing nhentai...");
  console.log("==================================================");

  console.log("\n1. Testing offline helpers...");
  const nhentaiVariants = readSourceVariants(Nhentai as any);
  if (
    nhentaiVariants.length !== 4 ||
    nhentaiVariants[0].id !== "all.ldez.nhentai" ||
    !nhentaiVariants.some((v) => v.id === "en.ldez.nhentai" && v.args?.language === "english") ||
    !nhentaiVariants.some((v) => v.id === "ja.ldez.nhentai" && v.args?.language === "japanese") ||
    !nhentaiVariants.some((v) => v.id === "zh.ldez.nhentai" && v.args?.language === "chinese")
  ) {
    throw new Error("Expected an all-languages variant plus English, Japanese, and Chinese variants");
  }
  if (
    cleanPrettyTitle("(C71) [Arisan-Antenna (Koari)] Eat The Rich! (Sukatto Golf Pangya)") !==
    "Eat The Rich!"
  ) {
    throw new Error("Expected cleanPrettyTitle to strip event, circle, and parody brackets");
  }
  if (
    nhentaiImageUrl("galleries/4314582/1.webp", "4314582") !==
      "https://i3.nhentai.net/galleries/4314582/1.webp" ||
    nhentaiThumbUrl("galleries/4314582/thumb.webp", "4314582") !==
      "https://t3.nhentai.net/galleries/4314582/thumb.webp"
  ) {
    throw new Error("Expected deterministic CDN host sharding for nhentai media URLs");
  }
  if (
    parseNhentaiLink("https://nhentai.net/g/694850/3/") !== "694850" ||
    parseNhentaiLink("#177013") !== "177013" ||
    parseNhentaiLink("id:4299") !== "4299" ||
    parseNhentaiLink("g/1") !== "1" ||
    parseNhentaiLink("694850", true) !== "694850" ||
    parseNhentaiLink("694850", false) !== null
  ) {
    throw new Error("Expected nhentai URLs and gallery codes to resolve");
  }
  const nhQuery = buildEffectiveQuery(
    parseNhentaiSearchRequest({
      query: 'female:big_breasts -male:yaoi "exact phrase"',
      filters: {
        category: { include: ["doujinshi", "manga"], exclude: [] },
        artists: "shindol",
        pages: "20-100",
        uploaded: "<30d",
      },
    }),
    "english",
    ["yaoi", "guro"]
  );
  if (
    nhQuery.kind !== "search" ||
    !nhQuery.query.includes('"exact phrase"') ||
    !nhQuery.query.includes("pages:>=20 pages:<=100") ||
    !nhQuery.query.includes("uploaded:<30d") ||
    !nhQuery.query.includes('tag:"big breasts"') ||
    !nhQuery.query.includes("artist:shindol") ||
    !nhQuery.query.includes("language:english") ||
    !nhQuery.query.includes("-category:misc") ||
    !nhQuery.query.includes("-tag:yaoi") ||
    !nhQuery.query.includes("-tag:guro")
  ) {
    throw new Error(`Unexpected nhentai search query: ${JSON.stringify(nhQuery)}`);
  }
  // Regression: nhentai's search parser reads a bare hyphen in a tag value as
  // another operator, so `non-h` must be quoted or nearly every gallery is
  // hidden (e.g. `-tag:non-h` -> 120k results vs 662k for `-tag:"non-h"`).
  const hyphenHidden = buildEffectiveQuery(parseNhentaiQuery(""), "all", [
    "non-h",
    "category:western-non-h",
  ]);
  if (
    hyphenHidden.kind !== "search" ||
    !hyphenHidden.query.includes('-tag:"non-h"') ||
    !hyphenHidden.query.includes('-category:"western-non-h"')
  ) {
    throw new Error(
      `Expected hyphenated hidden tags to be quoted in the nhentai query, got ${JSON.stringify(hyphenHidden)}`
    );
  }
  const hyphenSearch = buildEffectiveQuery(parseNhentaiQuery("tag:non-h"), "all", []);
  if (hyphenSearch.kind !== "singleTag" || hyphenSearch.query !== 'tag:"non-h"') {
    throw new Error(
      `Expected hyphenated tag searches to be quoted, got ${JSON.stringify(hyphenSearch)}`
    );
  }
  // Regression: a hidden tag must stay hidden even when it is searched for.
  const hiddenSelfSearch = buildEffectiveQuery(
    parseNhentaiSearchRequest({ filters: { tags: "non-h" } }),
    "english",
    ["non-h"]
  );
  if (
    hiddenSelfSearch.kind !== "search" ||
    !hiddenSelfSearch.query.includes('tag:"non-h"') ||
    !hiddenSelfSearch.query.includes('-tag:"non-h"')
  ) {
    throw new Error(
      `Expected hidden tags to apply to searches for the same tag, got ${JSON.stringify(hiddenSelfSearch)}`
    );
  }
  const singleLangQuery = buildEffectiveQuery(parseNhentaiQuery(""), "english", []);
  if (singleLangQuery.kind !== "singleTag" || singleLangQuery.term.value !== "english") {
    throw new Error("Expected single-language browse without hidden tags to optimize as singleTag");
  }

  console.log("\n2. Testing feeds, search & code lookup (English variant)...");
  const nhentai = wrapDelegateWithValidation(
    emulate(Nhentai, { variantId: "en.ldez.nhentai" }),
    "nhentai EN"
  );
  await nhentai.onFormSubmitted("reset", {
    pref_hidden_tags: { include: [], exclude: [] },
    pref_custom_hidden_tags: "",
    pref_title_display: "english",
  });
  const nhentaiSettings = await nhentai.getSettingsPage();
  if (
    nhentaiSettings?.sections.length !== 2 ||
    nhentaiSettings.sections[0].header !== "Content" ||
    nhentaiSettings.sections[1].header !== "Account (Optional)" ||
    !(nhentaiSettings.sections[0].views[0] as any).select?.props?.options?.length ||
    !(nhentaiSettings.sections[1].views[0] as any).textfield?.props?.isSecure
  ) {
    throw new Error("Expected Content and Account sections in nhentai settings");
  }
  const hiddenOptions = (nhentaiSettings.sections[0].views[0] as any).select.props.options;
  if (!hiddenOptions.some((o: any) => o.id === "yaoi" && o.title === "Yaoi")) {
    throw new Error("Expected nhentai Hidden Tags to be a selectable list");
  }

  console.log("2c. Testing selectable Hidden Tags persistence...");
  await nhentai.onFormSubmitted("hidden", {
    pref_hidden_tags: { include: ["yaoi", "guro"], exclude: [] },
    pref_custom_hidden_tags: "artist:crimson",
  });
  const hiddenSettings = await nhentai.getSettingsPage();
  const hiddenView = (hiddenSettings.sections[0].views[0] as any).select.props;
  const customView = (hiddenSettings.sections[0].views[1] as any).textfield.props;
  if (
    hiddenView.currentValue.include.length !== 3 ||
    !hiddenView.currentValue.include.includes("artist:crimson") ||
    customView.currentValue !== "artist:crimson"
  ) {
    throw new Error("Expected nhentai hidden tag selections to persist");
  }
  await nhentai.onFormSubmitted("reset", {
    pref_hidden_tags: { include: [], exclude: [] },
    pref_custom_hidden_tags: "",
    pref_title_display: "english",
  });

  console.log("2b. Testing nhentai API key settings & Favorites feed gating...");
  await nhentai.onFormSubmitted("account", {
    pref_api_key: "Key test-api-key",
    pref_use_account_blacklist: true,
  });
  const keyedSettings = await nhentai.getSettingsPage();
  if ((keyedSettings.sections[1].views[0] as any).textfield.props.currentValue !== "test-api-key") {
    throw new Error("Expected nhentai API key to be stored in secure storage");
  }
  const keyedHome = await nhentai.getHomePage();
  if (!keyedHome.feeds.some((f) => f.id === "favorites")) {
    throw new Error("Expected Favorites feed when an API key is configured");
  }
  await nhentai.onFormSubmitted("account", {
    pref_api_key: "",
    pref_use_account_blacklist: true,
  });
  const clearedHome = await nhentai.getHomePage();
  if (clearedHome.feeds.some((f) => f.id === "favorites")) {
    throw new Error("Expected Favorites feed to disappear after clearing the API key");
  }

  const nhentaiHome = await nhentai.getHomePage();
  for (const feed of nhentaiHome.feeds) {
    const list = await nhentai.getItemList({ key: feed.id }, 1);
    console.log(` - ${feed.id}: ${list.items.length} items of ${list.total}`);
    if (list.items.length === 0 || !Number.isInteger(list.total) || (list.total ?? 0) < 100) {
      throw new Error(`Expected galleries in nhentai feed '${feed.id}'`);
    }
  }

  const nhCodeLookup = await nhentai.getSearchResults({ query: "1" }, 1);
  if (nhCodeLookup.items[0]?.id !== "1" || !nhCodeLookup.isLastPage) {
    throw new Error("Expected bare gallery code search to resolve directly");
  }

  const nhTagSearch = await nhentai.getSearchResults(
    {
      query: 'tag:"big breasts" -tag:yaoi',
      filters: { category: { include: ["doujinshi"], exclude: [] }, pages: ">=20" },
    },
    1
  );
  console.log("Tag/filter search hits:", nhTagSearch.total, nhTagSearch.items[0]?.title);
  if (
    nhTagSearch.items.length === 0 ||
    nhTagSearch.items.some((i) => !i.subtitle?.startsWith("Doujinshi"))
  ) {
    throw new Error("Expected doujinshi-only nhentai tag search results");
  }

  console.log("\n3. Testing content, tag links & pages...");
  const nhGalleryId = nhTagSearch.items[0].id;
  const nhGallery = await nhentai.getContent(nhGalleryId);
  console.log("Content:", {
    title: nhGallery.title,
    details: nhGallery.additionalDetails,
    credits: nhGallery.credits?.slice(0, 2),
    related: nhGallery.collections?.[0]?.items.length,
  });
  const nhTagKey = (nhGallery.genres?.[0]?.destination as any)?.list?.props?.key;
  if (!nhTagKey?.startsWith("q:")) {
    throw new Error("Expected nhentai tags to link to their listing");
  }
  const nhTagList = await nhentai.getItemList({ key: nhTagKey }, 1);
  if (nhTagList.items.length === 0) {
    throw new Error(`Expected galleries for tag link '${nhTagKey}'`);
  }
  const nhChapters = await nhentai.getChapters(nhGalleryId);
  const nhPages = await nhentai.getChapterPages(nhGalleryId, nhChapters[0].id);
  console.log("Pages:", nhPages.length, "| first:", nhPages[0]?.url);
  const nhFirstPage = await fetch(nhPages[0].url!, {
    headers: { Referer: "https://nhentai.net/" },
  });
  if (
    nhChapters.length !== 1 ||
    !nhFirstPage.ok ||
    !nhFirstPage.headers.get("content-type")?.startsWith("image/")
  ) {
    throw new Error("Expected one chapter whose first page loads from the nhentai CDN");
  }

  console.log("\n4. Testing the all-languages variant...");
  const nhentaiAll = wrapDelegateWithValidation(emulate(Nhentai), "nhentai All");
  const nhAllFilters = await nhentaiAll.getSearchFilters();
  const nhLatestAll = await nhentaiAll.getItemList({ key: "date" }, 1);
  const nhJapaneseOnly = await nhentaiAll.getSearchResults(
    { filters: { language: "japanese" } },
    1
  );
  console.log("Japanese-filtered subtitles:", nhJapaneseOnly.items.slice(0, 2).map((i) => i.subtitle));
  if (
    !nhAllFilters.some((f) => f.id === "language") ||
    nhLatestAll.items.length === 0 ||
    nhJapaneseOnly.items.some((i) => !i.subtitle?.endsWith("Japanese"))
  ) {
    throw new Error("Expected the language filter to scope the all-languages nhentai variant");
  }
}

runWhenDirect(import.meta.url, testNhentai);
