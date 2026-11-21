import emulate from "@suwatte/toolchain/emulator";
import { ContentType } from "@suwatte/toolchain";
import NovelBuddy from "../src/sources/novelbuddy";
import { wrapDelegateWithValidation } from "@suwatte/toolchain/validate";
import { runWhenDirect } from "./support";

export async function testNovelBuddy(): Promise<void> {
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
}

runWhenDirect(import.meta.url, testNovelBuddy);
