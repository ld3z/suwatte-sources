import emulate from "@suwatte/toolchain/emulator";
import { ContentRating, ContentType, ReadingMode, SourceChapterTextFormat } from "@suwatte/toolchain";
import Atsumaru from "./src/sources/atsumaru";
import AtsumaruNovels from "./src/sources/atsumaru-novels";
import NovelFire from "./src/sources/novelfire";
import LNORI from "./src/sources/lnori";
import Chikari from "./src/sources/chikari";
import ChikariNovels from "./src/sources/chikari-novels";
import { buildListPath } from "./src/sources/chikari/search";
import { Preferences as ChikariPreferences } from "./src/sources/chikari/settings";
import LunarX from "./src/sources/lunarx";
import Madokami from "./src/sources/madokami";
import NovelBuddy from "./src/sources/novelbuddy";
import NovelArchive from "./src/sources/novelarchive";
import Toonkotsu from "./src/sources/toonkotsu";
import YaoiMe from "./src/sources/yaoime";
import { aesGcmDecrypt, decryptPageList } from "./src/sources/yaoime/crypto";
import {
  parseChapterLabel,
  parseChapters as parseYaoiMeChapters,
  parseDeepLinkId as parseYaoiMeLink,
  parseSealKey,
} from "./src/sources/yaoime/parsers";
import {
  decodeBase64Url,
  decryptPage,
  encodeBase64Url,
  hmacSha256,
  signReaderPath,
} from "./src/sources/toonkotsu/crypto";
import {
  PAGE_KEY,
  PAGE_NONCE,
  parseChapterPages,
  parseDeepLinkId as parseToonkotsuLink,
  toChapters as toToonkotsuChapters,
  toContent as toToonkotsuContent,
} from "./src/sources/toonkotsu/parsers";
import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { parseChapterNumbers, parseDate } from "./src/sources/madokami/parsers";
import { base64Encode, detailsPath } from "./src/sources/madokami/utils";
import { wrapDelegateWithValidation } from "@suwatte/toolchain/validate";

