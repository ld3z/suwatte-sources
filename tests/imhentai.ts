import emulate from "@suwatte/toolchain/emulator";
import { wrapDelegateWithValidation } from "@suwatte/toolchain/validate";
import { readSourceVariants } from "@suwatte/toolchain/runtime";
import IMHentai from "../src/sources/imhentai";
import { decodeEntities as decodeIMHentaiEntities, parseGThScript, parseGalleryHtml as parseIMHentaiGalleryHtml, parseListingHtml as parseIMHentaiListingHtml, resolveImageServer as resolveIMHentaiServer, toChapterPages as toIMHentaiPages, toContent as toIMHentaiContent } from "../src/sources/imhentai/parsers";
import { buildSearchRoute as buildIMHentaiRoute, parseDeepLink as parseIMHentaiLink } from "../src/sources/imhentai/search";
import { runWhenDirect } from "./support";

export async function testIMHentai(): Promise<void> {
  console.log("\n==================================================");
  console.log("Testing IMHentai...");
  console.log("==================================================");

  console.log("\n1. Testing offline helpers & parsers...");
  const imVariants = readSourceVariants(IMHentai as any);
  if (
    imVariants.length !== 8 ||
    imVariants[0].id !== "all.ldez.imhentai" ||
    !imVariants.some((v) => v.id === "en.ldez.imhentai" && v.args?.language === "english") ||
    !imVariants.some((v) => v.id === "ja.ldez.imhentai" && v.args?.language === "japanese") ||
    !imVariants.some((v) => v.id === "ko.ldez.imhentai" && v.args?.language === "korean")
  ) {
    throw new Error("Expected an all-languages variant plus 7 IMHentai language variants");
  }
  if (
    decodeIMHentaiEntities("[JAMEArts] Crucible&amp;#039;s Consort") !==
      "[JAMEArts] Crucible's Consort" ||
    resolveIMHentaiServer(12) !== "m1.imhentai.xxx" ||
    resolveIMHentaiServer(1777551, "11") !== "m11.imhentai.xxx"
  ) {
    throw new Error("Expected double-encoded HTML entity decoding and CDN server resolution");
  }
  if (
    parseIMHentaiLink("https://imhentai.xxx/gallery/1777551/")?.kind !== "gallery" ||
    parseIMHentaiLink("https://imhentai.xxx/view/12/4/")?.kind !== "gallery" ||
    parseIMHentaiLink("random")?.kind !== "random" ||
    parseIMHentaiLink("12", true)?.kind !== "gallery" ||
    parseIMHentaiLink("12", false) !== null
  ) {
    throw new Error("Expected IMHentai gallery, reader, random, and numeric code links to parse");
  }
  const imDefaultPrefs = {
    hiddenTags: [] as string[],
    excludedCategories: [] as string[],
    titleDisplay: "full" as const,
  };
  const imLangRoute = buildIMHentaiRoute({}, "english", "pp", 2, imDefaultPrefs);
  const imTopRatedEn = buildIMHentaiRoute({}, "english", "tr", 1, imDefaultPrefs);
  const imAdvRoute = buildIMHentaiRoute(
    {
      filters: {
        category: { include: ["doujinshi"], exclude: [] },
        tags: "big breasts, -yaoi",
        artists: "kimimaru",
      },
    },
    "english",
    "tr",
    1,
    { ...imDefaultPrefs, hiddenTags: ["guro"] }
  );
  const imKeywordRoute = buildIMHentaiRoute(
    { query: "tutor", filters: { tags: "big breasts" } },
    "english",
    "lt",
    1,
    imDefaultPrefs
  );
  if (
    imLangRoute.path !== "/language/english/popular/" ||
    imLangRoute.params.page !== 2 ||
    imTopRatedEn.path !== "/search/" ||
    imTopRatedEn.params.tr !== 1 ||
    imTopRatedEn.params.en !== 1 ||
    imTopRatedEn.params.jp !== 0 ||
    imAdvRoute.path !== "/advsearch/" ||
    imAdvRoute.params.d !== 1 ||
    imAdvRoute.params.m !== 0 ||
    !String(imAdvRoute.params.key).includes('+tag:"big breasts"') ||
    !String(imAdvRoute.params.key).includes('-tag:"yaoi"') ||
    !String(imAdvRoute.params.key).includes('+artist:"kimimaru"') ||
    !String(imAdvRoute.params.key).includes('-tag:"guro"') ||
    imKeywordRoute.path !== "/search/" ||
    imKeywordRoute.params.key !== "tutor,big breasts"
  ) {
    throw new Error("Expected IMHentai routes to map browse, /search/, and /advsearch/ parameters accurately");
  }

  const imListingFixture = `
    <h1 class="galleries_title">Language: English (299,214) results found</h1>
    <div class="row galleries">
      <div class="thumb">
        <div class="thumbnail">
          <div class="cat_flag"><a href="/language/english/"><img class="thumb_flag" src="/images/en.png"></a><h3 class="gallery_cat"><a class="thumb_cat" href="/category/doujinshi/">Doujinshi</a></h3></div>
          <div class="inner_thumb"><a href="/gallery/12/"><img data-src="https://m1.imhentai.xxx/001/3x907ntq18/thumb.jpg"></a></div>
          <div class="caption"><h2 class="gallery_title"><a href="/gallery/12/">[JAMEArts] Crucible&amp;#039;s Consort</a></h2></div>
        </div>
      </div>
    </div>
    <div class="ranking_list">
      <div class="thumb"><div class="inner_thumb"><a href="/gallery/999999/"><img src="https://m1.imhentai.xxx/x.jpg"></a></div><div class="caption">Sidebar Item</div></div>
    </div>
    <ul class="pagination"><li class="page-item active"><a class="page-link" href="#">1</a></li><li class="page-item"><a class="page-link" href="?page=2">2</a></li></ul>
  `;
  const parsedIMList = parseIMHentaiListingHtml(imListingFixture);
  if (
    parsedIMList.items.length !== 1 ||
    parsedIMList.items[0].id !== "12" ||
    parsedIMList.items[0].title !== "[JAMEArts] Crucible's Consort" ||
    parsedIMList.total !== 299214 ||
    !parsedIMList.hasNextPage
  ) {
    throw new Error("Expected IMHentai listing parser to strip .ranking_list and decode double entities");
  }

  const imGalleryFixture = `
    <div class="row gallery_first">
      <div class="left_cover"><a href="/view/12/1/"><img data-src="https://m1.imhentai.xxx/001/3x907ntq18/cover.jpg"></a></div>
      <div class="right_details">
        <h1>(C67) [Studio Kimigabuchi (Kimimaru)] RE-TAKE 2 [English]</h1>
        <p class="subtitle">(C67) [スタジオKIMIGABUCHI] RE-TAKE2</p>
        <ul class="galleries_info">
          <li><span class="tags_text">Parodies:</span><a class="tag" href="/parody/neon-genesis-evangelion/">neon genesis evangelion <span class="split_tag"> | shin seiki evangelion</span><span class="badge">5772</span></a></li>
          <li><span class="tags_text">Tags:</span><a class="tag" href="/tag/big-breasts/">big breasts<span class="badge">458601</span></a></li>
          <li><span class="tags_text">Artists:</span><a class="tag" href="/artist/kimimaru/">kimimaru <span class="split_tag"> | entokkun</span><span class="badge">347</span></a></li>
          <li><span class="tags_text">Groups:</span><a class="tag" href="/group/studio-kimigabuchi/">studio kimigabuchi<span class="badge">318</span></a></li>
          <li><span class="tags_text">Languages:</span><a class="tag" href="/language/english/">english<span class="badge">299640</span></a></li>
          <li><span class="tags_text">Category:</span><a class="tag" href="/category/doujinshi/">doujinshi<span class="badge">544351</span></a></li>
          <li class="pages">Pages: 2</li>
          <li class="posted">Posted: 2 hours ago</li>
        </ul>
        <div class="g_buttons">
          <button id="like_btn">16</button>
          <button id="dlike_btn">4</button>
          <button id="add_fav_btn">Favourite (42)</button>
        </div>
        <input type="hidden" id="gallery_id" value="12">
      </div>
    </div>
    <input type="hidden" id="load_server" value="1">
    <input type="hidden" id="load_dir" value="001">
    <input type="hidden" id="load_id" value="3x907ntq18">
    <input type="hidden" id="load_pages" value="2">
    <div class="gthumb"><a href="/view/12/1/"><img data-src="https://m1.imhentai.xxx/001/3x907ntq18/1t.jpg"></a></div>
    <script>var g_th = $.parseJSON('{"1":"j,835,1200","2":"w,1280,1818"}');</script>
  `;
  const parsedIMGallery = parseIMHentaiGalleryHtml(imGalleryFixture, "12");
  const imContent = toIMHentaiContent(parsedIMGallery, "all", imDefaultPrefs);
  const imPages = toIMHentaiPages(parsedIMGallery);
  if (
    parseGThScript(imGalleryFixture).length !== 2 ||
    imPages[0]?.url !== "https://m1.imhentai.xxx/001/3x907ntq18/1.jpg" ||
    imPages[1]?.url !== "https://m1.imhentai.xxx/001/3x907ntq18/2.webp" ||
    imContent.statistics?.favorites !== 42 ||
    imContent.statistics?.rating !== 4 ||
    imContent.credits?.[0]?.name !== "kimimaru (entokkun)"
  ) {
    throw new Error("Expected IMHentai gallery detail and g_th page list to parse cleanly");
  }

  const imCdnRes = await fetch(imPages[0].url!, {
    method: "HEAD",
    headers: { Referer: "https://imhentai.xxx/" },
  });
  if (!imCdnRes.ok || !imCdnRes.headers.get("content-type")?.startsWith("image/")) {
    throw new Error("Expected IMHentai CDN image URL to be directly reachable");
  }

  console.log("\n2. Testing live catalogue access...");
  try {
    const imhentai = wrapDelegateWithValidation(
      emulate(IMHentai, { variantId: "en.ldez.imhentai" }),
      "IMHentai EN"
    );
    const imHome = await imhentai.getHomePage();
    const imLatest = await imhentai.getItemList({ key: imHome.feeds[0].id }, 1);
    console.log("IMHentai EN latest items:", imLatest.items.length);
  } catch (error) {
    if (!(error instanceof CloudflareError)) throw error;
    console.log("Skipping live IMHentai HTML tests (Cloudflare challenge):", error.resolutionURL);
  }
}

runWhenDirect(import.meta.url, testIMHentai);
