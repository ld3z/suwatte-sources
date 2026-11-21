import emulate from "@suwatte/toolchain/emulator";
import { ContentRating, ContentType, SourceChapterTextFormat } from "@suwatte/toolchain";
import Chikari from "../src/sources/chikari";
import ChikariNovels from "../src/sources/chikari-novels";
import { runWhenDirect } from "./support";

export async function testChikariNovels(): Promise<void> {
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
}

runWhenDirect(import.meta.url, testChikariNovels);
