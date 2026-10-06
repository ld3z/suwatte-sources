import emulate from "@suwatte/toolchain/emulator";
import { ContentRating, ContentType, SourceChapterTextFormat } from "@suwatte/toolchain";
import Atsumaru from "./src/sources/atsumaru";
import AtsumaruNovels from "./src/sources/atsumaru-novels";
import NovelFire from "./src/sources/novelfire";
import LNORI from "./src/sources/lnori";
import Chikari from "./src/sources/chikari";

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

    console.log("\nAll tests passed successfully for all runners!");
  } finally {
    clearInterval(keepAlive);
  }
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
