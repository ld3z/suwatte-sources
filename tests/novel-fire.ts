import emulate from "@suwatte/toolchain/emulator";
import { ContentType } from "@suwatte/toolchain";
import NovelFire from "../src/sources/novelfire";
import { runWhenDirect } from "./support";

export async function testNovelFire(): Promise<void> {
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
}

runWhenDirect(import.meta.url, testNovelFire);
