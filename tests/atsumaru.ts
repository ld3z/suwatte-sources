import emulate from "@suwatte/toolchain/emulator";
import Atsumaru from "../src/sources/atsumaru";
import { buildSearchPath as buildAtsumaruSearchPath } from "../src/sources/atsumaru/search";
import { Preferences as AtsumaruPreferences } from "../src/sources/atsumaru/settings";
import { runWhenDirect } from "./support";

export async function testAtsumaru(): Promise<void> {
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

  console.log("\n3b. Testing tag exclusion query building...");
  const atsumaruPrefs: AtsumaruPreferences = {
    showAdult: false,
    excludedGenres: ["9"],
    excludedTags: ["12", "34"],
    contentTypes: null,
    maxContentRating: "Erotica",
    minChapters: 0,
    officialOnly: false,
    hiddenKeywords: [],
  };
  const tagSearchPath = decodeURIComponent(buildAtsumaruSearchPath(
    {
      filters: {
        genres: { include: ["1"], exclude: ["7"] },
        tags: { include: ["12"], exclude: ["56"] },
      },
    } as any,
    1,
    atsumaruPrefs
  ));
  console.log("filter_by:", tagSearchPath);
  if (!tagSearchPath.includes("tagIds:!=[`56`,`34`]")) {
    throw new Error("Expected Atsumaru search to merge preference and filter tag exclusions");
  }
  if (!tagSearchPath.includes("tagIds:=[`12`]")) {
    throw new Error("Expected Atsumaru search to include the tags filter selection");
  }
  if (!tagSearchPath.includes("genreIds:!=[`7`,`9`]") || !tagSearchPath.includes("genreIds:=`1`")) {
    throw new Error("Expected Atsumaru search to merge preference and filter genre exclusions");
  }

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
}

runWhenDirect(import.meta.url, testAtsumaru);
