import emulate from "@suwatte/toolchain/emulator";
import { ContentType, SourceChapterTextFormat } from "@suwatte/toolchain";
import AtsumaruNovels from "../src/sources/atsumaru-novels";
import { runWhenDirect } from "./support";

export async function testAtsumaruNovels(): Promise<void> {
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
}

runWhenDirect(import.meta.url, testAtsumaruNovels);
