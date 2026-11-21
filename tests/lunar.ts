import emulate from "@suwatte/toolchain/emulator";
import { ContentType } from "@suwatte/toolchain";
import LunarX from "../src/sources/lunarx";
import { wrapDelegateWithValidation } from "@suwatte/toolchain/validate";
import { runWhenDirect } from "./support";

export async function testLunar(): Promise<void> {
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
  if (orvChapters.length < 500 || orvFirst?.id !== "1" || (orvFirst?.number !== 0 && orvFirst?.number !== 1)) {
    throw new Error("Expected ORV chapters oldest-last, starting at id 1 / Chapter 0 or 1");
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
}

runWhenDirect(import.meta.url, testLunar);
