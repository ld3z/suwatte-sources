import emulate from "@suwatte/toolchain/emulator";
import { ContentType } from "@suwatte/toolchain";
import LNORI from "../src/sources/lnori";
import { runWhenDirect } from "./support";

export async function testLnori(): Promise<void> {
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
}

runWhenDirect(import.meta.url, testLnori);
