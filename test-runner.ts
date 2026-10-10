import emulate from "@suwatte/toolchain/emulator";
import { ContentRating, ContentType, SourceChapterTextFormat } from "@suwatte/toolchain";
import Atsumaru from "./src/sources/atsumaru";
import AtsumaruNovels from "./src/sources/atsumaru-novels";
import NovelFire from "./src/sources/novelfire";
import LNORI from "./src/sources/lnori";
import Chikari from "./src/sources/chikari";
import LunarX from "./src/sources/lunarx";
import Madokami from "./src/sources/madokami";
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
    console.log("Testing Chikari...");
    console.log("==================================================");
    const chikari = emulate(Chikari);
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
