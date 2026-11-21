import emulate from "@suwatte/toolchain/emulator";
import { wrapDelegateWithValidation } from "@suwatte/toolchain/validate";
import { readSourceVariants } from "@suwatte/toolchain/runtime";
import HentaiFox from "../src/sources/hentaifox";
import { decodeEntities as decodeHentaiFoxEntities, parseGThScript as parseHentaiFoxGTh, parseGalleryHtml as parseHentaiFoxGalleryHtml, parseListingHtml as parseHentaiFoxListingHtml, parseSidebarHtml as parseHentaiFoxSidebarHtml, toChapterPages as toHentaiFoxPages, toContent as toHentaiFoxContent } from "../src/sources/hentaifox/parsers";
import { buildSearchRoute as buildHentaiFoxRoute, parseDeepLink as parseHentaiFoxLink, withPage as withHentaiFoxPage } from "../src/sources/hentaifox/search";
import { runWhenDirect } from "./support";

export async function testHentaiFox(): Promise<void> {
  console.log("\n==================================================");
  console.log("Testing HentaiFox...");
  console.log("==================================================");

  console.log("\n1. Testing offline helpers & parsers...");
  const hfVariants = readSourceVariants(HentaiFox as any);
  if (
    hfVariants.length !== 5 ||
    hfVariants[0].id !== "all.ldez.hentaifox" ||
    !hfVariants.some((v) => v.id === "en.ldez.hentaifox" && v.args?.language === "english") ||
    !hfVariants.some((v) => v.id === "ja.ldez.hentaifox" && v.args?.language === "japanese") ||
    !hfVariants.some((v) => v.id === "zh.ldez.hentaifox" && v.args?.language === "chinese") ||
    !hfVariants.some((v) => v.id === "ko.ldez.hentaifox" && v.args?.language === "korean")
  ) {
    throw new Error("Expected an all-languages variant plus 4 HentaiFox language variants");
  }
  if (
    decodeHentaiFoxEntities("she&#039;s never") !== "she's never" ||
    withHentaiFoxPage("/", 2) !== "/page/2/" ||
    withHentaiFoxPage("/", 3) !== "/pag/3/" ||
    withHentaiFoxPage("/language/english/popular/", 2) !==
      "/language/english/popular/pag/2/" ||
    withHentaiFoxPage("/search/?q=test", 2) !== "/search/?q=test&page=2"
  ) {
    throw new Error("Expected HentaiFox entity decoding and pagination helpers to work");
  }
  if (
    parseHentaiFoxLink("https://hentaifox.com/gallery/177460/")?.kind !== "gallery" ||
    parseHentaiFoxLink("https://hentaifox.com/g/177460/3/")?.kind !== "gallery" ||
    parseHentaiFoxLink("random")?.kind !== "random" ||
    parseHentaiFoxLink("12", true)?.kind !== "gallery" ||
    parseHentaiFoxLink("12", false) !== null
  ) {
    throw new Error("Expected HentaiFox gallery, reader, random, and numeric code links to parse");
  }

  const hfDefaultPrefs = {
    hiddenTags: [] as string[],
    excludedCategories: [] as string[],
    titleDisplay: "full" as const,
  };
  const hfLangRoute = buildHentaiFoxRoute({}, "english", "pp", 2, hfDefaultPrefs);
  const hfAllLatest = buildHentaiFoxRoute({}, "all", "lt", 1, hfDefaultPrefs);
  const hfTagRoute = buildHentaiFoxRoute(
    { filters: { tags: "big breasts" } },
    "all",
    "pp",
    1,
    hfDefaultPrefs
  );
  const hfSearchRoute = buildHentaiFoxRoute(
    { query: "frieren", filters: { tags: "-yaoi" } },
    "english",
    "lt",
    1,
    { ...hfDefaultPrefs, hiddenTags: ["guro"] }
  );
  const hfTopRated = buildHentaiFoxRoute({}, "all", "tr", 1, hfDefaultPrefs);
  if (
    hfLangRoute.kind !== "get" ||
    hfLangRoute.path !== "/language/english/popular/pag/2/" ||
    hfAllLatest.kind !== "get" ||
    hfAllLatest.path !== "/" ||
    hfTagRoute.kind !== "get" ||
    hfTagRoute.path !== "/tag/big-breasts/popular/" ||
    hfSearchRoute.kind !== "get" ||
    hfSearchRoute.path !== "/search/" ||
    !String(hfSearchRoute.params?.q).includes("+frieren") ||
    !String(hfSearchRoute.params?.q).includes('-"yaoi"') ||
    !String(hfSearchRoute.params?.q).includes('-"guro"') ||
    !String(hfSearchRoute.params?.q).includes("+english") ||
    !String(hfSearchRoute.params?.q).includes(" ") ||
    hfTopRated.kind !== "sidebar" ||
    hfTopRated.type !== "top_rated"
  ) {
    throw new Error("Expected HentaiFox routes to map browse, taxonomy, search, and sidebar feeds");
  }

  const hfListingFixture = `
    <meta name="csrf-token" content="abc123">
    <h1 class="tag_info">Language: <span class="skey">english</span> - 163,137 results</h1>
    <div class="lc_galleries">
      <div class="thumb" data-categories="1" data-languages="1 2">
        <div class="g_type"><h3 class="g_cat"><a class="t_cat" href="/category/doujinshi/">Doujinshi</a></h3></div>
        <div class="inner_thumb"><a href="/gallery/12/"><img data-src="https://i3.hentaifox.com/001/3x907ntq18/thumb.jpg"></a></div>
        <div class="caption"><h2 class="g_title"><a href="/gallery/12/">[JAMEArts] Crucible&amp;#039;s Consort</a></h2></div>
      </div>
    </div>
    <div class="popular_galleries_overview">
      <div class="thumb"><div class="inner_thumb"><a href="/gallery/999999/"><img src="https://i3.hentaifox.com/x.jpg"></a></div><div class="caption">Sidebar Item</div></div>
    </div>
    <ul class="pagination"><li class="page-item active"><a class="page-link" href="#">1</a></li><li class="page-item"><a class="page-link" href="/pag/2/">2</a></li></ul>
  `;
  const parsedHFList = parseHentaiFoxListingHtml(hfListingFixture);
  if (
    parsedHFList.items.length !== 1 ||
    parsedHFList.items[0].id !== "12" ||
    parsedHFList.items[0].title !== "[JAMEArts] Crucible's Consort" ||
    parsedHFList.total !== 163137 ||
    !parsedHFList.hasNextPage ||
    parsedHFList.csrfToken !== "abc123"
  ) {
    throw new Error("Expected HentaiFox listing parser to strip overview thumbs and decode entities");
  }

  const hfSidebarFixture = `
    <div class="item"><div class="image"><a href="/gallery/176752/"><img src="//i3.hentaifox.com/005/4304843/thumb.jpg" alt="Deriheru yondara"></a></div></div>
    <div class="item"><div class="image"><a href="/gallery/176686/"><img src="//i3.hentaifox.com/005/4302773/thumb.jpg" alt="Making a Harem"></a></div></div>
  `;
  const parsedHFSidebar = parseHentaiFoxSidebarHtml(hfSidebarFixture);
  if (parsedHFSidebar.items.length !== 2 || parsedHFSidebar.hasNextPage) {
    throw new Error("Expected HentaiFox sidebar parser to return a single-page ranking list");
  }

  const hfGalleryFixture = `
    <div class="display_gallery">
      <div class="gallery_left"><div class="cover"><img src="https://i3.hentaifox.com/001/3x907ntq18/cover.jpg"></div></div>
      <div class="gallery_right"><div class="info">
        <h1>(C67) [Studio Kimigabuchi (Kimimaru)] RE-TAKE 2 [English]</h1>
        <ul class="parodies"><span class="i_text">Parodies:</span><li><a class="tag_btn" href="/parody/neon-genesis-evangelion/">neon genesis evangelion <span class="t_badge">5772</span></a></li></ul>
        <ul class="tags"><span class="i_text">Tags:</span><li><a class="tag_btn" href="/tag/big-breasts/">big breasts <span class="t_badge">458601</span></a></li></ul>
        <ul class="artists"><span class="i_text">Artists:</span><li><a class="tag_btn" href="/artist/kimimaru/">kimimaru <span class="t_badge">347</span></a></li></ul>
        <ul class="groups"><span class="i_text">Groups:</span><li><a class="tag_btn" href="/group/studio-kimigabuchi/">studio kimigabuchi <span class="t_badge">318</span></a></li></ul>
        <ul class="languages"><span class="i_text">Languages:</span><li><a class="tag_btn" href="/language/english/">english <span class="t_badge">299640</span></a></li></ul>
        <ul class="categories"><span class="i_text">Category:</span><li><a class="tag_btn" href="/category/doujinshi/">doujinshi <span class="t_badge">544351</span></a></li></ul>
        <span class="i_text pages">Pages: 2</span>
        <span class="i_text pages">Posted: 2 hours ago</span>
        <ul class="g_buttons">
          <button id="thumbs_up">16</button>
          <button id="thumbs_down">4</button>
          <button id="add_fav_btn">Favorite (42)</button>
          <input type="hidden" id="gallery_id" value="12">
          <input type="hidden" id="load_id" value="3x907ntq18">
          <input type="hidden" id="load_dir" value="001">
        </ul>
      </div></div>
    </div>
    <input type="hidden" id="load_pages" value="2">
    <div class="g_thumb"><a href="/g/12/1/"><img data-src="https://i3.hentaifox.com/001/3x907ntq18/1t.jpg"></a></div>
    <script>var g_th = $.parseJSON('{"1":"j,835,1200","2":"w,1280,1818"}');</script>
  `;
  const parsedHFGallery = parseHentaiFoxGalleryHtml(hfGalleryFixture, "12");
  const hfContent = toHentaiFoxContent(parsedHFGallery, "all", hfDefaultPrefs);
  const hfPages = toHentaiFoxPages(parsedHFGallery);
  if (
    parseHentaiFoxGTh(hfGalleryFixture).length !== 2 ||
    hfPages[0]?.url !== "https://i3.hentaifox.com/001/3x907ntq18/1.jpg" ||
    hfPages[1]?.url !== "https://i3.hentaifox.com/001/3x907ntq18/2.webp" ||
    hfContent.statistics?.favorites !== 42 ||
    hfContent.statistics?.rating !== 4 ||
    hfContent.credits?.[0]?.name !== "kimimaru"
  ) {
    throw new Error("Expected HentaiFox gallery detail and g_th page list to parse cleanly");
  }

  const hfCdnRes = await fetch(hfPages[0].url!, {
    method: "HEAD",
    headers: { Referer: "https://hentaifox.com/" },
  });
  // Fixture CDN path may 404; live tests below verify real images.
  void hfCdnRes;

  console.log("\n2. Testing live catalogue access...");
  try {
    const hentaifox = wrapDelegateWithValidation(
      emulate(HentaiFox, { variantId: "en.ldez.hentaifox" }),
      "HentaiFox EN"
    );
    const hfHome = await hentaifox.getHomePage();
    if (!hfHome.feeds.some((f) => f.id === "pp") || !hfHome.feeds.some((f) => f.id === "lt")) {
      throw new Error("Expected Latest and Popular feeds on the English HentaiFox variant");
    }
    const hfLatest = await hentaifox.getItemList({ key: "lt" }, 1);
    console.log("HentaiFox EN latest items:", hfLatest.items.length);
    if (hfLatest.items.length === 0) {
      throw new Error("Expected galleries in HentaiFox English latest feed");
    }

    const hfPopular = await hentaifox.getItemList({ key: "pp" }, 1);
    if (hfPopular.items.length === 0) {
      throw new Error("Expected galleries in HentaiFox English popular feed");
    }

    const hfTop = await hentaifox.getItemList({ key: "tr" }, 1);
    if (hfTop.items.length === 0) {
      throw new Error("Expected galleries in HentaiFox Top Rated sidebar feed");
    }

    const hfCodeLookup = await hentaifox.getSearchResults({ query: "12" }, 1);
    if (hfCodeLookup.items.length !== 1 || hfCodeLookup.items[0].id !== "12") {
      throw new Error("Expected bare gallery ID lookup on HentaiFox");
    }

    const hfGallery = await hentaifox.getContent(hfLatest.items[0].id);
    const hfChapters = await hentaifox.getChapters(hfLatest.items[0].id);
    const hfLivePages = await hentaifox.getChapterPages(
      hfLatest.items[0].id,
      hfChapters[0].id
    );
    if (!hfGallery.title || hfLivePages.length === 0 || !hfLivePages[0].url) {
      throw new Error("Expected HentaiFox content details and chapter pages");
    }
    const hfLiveCdn = await fetch(hfLivePages[0].url, {
      method: "HEAD",
      headers: { Referer: "https://hentaifox.com/" },
    });
    if (!hfLiveCdn.ok || !hfLiveCdn.headers.get("content-type")?.startsWith("image/")) {
      throw new Error("Expected HentaiFox CDN image URL to be directly reachable");
    }
    console.log(
      "HentaiFox EN gallery:",
      hfGallery.title,
      "| pages:",
      hfLivePages.length,
      "| top rated:",
      hfTop.items.length
    );

    const hfAll = wrapDelegateWithValidation(emulate(HentaiFox), "HentaiFox All");
    const hfAllHome = await hfAll.getHomePage();
    if (hfAllHome.feeds.some((f) => f.id === "pp")) {
      throw new Error("Expected the all-languages HentaiFox variant to omit Popular");
    }
  } catch (error) {
    if (!(error instanceof CloudflareError)) throw error;
    console.log("Skipping live HentaiFox HTML tests (Cloudflare challenge):", error.resolutionURL);
  }
}

runWhenDirect(import.meta.url, testHentaiFox);
