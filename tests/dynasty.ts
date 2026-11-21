import emulate from "@suwatte/toolchain/emulator";
import { ContentRating, ContentStatus, ReadingMode } from "@suwatte/toolchain";
import Dynasty from "../src/sources/dynasty";
import { parseChapterName, parseDeepLinkId as parseDynastyLink, parseEntryList, parseHomepage, parseReaderPageList, parseStandaloneChapter, parseTagPageChapters, parseTagPageContent } from "../src/sources/dynasty/parsers";
import { parseReleaseDate, seriesSlugFromChapterSlug, splitChapterLabel, upgradeCover } from "../src/sources/dynasty/utils";
import { buildSearchPath as buildDynastySearchPath } from "../src/sources/dynasty/search";
import { wrapDelegateWithValidation } from "@suwatte/toolchain/validate";
import { runWhenDirect } from "./support";

export async function testDynasty(): Promise<void> {
  console.log("\n==================================================");
  console.log("Testing Dynasty Scans...");
  console.log("==================================================");

  console.log("\n1. Testing offline helpers & parsers...");
  if (
    parseDynastyLink("https://dynasty-scans.com/series/some_prefer_nettles") !==
      "series/some_prefer_nettles" ||
    parseDynastyLink("https://dynasty-scans.com/chapters/some_prefer_nettles_ch10") !==
      "series/some_prefer_nettles" ||
    parseDynastyLink("https://dynasty-scans.com/chapters/pocky_day") !==
      "chapter/pocky_day" ||
    parseDynastyLink("not a dynasty link") !== null
  ) {
    throw new Error("Expected Dynasty deep links to resolve");
  }
  if (
    seriesSlugFromChapterSlug("some_prefer_nettles_ch22_5") !== "some_prefer_nettles" ||
    seriesSlugFromChapterSlug("some_prefer_nettles_ch03_1") !== "some_prefer_nettles" ||
    seriesSlugFromChapterSlug("pocky_day") !== null
  ) {
    throw new Error("Expected Dynasty chapter slugs to strip back to their series");
  }
  const nettles = splitChapterLabel("Some Prefer Nettles ch10: But I Didn't Want to Bother You.");
  if (
    nettles.title !== "Some Prefer Nettles" ||
    nettles.chapter !== "But I Didn't Want to Bother You."
  ) {
    throw new Error("Expected Dynasty card titles to split into series and chapter");
  }
  if (splitChapterLabel("8,000 Years of Springs").chapter !== undefined) {
    throw new Error("Expected standalone doujin titles to stay unsplit");
  }
  const dynastyNov = parseReleaseDate("released Nov 15 '26");
  const dynastyMar = parseReleaseDate("released Mar 22 '13");
  const dynastyVerbose = parseReleaseDate("Nov 15, 2026");
  if (
    dynastyNov?.getFullYear() !== 2026 ||
    dynastyNov.getMonth() !== 10 ||
    dynastyNov.getDate() !== 15 ||
    dynastyMar?.getFullYear() !== 2013 ||
    dynastyVerbose?.getFullYear() !== 2026
  ) {
    throw new Error("Expected Dynasty release dates to parse in both site formats");
  }
  const nettlesCh10 = parseChapterName("Chapter 10: But I Didn't Want to Bother You.");
  if (
    nettlesCh10.number !== 10 ||
    nettlesCh10.title !== "But I Didn't Want to Bother You." ||
    parseChapterName("Chapter 1").number !== 1 ||
    parseChapterName("Chapter 1").title !== undefined ||
    parseChapterName("Oneshot").number !== -1
  ) {
    throw new Error("Expected Dynasty chapter labels to parse numbers and titles");
  }
  const dynastySearchPath = buildDynastySearchPath({ query: "Blue Monday" }, 1);
  if (
    !dynastySearchPath.includes("classes%5B%5D=Series") ||
    !dynastySearchPath.includes("classes%5B%5D=Doujin")
  ) {
    throw new Error("Expected Dynasty search to send bracketed classes[] params");
  }
  if (upgradeCover("https://dynasty-scans.com/system/releases/000/001/covers/thumbnail.jpg")
    .endsWith("/covers/medium.jpg") === false
  ) {
    throw new Error("Expected Dynasty release covers to upgrade to medium");
  }

  const dynastySeriesFixture = `
    <h2 class='tag-title'><b>Some Prefer Nettles</b> by <a href="/authors/touma">Touma</a> <small>&mdash; Ongoing</small></h2>
    <p class='aliases'>Also known as <b>Tade Kuu Kimi mo Suki Suki</b></p>
    <div class='tag-tags'><a href="/tags/yuri" class="label">Yuri</a> <a href="/tags/nsfw" class="label">NSFW</a> <a href="/pairings/a_x_b" class="label">A x B</a></div>
    <div class='row cover-chapters'>
      <div class='span2 cover'><img alt="000" class="thumbnail" src="/system/tag_contents_covers/000/024/262/medium/000.jpg" /></div>
      <div class='span10'>
        <dl class='chapter-list'>
          <dt>Volume 1</dt>
          <dd>
            <a href="/chapters/some_prefer_nettles_ch01" class="name">Chapter 1: Can&#x27;t get you out of my head.</a>
            <small>released Feb 16 '25</small>
          </dd>
          <dd>
            <a href="/chapters/some_prefer_nettles_ch02" class="name">Chapter 2</a>
            <small>released Mar  1 '25</small>
          </dd>
        </dl>
      </div>
    </div>
  `;
  const dynastyContent = parseTagPageContent(
    dynastySeriesFixture,
    "series/some_prefer_nettles"
  );
  console.log("Content:", {
    title: dynastyContent.title,
    status: dynastyContent.status,
    rating: dynastyContent.rating,
    credits: dynastyContent.credits,
  });
  if (
    dynastyContent.title !== "Some Prefer Nettles" ||
    dynastyContent.status !== ContentStatus.ONGOING ||
    dynastyContent.rating !== ContentRating.MATURE ||
    dynastyContent.readingMode !== ReadingMode.PAGED_MANGA ||
    dynastyContent.coverImage !==
      "https://dynasty-scans.com/system/tag_contents_covers/000/024/262/medium/000.jpg" ||
    dynastyContent.credits?.[0]?.name !== "Touma" ||
    dynastyContent.additionalTitles?.join() !== "Tade Kuu Kimi mo Suki Suki" ||
    dynastyContent.genres?.length !== 2 ||
    dynastyContent.properties?.[0]?.tags.length !== 1 ||
    dynastyContent.additionalDetails?.["Franchise"]
  ) {
    throw new Error("Expected Dynasty tag page details to parse");
  }
  const dynastyFixtureChapters = parseTagPageChapters(dynastySeriesFixture);
  console.log(
    "Chapters:",
    dynastyFixtureChapters.map((c) => ({ id: c.id, number: c.number, volume: c.volume, date: c.date }))
  );
  if (
    dynastyFixtureChapters.length !== 2 ||
    dynastyFixtureChapters[0].id !== "some_prefer_nettles_ch02" ||
    dynastyFixtureChapters[0].number !== 2 ||
    dynastyFixtureChapters[0].date?.getFullYear() !== 2025 ||
    dynastyFixtureChapters[1].volume !== 1 ||
    dynastyFixtureChapters[1].title !== "Can't get you out of my head."
  ) {
    throw new Error("Expected Dynasty tag page chapters newest-first with volumes");
  }
  const dynastyFranchise = parseTagPageContent(
    `<h2>Doujins &rsaquo; Hell Maiden</h2><div class='tag-tags'></div>`,
    "doujins/hell_maiden"
  );
  if (dynastyFranchise.title !== "Hell Maiden") {
    throw new Error("Expected Dynasty franchise pages to title from the breadcrumb");
  }

  const dynastyHomeFixture = `
    <div class='row'>
      <a class='chapter media thumbnail' href='/chapters/some_prefer_nettles_ch10'>
        <img alt="Thumbnail" src="/system/releases/000/048/757/covers/thumbnail.jpg" />
        <div class='media-body'>
          <div class='title'>Some Prefer Nettles ch10: But I Didn't Want to Bother You.</div>
          <div class='tags'><span class="label">Yuri</span></div>
        </div>
      </a>
      <a class='chapter media thumbnail' href='/chapters/some_prefer_nettles_ch09'>
        <img alt="Thumbnail" src="/system/releases/000/048/756/covers/thumbnail.jpg" />
        <div class='media-body'><div class='title'>Some Prefer Nettles ch09</div></div>
      </a>
      <a class='chapter media thumbnail' href='/chapters/pocky_day'>
        <img alt="Thumbnail" src="/system/releases/000/048/747/covers/thumbnail.jpg" />
        <div class='media-body'><div class='title'>Pocky Day</div></div>
      </a>
    </div>
    <div class='pagination pagination-centered'><ul><li><a href="/?page=2" rel="next">→</a></li></ul></div>
  `;
  const dynastyHomeItems = parseHomepage(dynastyHomeFixture);
  console.log(
    "Home items:",
    dynastyHomeItems.items.map((i) => ({ id: i.id, title: i.title, subtitle: i.subtitle }))
  );
  if (
    dynastyHomeItems.items.length !== 2 ||
    dynastyHomeItems.items[0].id !== "series/some_prefer_nettles" ||
    dynastyHomeItems.items[0].title !== "Some Prefer Nettles" ||
    dynastyHomeItems.items[0].subtitle !== "But I Didn't Want to Bother You." ||
    dynastyHomeItems.items[0].coverImage !==
      "https://dynasty-scans.com/system/releases/000/048/757/covers/medium.jpg" ||
    dynastyHomeItems.items[1].id !== "chapter/pocky_day" ||
    dynastyHomeItems.isLastPage
  ) {
    throw new Error("Expected Dynasty home cards to map to series and standalone chapters");
  }

  const dynastySearchFixture = `
    <dl class='chapter-list'>
      <dd>
        <a href="/series/i_favor_the_villainess" class="name">I Favor the Villainess</a>
        by <a href="/authors/inori">Inori</a>
        <span class='tags'><a href="/tags/yuri" class="label">Yuri</a></span>
      </dd>
      <dd><a href="/doujins/hell_maiden" class="name">Hell Maiden Doujin</a></dd>
    </dl>
    <div class='pagination pagination-centered'><ul><li><a href="/search?page=2" rel="next">→</a></li></ul></div>
  `;
  const dynastySearchItems = parseEntryList(dynastySearchFixture);
  console.log(
    "Search items:",
    dynastySearchItems.items.map((i) => ({ id: i.id, title: i.title, subtitle: i.subtitle }))
  );
  if (
    dynastySearchItems.items.length !== 2 ||
    dynastySearchItems.items[0].id !== "series/i_favor_the_villainess" ||
    dynastySearchItems.items[0].subtitle !== "Inori" ||
    dynastySearchItems.items[1].id !== "doujins/hell_maiden" ||
    dynastySearchItems.isLastPage
  ) {
    throw new Error("Expected Dynasty search rows to map series and doujin tags");
  }

  const dynastyReaderFixture = `<script>//<![CDATA[
    var pages = [{"image":"/system/releases/000/048/757/047.webp","name":"047","width":1125,"height":1600},{"image":"/system/releases/000/048/757/048.webp","name":"048","width":1125,"height":1600}];
  //]]></script>`;
  const dynastyFixturePages = parseReaderPageList(dynastyReaderFixture);
  if (
    dynastyFixturePages.length !== 2 ||
    dynastyFixturePages[0] !== "https://dynasty-scans.com/system/releases/000/048/757/047.webp"
  ) {
    throw new Error("Expected Dynasty reader pages from the var pages payload");
  }

  const dynastyStandalone = parseStandaloneChapter(
    `<h3 id='chapter-title'><b>Around the Stars of Yachiyo</b> by <a href="/authors/romi">Romi</a></h3>
     <div id='chapter-details'>
       <span class='scanlators'><a href="/scanlators/gouma_den">Gouma-Den</a></span>
       <span class='released'>Nov 13, 2026</span>
       <span class='tags'><a href="/tags/nsfw" class="label">NSFW</a> <a href="/pairings/iroha_x_yachiyo" class="label">Iroha x Yachiyo</a></span>
     </div>
     <script>var pages = [{"image":"/system/releases/000/048/748/001.webp","name":"001","width":1200,"height":1700}];</script>`,
    "around_the_stars_of_yachiyo"
  );
  console.log("Standalone:", {
    title: dynastyStandalone.content.title,
    rating: dynastyStandalone.content.rating,
    credits: dynastyStandalone.content.credits,
    chapter: dynastyStandalone.chapter,
  });
  if (
    dynastyStandalone.content.title !== "Around the Stars of Yachiyo" ||
    dynastyStandalone.content.rating !== ContentRating.MATURE ||
    dynastyStandalone.content.coverImage !==
      "https://dynasty-scans.com/system/releases/000/048/748/001.webp" ||
    dynastyStandalone.content.credits?.[0]?.role !== "Author" ||
    dynastyStandalone.content.credits?.[1]?.name !== "Gouma-Den" ||
    dynastyStandalone.chapter.number !== 1 ||
    dynastyStandalone.chapter.date?.getFullYear() !== 2026 ||
    dynastyStandalone.pages.length !== 1
  ) {
    throw new Error("Expected standalone Dynasty chapters to parse from their page");
  }

  console.log("\n2. Testing live catalogue access...");
  const dynasty = wrapDelegateWithValidation(emulate(Dynasty), "Dynasty");
  const dynastyHome = await dynasty.getHomePage();
  for (const feed of dynastyHome.feeds) {
    const list = await dynasty.getItemList({ key: feed.id }, 1);
    console.log(` - ${feed.id}: ${list.items.length} items (last page: ${list.isLastPage})`);
    if (list.items.length === 0) {
      throw new Error(`Expected items in Dynasty feed '${feed.id}'`);
    }
    if (list.items.some((item) => !item.webUrl?.startsWith("https://dynasty-scans.com/"))) {
      throw new Error(`Expected absolute webUrls in Dynasty feed '${feed.id}'`);
    }
    if (!list.items.some((item) => item.coverImage)) {
      throw new Error(`Expected covers in Dynasty feed '${feed.id}'`);
    }
  }

  console.log("\n3. Testing getSearchResults (keyword, filters & deep link)...");
  const dynastySearch = await dynasty.getSearchResults({ query: "girl" }, 1);
  console.log("Keyword hits:", dynastySearch.items.slice(0, 3).map((i) => ({ id: i.id, title: i.title })));
  if (dynastySearch.items.length === 0 || dynastySearch.isLastPage) {
    throw new Error("Expected paged Dynasty keyword results");
  }
  if (!dynastySearch.items.some((item) => item.coverImage)) {
    throw new Error("Expected covers on Dynasty search results");
  }
  const dynastyBlueMonday = await dynasty.getSearchResults(
    { query: "Blue Monday" },
    1
  );
  if (!dynastyBlueMonday.items.some((item) => item.id === "series/blue_monday")) {
    throw new Error("Expected 'Blue Monday' series results from Dynasty search");
  }
  const dynastyDoujins = await dynasty.getSearchResults(
    { filters: { classes: { include: ["Doujin"], exclude: [] } } },
    1
  );
  console.log("Doujin hits:", dynastyDoujins.items.slice(0, 3).map((i) => i.id));
  if (dynastyDoujins.items.length === 0) {
    throw new Error("Expected Dynasty doujin-filtered results");
  }
  const dynastyDeepLink = await dynasty.getSearchResults(
    { query: "https://dynasty-scans.com/series/some_prefer_nettles" },
    1
  );
  if (dynastyDeepLink.items[0]?.id !== "series/some_prefer_nettles") {
    throw new Error("Expected Dynasty deep link to resolve to Some Prefer Nettles");
  }

  console.log("\n4. Testing getContent ('series/some_prefer_nettles')...");
  const nettlesContent = await dynasty.getContent("series/some_prefer_nettles");
  console.log("Content:", {
    title: nettlesContent.title,
    status: nettlesContent.status,
    readingMode: nettlesContent.readingMode,
    credits: nettlesContent.credits,
    genres: nettlesContent.genres?.map((g) => g.title),
  });
  if (nettlesContent.title !== "Some Prefer Nettles" || !nettlesContent.coverImage) {
    throw new Error("Expected Dynasty series details");
  }

  console.log("\n5. Testing getChapters & getChapterPages...");
  const nettlesChapters = await dynasty.getChapters("series/some_prefer_nettles");
  console.log(
    "Chapters:",
    nettlesChapters.length,
    "| latest:",
    nettlesChapters[0]?.number,
    nettlesChapters[0]?.title,
    "| oldest:",
    nettlesChapters.at(-1)?.number
  );
  if (nettlesChapters.length < 10 || nettlesChapters[0].number !== 10) {
    throw new Error("Expected Dynasty series chapters newest-first");
  }
  const nettlesOldest = [...nettlesChapters].reverse().find((c) => !c.isSpecial);
  if (nettlesOldest?.number !== 1) {
    throw new Error("Expected Dynasty series chapters oldest-last starting at 1");
  }
  if (
    nettlesChapters.filter((c) => c.isSpecial).length !== 3 ||
    !nettlesChapters.at(-1)?.isSpecial
  ) {
    throw new Error("Expected April Fools' chapters to be marked special");
  }
  const nettlesPages = await dynasty.getChapterPages(
    "series/some_prefer_nettles",
    nettlesChapters[0].id
  );
  console.log("Pages:", nettlesPages.length, "| first:", nettlesPages[0]?.url);
  if (
    nettlesPages.length === 0 ||
    !nettlesPages[0]?.url?.startsWith("https://dynasty-scans.com/system/releases/")
  ) {
    throw new Error("Expected Dynasty chapter pages");
  }
  const dynastyImage = await fetch(nettlesPages[0].url!);
  if (!dynastyImage.ok || !dynastyImage.headers.get("content-type")?.startsWith("image/")) {
    throw new Error("Expected the first Dynasty page to load as an image");
  }

  console.log("\n6. Testing a standalone doujin ('chapter/pocky_day')...");
  const pockyContent = await dynasty.getContent("chapter/pocky_day");
  const pockyChapters = await dynasty.getChapters("chapter/pocky_day");
  const pockyPages = await dynasty.getChapterPages(
    "chapter/pocky_day",
    pockyChapters[0].id
  );
  console.log("Pocky Day:", {
    title: pockyContent.title,
    credits: pockyContent.credits,
    chapters: pockyChapters.length,
    pages: pockyPages.length,
  });
  if (
    pockyContent.title !== "Pocky Day" ||
    pockyChapters.length !== 1 ||
    pockyPages.length === 0
  ) {
    throw new Error("Expected standalone Dynasty doujin content with one chapter");
  }
}

runWhenDirect(import.meta.url, testDynasty);