async function main() {
  const keepAlive = setInterval(() => {}, 1000);

  try {
    console.log("==================================================");
    console.log("Testing Atsumaru (Comics / Main Runner)...");
    console.log("==================================================");
    const comicSource = emulate(Atsumaru);

    console.log("\n1. Testing getHomePage...");
    const home = await comicSource.getHomePage();
    console.log("Feeds count:", home.feeds.length);

    console.log("\n2. Testing getItemList (popular_daily)...");
    const popular = await comicSource.getItemList({ key: "popular_daily" }, 1);
    console.log("Popular items count:", popular.items.length);
    const firstItem = popular.items[0];
    console.log("First item:", {
      id: firstItem.id,
      title: firstItem.title,
      coverImage: firstItem.coverImage,
      webUrl: firstItem.webUrl,
    });

    console.log("\n3. Testing getSearchResults ('swordmaster')...");
    const search = await comicSource.getSearchResults({ query: "swordmaster" }, 1);
    console.log("Search hits count:", search.items.length, "total:", search.total);

    const targetComicId = firstItem.id;
    console.log(`\n4. Testing getContent ('${targetComicId}')...`);
    const comicContent = await comicSource.getContent(targetComicId);
    console.log("Content details:", {
      title: comicContent.title,
      contentType: comicContent.contentType,
      readingMode: comicContent.readingMode,
    });

    console.log(`\n5. Testing getChapters ('${targetComicId}')...`);
    const comicChapters = await comicSource.getChapters(targetComicId);
    console.log("Chapters count:", comicChapters.length);
    if (comicChapters.length > 0) {
      const ch = comicChapters[0];
      console.log("First chapter:", {
        id: ch.id,
        number: ch.number,
        title: ch.title,
      });

      console.log(`\n6. Testing getChapterPages ('${targetComicId}', '${ch.id}')...`);
      const pages = await comicSource.getChapterPages(targetComicId, ch.id);
      console.log("Pages count:", pages.length);
    }

    console.log("\n7. Testing getSearchFilters...");
    const comicFilters = await comicSource.getSearchFilters();
    console.log("Comic filters count:", comicFilters.length);

    console.log("\n8. Testing getSettingsPage & onFormSubmitted...");
    const comicSettings = await comicSource.getSettingsPage();
    console.log("Comic settings sections count:", comicSettings?.sections.length);

    console.log("\n==================================================");
    console.log("Testing AtsumaruNovels (Dedicated Novel Runner)...");
    console.log("==================================================");
    const novelSource = emulate(AtsumaruNovels);

    console.log("\n1. Testing getHomePage...");
    const novelHome = await novelSource.getHomePage();
    console.log("Novel Feeds count:", novelHome.feeds.length);
    for (const feed of novelHome.feeds) {
      console.log(` - ${feed.id}: ${feed.title}`);
    }

    console.log("\n2. Testing getItemList (popular_daily novels)...");
    const novelPopular = await novelSource.getItemList({ key: "popular_daily" }, 1);
    console.log("Novel popular items count:", novelPopular.items.length);
    const firstNovel = novelPopular.items[0];
    console.log("First novel item:", {
      id: firstNovel.id,
      title: firstNovel.title,
      subtitle: firstNovel.subtitle,
      coverImage: firstNovel.coverImage,
      webUrl: firstNovel.webUrl,
    });
    if (firstNovel.subtitle !== "Novel") {
      throw new Error(`Expected firstNovel.subtitle to be 'Novel', got '${firstNovel.subtitle}'`);
    }

    console.log("\n3. Testing getSearchResults ('innkeeper')...");
    const novelSearch = await novelSource.getSearchResults({ query: "innkeeper" }, 1);
    console.log("Novel search hits count:", novelSearch.items.length);
    if (novelSearch.items.length > 0) {
      console.log("First search hit:", {
        id: novelSearch.items[0].id,
        title: novelSearch.items[0].title,
        webUrl: novelSearch.items[0].webUrl,
      });
    }

    console.log("\n4. Testing getContent ('lLxa' - The Innkeeper)...");
    const innkeeper = await novelSource.getContent("lLxa");
    console.log("Novel details:", {
      title: innkeeper.title,
      contentType: innkeeper.contentType,
      coverImage: innkeeper.coverImage,
      webUrl: innkeeper.webUrl,
      genres: innkeeper.genres?.slice(0, 3),
      credits: innkeeper.credits?.slice(0, 2),
    });
    if (innkeeper.contentType !== ContentType.NOVEL) {
      throw new Error(`Expected ContentType.NOVEL for lLxa, got ${innkeeper.contentType}`);
    }

    console.log("\n5. Testing getChapters ('lLxa')...");
    const chapters = await novelSource.getChapters("lLxa");
    console.log("Chapters count:", chapters.length);
    if (chapters.length > 0) {
      const latestChapter = chapters[0];
      console.log("Latest chapter:", {
        id: latestChapter.id,
        number: latestChapter.number,
        title: latestChapter.title,
        date: latestChapter.date,
        webUrl: latestChapter.webUrl,
      });

      console.log(`\n6. Testing getChapterText ('lLxa', '${latestChapter.id}')...`);
      const text = await novelSource.getChapterText("lLxa", latestChapter.id);
      console.log("Chapter text format:", text.format);
      console.log("Chapter body length (bytes/chars):", text.body.length);
      console.log("First 200 chars of body:\n", text.body.slice(0, 200));

      if (text.format !== SourceChapterTextFormat.HTML) {
        throw new Error(`Expected HTML format, got ${text.format}`);
      }
      if (!text.body.startsWith("<p>")) {
        throw new Error("Expected HTML body to start with <p>");
      }
    }

    console.log("\n6b. Testing chapter numbers with interleaved extras ('MQoG' - The Angel Next Door)...");
    const angelChapters = (await novelSource.getChapters("MQoG")).slice().reverse();
    const angelNumber = (prefix: string) =>
      angelChapters.find((c) => c.title?.startsWith(prefix))?.number;
    console.log("Chapter 7 ->", angelNumber("Chapter 7:"), "| Chapter 8 ->", angelNumber("Chapter 8:"), "| Chapter 266 ->", angelNumber("Chapter 266:"));
    if (angelNumber("Chapter 8:") !== 8 || angelNumber("Chapter 266:") !== 266) {
      throw new Error("Expected extras not to shift Angel Next Door chapter numbers");
    }

    console.log("\n7. Testing getChapterText ('yOr4', '8vWpYA')...");
    const text2 = await novelSource.getChapterText("yOr4", "8vWpYA");
    console.log("yOr4 chapter 893 text preview:", text2.body.slice(0, 150), "...");

    console.log("\n8. Testing getSearchFilters...");
    const filters = await novelSource.getSearchFilters();
    console.log("Filters count:", filters.length);

    console.log("\n9. Testing getSettingsPage & onFormSubmitted...");
    const settings = await novelSource.getSettingsPage();
    console.log("Settings sections count:", settings?.sections.length);
    await novelSource.onFormSubmitted("test", {
      pref_18_mode: true,
      pref_exclude_genres: { include: ["10"] },
    });
    const updatedSettings = await novelSource.getSettingsPage();
    const toggleView = (updatedSettings?.sections[0].views[0] as any).toggle.props;
    console.log("Updated adult toggle currentValue:", toggleView.currentValue);

    console.log("\n==================================================");
    console.log("Testing Novel Fire...");
    console.log("==================================================");
    const novelFire = emulate(NovelFire);

    console.log("\n1. Testing getHomePage & getItemList...");
    const fireHome = await novelFire.getHomePage();
    for (const feed of fireHome.feeds) {
      const list = await novelFire.getItemList({ key: feed.id }, 1);
      console.log(` - ${feed.id}: ${list.items.length} items`);
      if (list.items.length === 0) {
        throw new Error(`Expected items in Novel Fire feed '${feed.id}'`);
      }
    }

    console.log("\n2. Testing getSearchResults (keyword & filters)...");
    const fireSearch = await novelFire.getSearchResults({ query: "shadow slave" }, 1);
    console.log("Keyword hits:", fireSearch.items.map((i) => i.title).slice(0, 3));
    if (fireSearch.items[0]?.id !== "shadow-slave") {
      throw new Error(`Expected 'shadow-slave' as top keyword hit, got '${fireSearch.items[0]?.id}'`);
    }
    const fireFiltered = await novelFire.getSearchResults(
      { filters: { genres: { include: ["3"], exclude: [] }, status: "1" } },
      1
    );
    console.log("Filtered hits:", fireFiltered.items.length);

    console.log("\n3. Testing getContent ('mother-of-learning')...");
    const fireContent = await novelFire.getContent("mother-of-learning");
    console.log("Content:", {
      title: fireContent.title,
      status: fireContent.status,
      genres: fireContent.genres?.map((g) => g.title),
      credits: fireContent.credits,
    });
    if (fireContent.contentType !== ContentType.NOVEL) {
      throw new Error(`Expected ContentType.NOVEL, got ${fireContent.contentType}`);
    }

    console.log("\n4. Testing getChapters ('mother-of-learning')...");
    const fireChapters = await novelFire.getChapters("mother-of-learning");
    console.log("Chapters count:", fireChapters.length, "latest:", fireChapters[0]?.title);
    if (fireChapters.length <= 100) {
      throw new Error("Expected chapters from more than one chapter list page");
    }

    console.log("\n5. Testing getChapterText ('shadow-slave', 'chapter-1')...");
    const fireText = await novelFire.getChapterText("shadow-slave", "chapter-1");
    console.log("First 150 chars:", fireText.body.slice(0, 150));
    if (!fireText.body.startsWith("<p>") || /<iframe|<div/i.test(fireText.body)) {
      throw new Error("Expected clean paragraph HTML without ads");
    }

    console.log("\n==================================================");
    console.log("Testing LNORI...");
    console.log("==================================================");
    const lnori = emulate(LNORI);

    console.log("\n1. Testing getHomePage & getItemList...");
    const lnoriHome = await lnori.getHomePage();
    for (const feed of lnoriHome.feeds) {
      const list = await lnori.getItemList({ key: feed.id }, 1);
      console.log(` - ${feed.id}: ${list.items.length} items`);
      if (list.items.length === 0) {
        throw new Error(`Expected items in LNORI feed '${feed.id}'`);
      }
    }

    console.log("\n2. Testing getSearchResults (keyword & filters)...");
    const lnoriSearch = await lnori.getSearchResults({ query: "overlord" }, 1);
    console.log("Keyword hits:", lnoriSearch.items.map((i) => i.title).slice(0, 3));
    if (lnoriSearch.items[0]?.id !== "2405/overlord") {
      throw new Error(`Expected '2405/overlord' as top keyword hit, got '${lnoriSearch.items[0]?.id}'`);
    }
    const lnoriFiltered = await lnori.getSearchResults(
      { filters: { genres: { include: ["isekai"], exclude: ["romance"] }, min_volumes: "10" } },
      1
    );
    console.log("Filtered hits:", lnoriFiltered.items.length);
    if (lnoriFiltered.items.length === 0) {
      throw new Error("Expected filtered LNORI results");
    }

    console.log("\n3. Testing getContent ('2405/overlord')...");
    const lnoriContent = await lnori.getContent("2405/overlord");
    console.log("Content:", {
      title: lnoriContent.title,
      genres: lnoriContent.genres?.length,
      credits: lnoriContent.credits,
    });
    if (lnoriContent.contentType !== ContentType.NOVEL) {
      throw new Error(`Expected ContentType.NOVEL, got ${lnoriContent.contentType}`);
    }

    console.log("\n4. Testing getChapters ('2405/overlord')...");
    const lnoriChapters = await lnori.getChapters("2405/overlord");
    console.log("Volumes:", lnoriChapters.length, "latest:", lnoriChapters[0]?.title);
    if (lnoriChapters.at(-1)?.id !== "9177/overlord-vol-1-the-undead-king") {
      throw new Error("Expected Volume 1 as the oldest chapter");
    }
    const alyaVolumes = await lnori.getChapters("11978/alya-sometimes-hides-her-feelings-in-russian");
    if (!alyaVolumes.some((c) => c.volume === 4.5)) {
      throw new Error("Expected Alya Volume 4.5 to keep its half-volume number");
    }

    console.log("\n5. Testing getChapterText (Overlord Volume 1)...");
    const lnoriText = await lnori.getChapterText("2405/overlord", "9177/overlord-vol-1-the-undead-king");
    console.log("First 120 chars:", lnoriText.body.slice(0, 120));
    if (!lnoriText.body.startsWith("<h2>Prologue</h2>") || /<div|<span|<img/i.test(lnoriText.body)) {
      throw new Error("Expected clean volume HTML starting at the Prologue");
    }

    console.log("\n==================================================");
    console.log("Testing Chikari (Novels)...");
    console.log("==================================================");
    const chikari = emulate(ChikariNovels);
    // The emulator shares one ObjectStore across runners, and Atsumaru Novels enables Adult Mode above.
    await chikari.onFormSubmitted("reset", {
      pref_18_mode: false,
      pref_exclude_genres: { include: [], exclude: [] },
    });

    console.log("\n1. Testing getHomePage & getItemList...");
    const chikariHome = await chikari.getHomePage();
    for (const feed of chikariHome.feeds) {
      const list = await chikari.getItemList({ key: feed.id }, 1);
      console.log(` - ${feed.id}: ${list.items.length} items`);
      if (list.items.length === 0) {
        throw new Error(`Expected items in Chikari feed '${feed.id}'`);
      }
    }

    console.log("\n2. Testing getSearchResults (keyword & filters)...");
    const chikariSearch = await chikari.getSearchResults({ query: "shadow slave" }, 1);
    console.log("Keyword hits:", chikariSearch.items.map((i) => i.title).slice(0, 3));
    if (!chikariSearch.items.some((i) => i.id === "shadow-slave")) {
      throw new Error("Expected 'shadow-slave' in Chikari keyword results");
    }
    const chikariFiltered = await chikari.getSearchResults(
      { filters: { genres: { include: ["action"], exclude: ["romance"] }, status: { include: ["completed"] } } },
      1
    );
    console.log("Filtered hits:", chikariFiltered.items.length, "total:", chikariFiltered.total);
    if (chikariFiltered.items.length === 0) {
      throw new Error("Expected filtered Chikari results");
    }
    const chikariFilters = await chikari.getSearchFilters();
    console.log("Filters:", chikariFilters.map((f) => f.id));

    console.log("\n3. Testing Adult Mode shows only 18+ titles...");
    await chikari.onFormSubmitted("test", { pref_18_mode: true });
    const adultList = await chikari.getItemList({ key: "popular" }, 1);
    await chikari.onFormSubmitted("test", { pref_18_mode: false });
    console.log("Adult feed items:", adultList.items.length);
    if (adultList.items.length === 0 || adultList.items.some((i) => i.rating !== ContentRating.MATURE)) {
      throw new Error("Expected only mature items in Adult Mode");
    }

    console.log("\n4. Testing getContent ('shadow-slave')...");
    const chikariContent = await chikari.getContent("shadow-slave");
    console.log("Content:", {
      title: chikariContent.title,
      status: chikariContent.status,
      genres: chikariContent.genres?.map((g) => g.title),
      credits: chikariContent.credits,
    });
    if (chikariContent.contentType !== ContentType.NOVEL) {
      throw new Error(`Expected ContentType.NOVEL, got ${chikariContent.contentType}`);
    }

    console.log("\n5. Testing getChapters ('shadow-slave')...");
    const chikariChapters = await chikari.getChapters("shadow-slave");
    console.log("Chapters count:", chikariChapters.length, "latest:", chikariChapters[0]?.title);
    if (chikariChapters.length <= 500) {
      throw new Error("Expected chapters from more than one chapter list page");
    }
    if (chikariChapters.at(-1)?.id !== "1") {
      throw new Error("Expected chapter 1 as the oldest chapter");
    }
    const academyChapters = await chikari.getChapters(
      "i-became-the-student-council-president-of-academy-city"
    );
    const numberOf = (id: string) => academyChapters.find((c) => c.id === id)?.number;
    console.log("Academy City #170 ->", numberOf("170"), "| #6 ->", numberOf("6"));
    if (numberOf("170") !== 130 || numberOf("6") !== 5.1) {
      throw new Error("Expected chapter numbers to come from titles, not site positions");
    }

    console.log("\n6. Testing getChapterText ('shadow-slave', '1')...");
    const chikariText = await chikari.getChapterText("shadow-slave", "1");
    console.log("First 150 chars:", chikariText.body.slice(0, 150));
    if (chikariText.format !== SourceChapterTextFormat.HTML || !chikariText.body.startsWith("<p>")) {
      throw new Error("Expected paragraph HTML for Chikari chapter text");
    }

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
      chikariAdultPath.includes("type=manhua")
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
    if (bastardChapters.at(-1)?.id !== "1" || !bastardChapters.some((c) => c.number === 100.5)) {
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

    console.log("\n==================================================");
    console.log("Testing Lunar (Novels)...");
    console.log("==================================================");
    const lunar = wrapDelegateWithValidation(emulate(LunarX), "Lunar");

    console.log("\n1. Testing getHomePage & getItemList...");
    const lunarHome = await lunar.getHomePage();
    for (const feed of lunarHome.feeds) {
      const list = await lunar.getItemList({ key: feed.id }, 1);
      console.log(` - ${feed.id}: ${list.items.length} items`);
      if (list.items.length === 0) {
        throw new Error(`Expected items in Lunar feed '${feed.id}'`);
      }
    }

    console.log("\n2. Testing getSearchResults (keyword, filters & deep link)...");
    const lunarSearch = await lunar.getSearchResults({ query: "shadow slave" }, 1);
    console.log("Keyword hits:", lunarSearch.items.map((i) => i.title).slice(0, 3));
    if (!lunarSearch.items.some((i) => i.id === "shadow-slave")) {
      throw new Error("Expected 'shadow-slave' in Lunar keyword results");
    }
    const lunarFiltered = await lunar.getSearchResults(
      { filters: { genres: { include: ["fantasy"], exclude: ["romance"] }, status: "completed" } },
      1
    );
    console.log("Filtered hits:", lunarFiltered.items.length, "total:", lunarFiltered.total);
    if (lunarFiltered.items.length === 0) {
      throw new Error("Expected filtered Lunar results");
    }
    const lunarDeepLink = await lunar.getSearchResults(
      { query: "https://lunarx.to/novel/omniscient-readers-viewpoint/12" },
      1
    );
    if (lunarDeepLink.items[0]?.id !== "omniscient-readers-viewpoint") {
      throw new Error("Expected deep link to resolve to ORV");
    }

    console.log("\n3. Testing getContent (mirrored-only and database novels)...");
    const orv = await lunar.getContent("omniscient-readers-viewpoint");
    const reverend = await lunar.getContent("reverend-insanity");
    console.log("ORV:", { title: orv.title, status: orv.status, genres: orv.genres?.length });
    console.log("Reverend Insanity:", { title: reverend.title, credits: reverend.credits, themes: reverend.properties?.[0]?.tags.length });
    if (orv.contentType !== ContentType.NOVEL || reverend.contentType !== ContentType.NOVEL) {
      throw new Error("Expected ContentType.NOVEL for Lunar novels");
    }

    console.log("\n4. Testing getChapters & getChapterText on ORV...");
    const orvChapters = await lunar.getChapters("omniscient-readers-viewpoint");
    const orvFirst = orvChapters.at(-1);
    console.log("Chapters:", orvChapters.length, "| oldest:", orvFirst?.id, orvFirst?.number, orvFirst?.title);
    if (orvChapters.length < 500 || orvFirst?.id !== "1" || orvFirst?.number !== 0) {
      throw new Error("Expected ORV chapters oldest-last, starting at id 1 / Chapter 0");
    }
    if (orvChapters.some((c) => c.isLocked)) {
      throw new Error("Expected no locked ORV chapters");
    }
    const orvText = await lunar.getChapterText("omniscient-readers-viewpoint", "1");
    console.log("First 120 chars:", orvText.body.slice(0, 120));
    if (!orvText.body.startsWith("<p>Prologue")) {
      throw new Error("Expected ORV chapter 1 to start with the Prologue paragraph");
    }

    console.log("\n5. Testing unauthenticated chapter access on Reverend Insanity...");
    const reverendChapters = await lunar.getChapters("reverend-insanity");
    console.log("Chapters:", reverendChapters.length, "| oldest:", reverendChapters.at(-1)?.title);
    if (reverendChapters.length < 2000) {
      throw new Error("Expected over 2000 Reverend Insanity chapters");
    }
    if (reverendChapters.some((c) => c.isLocked)) {
      throw new Error("Expected no chapters marked locked");
    }
    const reverendText = await lunar.getChapterText("reverend-insanity", "1");
    console.log("First 120 chars:", reverendText.body.slice(0, 120));
    if (!reverendText.body.startsWith("<p>") || reverendText.body.length < 100) {
      throw new Error("Expected Reverend Insanity chapter 1 to return readable HTML text");
    }

    console.log("\n6. Testing unauthenticated chapter access on Shadow Slave...");
    const shadowChapters = await lunar.getChapters("shadow-slave");
    console.log("Chapters:", shadowChapters.length, "| oldest:", shadowChapters.at(-1)?.title);
    if (shadowChapters.length < 3000) {
      throw new Error("Expected over 3000 Shadow Slave chapters");
    }
    const shadowText = await lunar.getChapterText("shadow-slave", "1");
    console.log("First 120 chars:", shadowText.body.slice(0, 120));
    if (!shadowText.body.startsWith("<p>") || shadowText.body.length < 100) {
      throw new Error("Expected Shadow Slave chapter 1 to return readable HTML text");
    }

    console.log("\n7. Testing a novel with volumes only (The Devil is a Part-Timer!)...");
    const devilSearch = await lunar.getSearchResults({ query: "the devil is a part timer" }, 1);
    console.log("Devil search hits:", devilSearch.items.map((i) => i.title).slice(0, 3));
    if (!devilSearch.items.some((i) => i.id === "the-devil-is-a-part-timer")) {
      throw new Error("Expected 'the-devil-is-a-part-timer' in keyword search hits");
    }
    const devilContent = await lunar.getContent("the-devil-is-a-part-timer");
    console.log("Devil details:", devilContent.title, "| volumes:", devilContent.additionalDetails?.["Volumes"]);
    if (devilContent.title !== "The Devil is a Part-Timer!" || devilContent.additionalDetails?.["Volumes"] !== "21") {
      throw new Error("Expected 21 volumes in Devil details");
    }
    const devilChapters = await lunar.getChapters("the-devil-is-a-part-timer");
    console.log("Devil volumes count:", devilChapters.length, "| latest:", devilChapters[0]?.title, "| oldest:", devilChapters.at(-1)?.title);
    if (devilChapters.length !== 21 || devilChapters[0]?.id !== "vol-21" || devilChapters[0]?.volume !== 21) {
      throw new Error("Expected 21 volumes for The Devil is a Part-Timer!");
    }
    try {
      await lunar.getChapterText("the-devil-is-a-part-timer", "vol-1");
      throw new Error("Expected getChapterText to throw ChapterUnavailable for web-only volume");
    } catch (error: any) {
      console.log("Volume read message:", error?.message);
      if (error?.name !== "ChapterUnavailable") throw error;
    }

    console.log("\n8. Testing deep link & db chapters for The Villainess is the Heroine's Biggest Fan...");
    const villainessDeep = await lunar.getSearchResults(
      { query: "https://lunarx.to/novel/the-villainess-is-the-heroine-s-biggest-fan/143?lang=en" },
      1
    );
    console.log("Villainess deep link hits:", villainessDeep.items.map((i) => i.title));
    if (villainessDeep.items[0]?.id !== "the-villainess-is-the-heroine-s-biggest-fan") {
      throw new Error("Expected deep link to resolve 'the-villainess-is-the-heroine-s-biggest-fan'");
    }

    const villainessChapters = await lunar.getChapters("the-villainess-is-the-heroine-s-biggest-fan");
    console.log("Villainess chapters count:", villainessChapters.length, "| latest:", villainessChapters[0]?.title);
    if (villainessChapters.length !== 143 || villainessChapters[0]?.number !== 143) {
      throw new Error("Expected 143 chapters for The Villainess is the Heroine's Biggest Fan");
    }

    try {
      await lunar.getChapterText("the-villainess-is-the-heroine-s-biggest-fan", "143");
      throw new Error("Expected getChapterText to throw ChapterUnavailable for site-uploaded chapter");
    } catch (error: any) {
      console.log("Site-uploaded chapter message:", error?.message);
      if (error?.name !== "ChapterUnavailable") throw error;
    }

    console.log("\n==================================================");
    console.log("Testing NovelBuddy...");
    console.log("==================================================");
    const novelBuddy = wrapDelegateWithValidation(emulate(NovelBuddy), "NovelBuddy");

    console.log("\n1. Testing getHomePage & getItemList...");
    const buddyHome = await novelBuddy.getHomePage();
    for (const feed of buddyHome.feeds) {
      const list = await novelBuddy.getItemList({ key: feed.id }, 1);
      console.log(` - ${feed.id}: ${list.items.length} items`);
      if (list.items.length === 0) {
        throw new Error(`Expected items in NovelBuddy feed '${feed.id}'`);
      }
    }
    const buddyPage2 = await novelBuddy.getItemList({ key: "popular" }, 2);
    const buddyPage1 = await novelBuddy.getItemList({ key: "popular" }, 1);
    if (buddyPage2.items[0]?.id === buddyPage1.items[0]?.id) {
      throw new Error("Expected NovelBuddy page 2 to differ from page 1");
    }

    console.log("\n2. Testing getSearchResults (keyword, filters & deep link)...");
    const buddySearch = await novelBuddy.getSearchResults({ query: "shadow slave" }, 1);
    console.log("Keyword hits:", buddySearch.items.map((i) => i.title).slice(0, 3));
    if (buddySearch.items[0]?.id !== "shadow-slave") {
      throw new Error(`Expected 'shadow-slave' as top keyword hit, got '${buddySearch.items[0]?.id}'`);
    }
    const buddyFiltered = await novelBuddy.getSearchResults(
      { filters: { genres: { include: ["action"], exclude: ["romance"] }, status: "completed" } },
      1
    );
    console.log("Filtered hits:", buddyFiltered.items.length, "total:", buddyFiltered.total);
    if (buddyFiltered.items.length === 0) {
      throw new Error("Expected filtered NovelBuddy results");
    }
    const buddyDeepLink = await novelBuddy.getSearchResults(
      { query: "https://novelbuddy.me/shadow-slave/chapter-1-nightmare-begins" },
      1
    );
    if (buddyDeepLink.items[0]?.id !== "shadow-slave") {
      throw new Error("Expected NovelBuddy deep link to resolve to Shadow Slave");
    }

    console.log("\n3. Testing getContent ('shadow-slave')...");
    const buddyContent = await novelBuddy.getContent("shadow-slave");
    console.log("Content:", {
      title: buddyContent.title,
      status: buddyContent.status,
      genres: buddyContent.genres?.map((g) => g.title),
      credits: buddyContent.credits,
      summary: buddyContent.summary?.slice(0, 80),
    });
    if (buddyContent.contentType !== ContentType.NOVEL || /<[a-z]/i.test(buddyContent.summary ?? "")) {
      throw new Error("Expected a NOVEL with a plain-text summary");
    }

    console.log("\n4. Testing getChapters ('shadow-slave' & 'infinite-mana-in-the-apocalypse')...");
    const buddyChapters = await novelBuddy.getChapters("shadow-slave");
    const buddyOldest = buddyChapters.at(-1);
    console.log("Chapters:", buddyChapters.length, "| latest:", buddyChapters[0]?.title, "| oldest:", buddyOldest?.id, buddyOldest?.number);
    if (buddyChapters.length < 3200 || buddyOldest?.number !== 1) {
      throw new Error("Expected over 3200 Shadow Slave chapters, oldest-last starting at Chapter 1");
    }
    const manaChapters = await novelBuddy.getChapters("infinite-mana-in-the-apocalypse");
    console.log("Infinite Mana chapters:", manaChapters.length);
    if (manaChapters.length < 5000) {
      throw new Error("Expected the full chapter list for a 5000+ chapter novel");
    }

    console.log("\n5. Testing getChapterText (Shadow Slave chapter 1)...");
    const buddyText = await novelBuddy.getChapterText("shadow-slave", buddyOldest!.id);
    console.log("First 120 chars:", buddyText.body.slice(0, 120));
    if (!buddyText.body.startsWith("<p>A frail-looking") || /<div|<script/i.test(buddyText.body)) {
      throw new Error("Expected clean paragraph HTML for NovelBuddy chapter text");
    }

    console.log("\n==================================================");
    console.log("Testing Novel Archive...");
    console.log("==================================================");
    const novelArchive = wrapDelegateWithValidation(emulate(NovelArchive), "Novel Archive");
    const shadowSlaveId = "69faa859a5f4c7d1b734d496";

    console.log("\n1. Testing getHomePage & getItemList...");
    const archiveHome = await novelArchive.getHomePage();
    for (const feed of archiveHome.feeds) {
      const list = await novelArchive.getItemList({ key: feed.id }, 1);
      console.log(` - ${feed.id}: ${list.items.length} items (last page: ${list.isLastPage})`);
      if (list.items.length === 0) {
        throw new Error(`Expected items in Novel Archive feed '${feed.id}'`);
      }
    }

    console.log("\n2. Testing getSearchResults (keyword, filters & deep link)...");
    const archiveSearch = await novelArchive.getSearchResults({ query: "shadow slave" }, 1);
    console.log("Keyword hits:", archiveSearch.items.map((i) => i.title).slice(0, 3));
    if (archiveSearch.items[0]?.id !== shadowSlaveId) {
      throw new Error(`Expected Shadow Slave as top keyword hit, got '${archiveSearch.items[0]?.title}'`);
    }
    const archiveFiltered = await novelArchive.getSearchResults(
      { filters: { genres: { include: ["action", "fantasy"], exclude: ["romance"] }, status: "completed" } },
      1
    );
    console.log("Filtered hits:", archiveFiltered.items.length, "total:", archiveFiltered.total);
    if (archiveFiltered.items.length === 0) {
      throw new Error("Expected filtered Novel Archive results");
    }
    const archiveFilters = await novelArchive.getSearchFilters();
    console.log("Filters:", archiveFilters.map((f) => f.id));
    const archiveDeepLink = await novelArchive.getSearchResults(
      { query: `https://novelarchive.cc/reader?novel=${shadowSlaveId}&chapter=12` },
      1
    );
    if (archiveDeepLink.items[0]?.id !== shadowSlaveId) {
      throw new Error("Expected Novel Archive deep link to resolve to Shadow Slave");
    }

    console.log("\n3. Testing getContent (Shadow Slave)...");
    const archiveContent = await novelArchive.getContent(shadowSlaveId);
    console.log("Content:", {
      title: archiveContent.title,
      status: archiveContent.status,
      coverImage: archiveContent.coverImage,
      genres: archiveContent.genres?.map((g) => g.title),
      credits: archiveContent.credits,
    });
    if (archiveContent.contentType !== ContentType.NOVEL || !archiveContent.coverImage.startsWith("https://")) {
      throw new Error("Expected a NOVEL with an absolute cover URL");
    }

    console.log("\n4. Testing getChapters (Shadow Slave)...");
    const archiveChapters = await novelArchive.getChapters(shadowSlaveId);
    const archiveOldest = archiveChapters.at(-1);
    console.log("Chapters:", archiveChapters.length, "| latest:", archiveChapters[0]?.title, "| oldest:", archiveOldest?.id, archiveOldest?.number);
    if (archiveChapters.length < 3200 || archiveOldest?.id !== "1" || archiveOldest?.number !== 1) {
      throw new Error("Expected over 3200 Shadow Slave chapters, oldest-last starting at chapter 1");
    }

    console.log("\n5. Testing getChapterText (Shadow Slave chapter 1)...");
    const archiveText = await novelArchive.getChapterText(shadowSlaveId, "1");
    console.log("First 120 chars:", archiveText.body.slice(0, 120));
    if (!archiveText.body.startsWith("<p>A frail-looking")) {
      throw new Error("Expected paragraph HTML for Novel Archive chapter text");
    }

    console.log("\n==================================================");
    console.log("Testing Toonkotsu...");
    console.log("==================================================");
    const toonkotsu = emulate(Toonkotsu);

    console.log("\n1. Testing HMAC and reader signatures against node:crypto...");
    const hmacKey = randomBytes(32);
    const hmacMessage = Buffer.from("1700000000000.nonce./api/manga/chapter/1");
    const expectedHmac = createHmac("sha256", hmacKey).update(hmacMessage).digest();
    if (!Buffer.from(hmacSha256(hmacKey, hmacMessage)).equals(expectedHmac)) {
      throw new Error("Expected HMAC-SHA256 to match node:crypto");
    }
    const longKey = randomBytes(100);
    if (
      !Buffer.from(hmacSha256(longKey, hmacMessage)).equals(
        createHmac("sha256", longKey).update(hmacMessage).digest()
      )
    ) {
      throw new Error("Expected HMAC-SHA256 to hash keys longer than a block");
    }
    const readerKey = { key: Uint8Array.from(hmacKey), offset: 0 };
    const signature = signReaderPath(readerKey, "/api/manga/chapter/1");
    const [version, time, nonce, mac] = signature.split(".");
    const expectedMac = encodeBase64Url(
      createHmac("sha256", hmacKey).update(`${time}.${nonce}./api/manga/chapter/1`).digest()
    ).slice(0, 32);
    console.log("Signature:", signature);
    if (version !== "v1" || mac !== expectedMac || decodeBase64Url(nonce).length !== 12) {
      throw new Error("Expected a v1 reader signature over time, nonce and path");
    }

    console.log("\n2. Testing AES-CTR page decryption against node:crypto...");
    for (const keyLength of [16, 24, 32]) {
      const pageKey = randomBytes(keyLength);
      const pageNonce = randomBytes(12);
      const plain = randomBytes(100_003);
      const iv = Buffer.concat([pageNonce.subarray(0, 8), Buffer.alloc(8)]);
      const cipher = createCipheriv(`aes-${keyLength * 8}-ctr`, pageKey, iv);
      const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
      const decrypted = decryptPage(encrypted, pageKey, pageNonce.subarray(0, 8));
      if (!Buffer.from(decrypted).equals(plain)) {
        throw new Error(`Expected AES-${keyLength * 8}-CTR decryption to match node:crypto`);
      }
    }

    console.log("\n3. Testing wrapped page keys and the decrypting image interceptor...");
    const pageKey = randomBytes(16);
    const pageNonce = randomBytes(12);
    const nonceText = encodeBase64Url(pageNonce);
    const mask = createHmac("sha256", hmacKey).update(`page.${nonceText}`).digest();
    const wrappedKey = encodeBase64Url(pageKey.map((b, i) => b ^ mask[i % mask.length]));
    const pages = parseChapterPages(
      {
        wrap: "v1",
        chapter: { pages: [{ src: "/p/1.webp", k: wrappedKey, n: nonceText }, { src: "//cdn.x/2.png" }] },
      },
      readerKey
    );
    console.log("Pages:", pages);
    if (
      pages[0].url !== "https://toonkotsu.com/p/1.webp" ||
      pages[0].context?.[PAGE_KEY] !== encodeBase64Url(pageKey) ||
      pages[1].url !== "https://cdn.x/2.png" ||
      pages[1].context
    ) {
      throw new Error("Expected unwrapped page keys and absolute page URLs");
    }
    const image = randomBytes(5000);
    const imageCipher = createCipheriv(
      "aes-128-ctr",
      pageKey,
      Buffer.concat([pageNonce.subarray(0, 8), Buffer.alloc(8)])
    );
    const encryptedImage = Buffer.concat([imageCipher.update(image), imageCipher.final()]);
    const server = createServer((_req, res) => res.end(encryptedImage));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as { port: number }).port;
      const imageResponse = await (toonkotsu as any).client.get(
        `http://127.0.0.1:${port}/p/1.webp`,
        { context: pages[0].context }
      );
      if (!Buffer.from(await imageResponse.bytes()).equals(image)) {
        throw new Error("Expected the image interceptor to decrypt the page");
      }
    } finally {
      server.close();
    }

    console.log("\n4. Testing parsers with fixture data...");
    if (
      parseToonkotsuLink("https://toonkotsu.com/title/a1b2c-some-title") !== "a1b2c" ||
      parseToonkotsuLink("https://toonkotsu.com/title/12345") !== null
    ) {
      throw new Error("Expected Toonkotsu title links to resolve to their id");
    }
    const fixture = {
      series: {
        id: 1,
        hid: "a1b2c",
        slug: "some-title",
        title: "Tom &amp; Jerry",
        titles: { english: "Tom & Jerry", romaji: "Tomu" },
        type: "Manhwa",
        tags: ["Action", "Ecchi", "Seinen", "Time Travel"],
        status: "Complete",
        cover: "/covers/a1b2c/460.webp",
        score: 87,
        authors: ["Someone"],
      },
      chapters: [
        {
          id: 12,
          n: 2,
          label: "Chapter 2: The Return [Group A]",
          at: 1700000000000,
          alts: [
            { id: 13, label: "Ch. 2", group: { slug: "group-b", name: "Group B" } },
            { id: 14, label: "Chapter 2", group: { slug: "group-a", name: "Group A" } },
            { id: 15, label: "Chapter 2", group: { slug: "group-b", name: "GROUP B" } },
          ],
        },
        { id: 11, n: 1, vol: "1", label: "Chapter 1" },
      ],
    };
    const facets = { genres: [{ name: "Action" }, { name: "Ecchi" }, { name: "Time Travel", category: "Theme: Plot" }] };
    const parsedContent = toToonkotsuContent(fixture, "a1b2c", facets);
    console.log("Content:", {
      title: parsedContent.title,
      rating: parsedContent.rating,
      status: parsedContent.status,
      genres: parsedContent.genres?.map((g) => g.title),
      properties: parsedContent.properties?.map((p) => p.id),
      coverImage: parsedContent.coverImage,
    });
    if (
      parsedContent.title !== "Tom & Jerry" ||
      parsedContent.rating !== ContentRating.SUGGESTIVE ||
      parsedContent.contentType !== ContentType.MANHWA ||
      parsedContent.coverImage !== "https://toonkotsu.com/covers/a1b2c/720.webp" ||
      parsedContent.webUrl !== "https://toonkotsu.com/title/a1b2c-some-title" ||
      parsedContent.genres?.length !== 2 ||
      parsedContent.properties?.map((p) => p.id).join() !== "themes,demographics"
    ) {
      throw new Error("Expected parsed Toonkotsu content details");
    }
    const parsedChapters = toToonkotsuChapters(fixture);
    console.log("Chapters:", parsedChapters.map(({ id, number, title, providers }) => ({ id, number, title, group: providers?.[0]?.name })));
    if (
      parsedChapters.map((c) => c.id).join() !== "12,13,11" ||
      parsedChapters[0].title !== "The Return" ||
      parsedChapters[0].providers?.[0]?.name !== "Group A" ||
      parsedChapters[1].title !== undefined ||
      parsedChapters[2].volume !== 1
    ) {
      throw new Error("Expected one Toonkotsu chapter per group, without same-group mirrors");
    }

    console.log("\n5. Testing live catalogue access...");
    try {
      const toonkotsuHome = await toonkotsu.getHomePage();
      const latest = await toonkotsu.getItemList({ key: toonkotsuHome.feeds[0].id }, 1);
      console.log("First feed items:", latest.items.length);
    } catch (error) {
      if (!(error instanceof CloudflareError)) throw error;
      console.log("Skipping live Toonkotsu tests (Cloudflare challenge):", error.resolutionURL);
    }

    console.log("\n==================================================");
    console.log("Testing yaoi.me...");
    console.log("==================================================");

    console.log("\n1. Testing parsers...");
    if (
      parseYaoiMeLink("https://yaoi.me/series/3579/ten-count") !== "3579" ||
      parseYaoiMeLink("https://yaoi.me/chapter/183541/5169709") !== "chapter:183541/5169709"
    ) {
      throw new Error("Expected yaoi.me series and chapter links to resolve");
    }
    const ch48 = parseChapterLabel("Vol.6 Ch.48");
    const extra = parseChapterLabel("Kurose and Shirotani");
    if (ch48.number !== 48 || ch48.volume !== 6 || extra.number !== 0) {
      throw new Error("Expected yaoi.me chapter labels to parse volume and number");
    }
    const flight = JSON.stringify({
      groups: [
        {
          key: "n:1",
          label: "Vol.1 Ch.1",
          num: 1,
          createdAt: 1519516800000,
          variants: [{ id: 5169709, s: 183541, lang: "en" }],
        },
        {
          key: "n:2",
          label: "Vol.1 Ch.2",
          num: 2,
          createdAt: 1519603200000,
          variants: [
            { id: 11, s: 183541, lang: "en" },
            { id: 12, s: 3579, lang: "en" },
          ],
        },
      ],
      sources: { "183541": "kagane", "3579": "mangaball" },
    });
    const flightHtml = `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`;
    const parsedGroups = parseYaoiMeChapters(flightHtml);
    if (
      parsedGroups.length !== 3 ||
      parsedGroups[0].id !== "183541/5169709" ||
      parsedGroups[0].number !== 1 ||
      parsedGroups[1].providers?.[0]?.name !== "Kagane" ||
      parsedGroups[2].providers?.[0]?.name !== "Mangaball"
    ) {
      throw new Error("Expected yaoi.me chapter groups from the page payload");
    }
    const sealScript =
      '"use strict";e.s(["sealKey",0,()=>[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32]])';
    if (parseSealKey(sealScript) !== "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20") {
      throw new Error("Expected yaoi.me sealKey bytes from the reader script");
    }

    console.log("\n1b. Testing AES-GCM page-list decryption...");
    emulate(YaoiMe);
    const seed = randomBytes(32);
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const plain = Buffer.from(JSON.stringify({ p: ["hash-one", "hash-two"] }));
    const aesKey = createHash("sha256").update(Buffer.concat([seed, salt])).digest();
    const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const sealed = Buffer.concat([salt, iv, encrypted, cipher.getAuthTag()]).toString("base64url");
    const opened = aesGcmDecrypt(aesKey, iv, Buffer.concat([encrypted, cipher.getAuthTag()]));
    if (Buffer.from(opened).toString() !== plain.toString()) {
      throw new Error("Expected AES-GCM decryption to match node:crypto");
    }
    const fromList = decryptPageList(sealed, seed.toString("hex"));
    if (fromList.join() !== "hash-one,hash-two") {
      throw new Error(`Expected sealed page hashes, got ${fromList.join()}`);
    }

    console.log("\n2. Testing live catalogue access...");
    try {
      const yaoime = wrapDelegateWithValidation(emulate(YaoiMe), "yaoi.me");
      const yaoiHome = await yaoime.getHomePage();
      for (const feed of yaoiHome.feeds) {
        const list = await yaoime.getItemList({ key: feed.id }, 1);
        console.log(` - ${feed.id}: ${list.items.length} items`);
        if (list.items.length === 0) {
          throw new Error(`Expected items in yaoi.me feed '${feed.id}'`);
        }
      }

      console.log("\n3. Testing getSearchResults (keyword, filters & deep link)...");
      const yaoiSearch = await yaoime.getSearchResults({ query: "ten count" }, 1);
      console.log("Keyword hits:", yaoiSearch.items.map((i) => i.title).slice(0, 3));
      if (!yaoiSearch.items.some((i) => i.id === "3579")) {
        throw new Error("Expected '3579' (Ten Count) in yaoi.me keyword results");
      }
      const yaoiFiltered = await yaoime.getSearchResults(
        { filters: { types: { include: ["manga"] }, status: { include: ["completed"] } } },
        1
      );
      console.log("Filtered hits:", yaoiFiltered.items.length);
      if (yaoiFiltered.items.length === 0) {
        throw new Error("Expected filtered yaoi.me results");
      }
      const yaoiDeepLink = await yaoime.getSearchResults(
        { query: "https://yaoi.me/series/3579/ten-count" },
        1
      );
      if (yaoiDeepLink.items[0]?.id !== "3579") {
        throw new Error("Expected yaoi.me deep link to resolve to Ten Count");
      }

      console.log("\n4. Testing getContent ('3579' - Ten Count)...");
      const tenCount = await yaoime.getContent("3579");
      console.log("Content:", {
        title: tenCount.title,
        contentType: tenCount.contentType,
        status: tenCount.status,
        genres: tenCount.genres?.map((g) => g.title),
        credits: tenCount.credits,
      });
      if (tenCount.title !== "Ten Count" || tenCount.contentType !== ContentType.MANGA) {
        throw new Error("Expected Ten Count as a MANGA");
      }

      console.log("\n5. Testing getChapters & getChapterPages...");
      const tenCountChapters = await yaoime.getChapters("3579");
      const numbered = tenCountChapters.find((c) => c.number === 1);
      console.log(
        "Chapters:",
        tenCountChapters.length,
        "| latest:",
        tenCountChapters[0]?.title ?? tenCountChapters[0]?.number,
        "| chapter 1:",
        numbered?.id
      );
      if (tenCountChapters.length < 40 || !numbered) {
        throw new Error("Expected Ten Count chapters including chapter 1");
      }
      const yaoiPages = await yaoime.getChapterPages("3579", numbered.id);
      console.log("Pages:", yaoiPages.length, "| first:", yaoiPages[0]?.url);
      if (yaoiPages.length === 0 || !yaoiPages[0]?.url?.includes("/i/p/")) {
        throw new Error("Expected yaoi.me chapter pages");
      }
    } catch (error) {
      if (!(error instanceof CloudflareError)) throw error;
      console.log("Skipping live yaoi.me tests (Cloudflare challenge):", error.resolutionURL);
    }

    console.log("\n==================================================");
    console.log("Testing Madokami...");
    console.log("==================================================");

    console.log("\n1. Testing offline helpers...");
    const numbers = (file: string, title = "Berserk") => parseChapterNumbers(file, title);
    const expectNumbers = (file: string, number: number, volume?: number) => {
      const parsed = numbers(file);
      if (parsed.number !== number || parsed.volume !== volume) {
        throw new Error(`Expected '${file}' -> ${number}/v${volume}, got ${parsed.number}/v${parsed.volume}`);
      }
    };
    expectNumbers("Berserk v01 c001-008 (2003) [Digital].cbz", 8, 1);
    expectNumbers("Berserk c372 [Group].zip", 372);
    expectNumbers("Berserk v41.cbz", 41, 41);
    expectNumbers("Berserk Ch. 12.5.cbz", 12.5);
    expectNumbers("Berserk (Special) [Group].cbz", -1);
    if (base64Encode("user:pässword") !== "dXNlcjpww6Rzc3dvcmQ=") {
      throw new Error("Expected UTF-8 base64 encoding of credentials");
    }
    if (detailsPath("/Manga/B/BE/BERS/Berserk/!Extras/file.cbz") !== "/Manga/B/BE/BERS/Berserk") {
      throw new Error("Expected manga details path to stop at the series folder");
    }
    if (detailsPath("/Raws/Berserk/!Extras/!More") !== "/Raws/Berserk") {
      throw new Error("Expected raws details path to drop '!' sub-folders");
    }
    if (parseDate("2023-04-05 13:45")?.getHours() !== 13) {
      throw new Error("Expected absolute dates to parse in local time");
    }

    const madokamiUser = process.env.MADOKAMI_USERNAME;
    const madokamiPassword = process.env.MADOKAMI_PASSWORD;
    if (!madokamiUser || !madokamiPassword) {
      console.log("\nSkipping live Madokami tests (set MADOKAMI_USERNAME and MADOKAMI_PASSWORD).");
    } else {
      const madokami = wrapDelegateWithValidation(emulate(Madokami), "Madokami");

      console.log("\n2. Testing login...");
      await madokami.onFormSubmitted("account", { username: madokamiUser, password: madokamiPassword });
      const madokamiSettings = await madokami.getSettingsPage();
      console.log("Account footer:", madokamiSettings?.sections[0].footer);

      console.log("\n3. Testing getItemList (recent)...");
      const recent = await madokami.getItemList({ key: "recent" }, 1);
      console.log("Recent items:", recent.items.length, "| first:", recent.items[0]);
      if (recent.items.length === 0) {
        throw new Error("Expected items in the Madokami recent feed");
      }

      console.log("\n4. Testing getSearchResults ('berserk')...");
      const madokamiSearch = await madokami.getSearchResults({ query: "berserk" }, 1);
      console.log("Search hits:", madokamiSearch.items.map((i) => i.id).slice(0, 3));
      const berserk = madokamiSearch.items.find((i) => i.title === "Berserk");
      if (!berserk) {
        throw new Error("Expected 'Berserk' in Madokami search results");
      }

      console.log(`\n5. Testing getContent & getChapters ('${berserk.id}')...`);
      const berserkContent = await madokami.getContent(berserk.id);
      console.log("Content:", {
        title: berserkContent.title,
        coverImage: berserkContent.coverImage,
        status: berserkContent.status,
        credits: berserkContent.credits,
      });
      const berserkChapters = await madokami.getChapters(berserk.id);
      console.log("Chapters:", berserkChapters.length, "| latest:", berserkChapters[0]);
      if (berserkChapters.length === 0) {
        throw new Error("Expected Berserk chapters");
      }

      console.log("\n6. Testing getChapterPages...");
      const madokamiPages = await madokami.getChapterPages(berserk.id, berserkChapters[0].id);
      console.log("Pages:", madokamiPages.length, "| first:", madokamiPages[0]?.url);
      if (madokamiPages.length === 0) {
        throw new Error("Expected pages for the latest Berserk file");
      }
    }

    console.log("\nAll tests passed successfully for all runners!");
  } finally {
    clearInterval(keepAlive);
  }
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
