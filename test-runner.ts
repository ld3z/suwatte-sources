import emulate from "@suwatte/toolchain/emulator";
import Atsumaru from "./src/sources/atsumaru";

async function main() {
  const keepAlive = setInterval(() => {}, 1000);

  try {
    console.log("Emulating Atsumaru...");
    const source = emulate(Atsumaru);

    console.log("\n1. Testing getHomePage...");
    const home = await source.getHomePage();
    console.log("Feeds count:", home.feeds.length);
    for (const feed of home.feeds) {
      console.log(` - ${feed.id}: ${feed.title}`);
    }

    console.log("\n2. Testing getItemList (popular_daily)...");
    const popular = await source.getItemList({ key: "popular_daily" }, 1);
    console.log("Popular items count:", popular.items.length);
    const firstItem = popular.items[0];
    console.log("First item:", {
      id: firstItem.id,
      title: firstItem.title,
      coverImage: firstItem.coverImage,
      webUrl: firstItem.webUrl,
    });

    console.log("\n3. Testing getSearchResults ('swordmaster')...");
    const search = await source.getSearchResults({ query: "swordmaster" }, 1);
    console.log("Search hits count:", search.items.length, "total:", search.total);
    if (search.items.length > 0) {
      console.log("First hit:", {
        id: search.items[0].id,
        title: search.items[0].title,
        cover: search.items[0].coverImage,
      });
    }

    const targetId = firstItem.id;
    console.log(`\n4. Testing getContent ('${targetId}')...`);
    const content = await source.getContent(targetId);
    console.log("Content details:", {
      title: content.title,
      coverImage: content.coverImage,
      status: content.status,
      contentType: content.contentType,
      readingMode: content.readingMode,
      rating: content.rating,
      genres: content.genres?.slice(0, 3),
      credits: content.credits?.slice(0, 2),
      endpoints: content.endpoints,
    });

    console.log(`\n5. Testing getChapters ('${targetId}')...`);
    const chapters = await source.getChapters(targetId);
    console.log("Chapters count:", chapters.length);
    if (chapters.length > 0) {
      const ch = chapters[0];
      console.log("First chapter:", {
        id: ch.id,
        number: ch.number,
        title: ch.title,
        date: ch.date,
        providers: ch.providers,
      });

      console.log(`\n6. Testing getChapterPages ('${targetId}', '${ch.id}')...`);
      const pages = await source.getChapterPages(targetId, ch.id);
      console.log("Pages count:", pages.length);
      if (pages.length > 0) {
        console.log("First page URL:", pages[0].url);
      }
    }

    console.log("\n7. Testing getSearchFilters...");
    const filters = await source.getSearchFilters();
    console.log("Filters count:", filters.length);
    console.log("Filter titles:", filters.map((f) => f.title));

    console.log("\n8. Testing getSettingsPage & onFormSubmitted...");
    const settings = await source.getSettingsPage();
    console.log("Settings sections count:", settings?.sections.length);
    await source.onFormSubmitted("test", {
      pref_18_mode: true,
      pref_exclude_genres: { include: ["10"] },
    });
    const updatedSettings = await source.getSettingsPage();
    const toggleView = (updatedSettings?.sections[0].views[0] as any).toggle.props;
    console.log("Updated adult toggle currentValue:", toggleView.currentValue);

    console.log("\nAll tests passed successfully!");
  } finally {
    clearInterval(keepAlive);
  }
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
