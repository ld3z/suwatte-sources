import emulate from "@suwatte/toolchain/emulator";
import { ContentType, SourceChapterTextFormat } from "@suwatte/toolchain";
import Atsumaru from "./src/sources/atsumaru";
import AtsumaruNovels from "./src/sources/atsumaru-novels";
import NovelFire from "./src/sources/novelfire";

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

    console.log("\nAll tests passed successfully for all runners!");
  } finally {
    clearInterval(keepAlive);
  }
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
