import emulate from "@suwatte/toolchain/emulator";
import { ContentType } from "@suwatte/toolchain";
import NovelArchive from "../src/sources/novelarchive";
import { wrapDelegateWithValidation } from "@suwatte/toolchain/validate";
import { runWhenDirect } from "./support";

export async function testNovelArchive(): Promise<void> {
  console.log("\n==================================================");
  console.log("Testing Novel Archive...");
  console.log("==================================================");
  const novelArchive = wrapDelegateWithValidation(emulate(NovelArchive), "Novel Archive");
  const shadowSlaveId = "69faa859a5f4c7d1b734d496";

  try {
    console.log("\n1. Testing getHomePage & getItemList...");
    const archiveHome = await novelArchive.getHomePage();
    for (const feed of archiveHome.feeds) {
      const list = await novelArchive.getItemList({ key: feed.id }, 1);
      console.log(` - ${feed.id}: ${list.items.length} items (last page: ${list.isLastPage})`);
      if (list.items.length === 0) {
        throw new Error(`Expected items in Novel Archive feed '${feed.id}'`);
      }
    }

    console.log("\n2. Testing getSearchResults (keyword, filters & deep link)...");
    const archiveSearch = await novelArchive.getSearchResults({ query: "shadow slave" }, 1);
    console.log("Keyword hits:", archiveSearch.items.map((i) => i.title).slice(0, 3));
    if (archiveSearch.items[0]?.id !== shadowSlaveId) {
      throw new Error(`Expected Shadow Slave as top keyword hit, got '${archiveSearch.items[0]?.title}'`);
    }
    const archiveFiltered = await novelArchive.getSearchResults(
      { filters: { genres: { include: ["action", "fantasy"], exclude: ["romance"] }, status: "completed" } },
      1
    );
    console.log("Filtered hits:", archiveFiltered.items.length, "total:", archiveFiltered.total);
    if (archiveFiltered.items.length === 0) {
      throw new Error("Expected filtered Novel Archive results");
    }
    const archiveFilters = await novelArchive.getSearchFilters();
    console.log("Filters:", archiveFilters.map((f) => f.id));
    const archiveDeepLink = await novelArchive.getSearchResults(
      { query: `https://novelarchive.cc/reader?novel=${shadowSlaveId}&chapter=12` },
      1
    );
    if (archiveDeepLink.items[0]?.id !== shadowSlaveId) {
      throw new Error("Expected Novel Archive deep link to resolve to Shadow Slave");
    }

    console.log("\n3. Testing getContent (Shadow Slave)...");
    const archiveContent = await novelArchive.getContent(shadowSlaveId);
    console.log("Content:", {
      title: archiveContent.title,
      status: archiveContent.status,
      coverImage: archiveContent.coverImage,
      genres: archiveContent.genres?.map((g) => g.title),
      credits: archiveContent.credits,
    });
    if (archiveContent.contentType !== ContentType.NOVEL || !archiveContent.coverImage.startsWith("https://")) {
      throw new Error("Expected a NOVEL with an absolute cover URL");
    }

    console.log("\n4. Testing getChapters (Shadow Slave)...");
    const archiveChapters = await novelArchive.getChapters(shadowSlaveId);
    const archiveOldest = archiveChapters.at(-1);
    console.log("Chapters:", archiveChapters.length, "| latest:", archiveChapters[0]?.title, "| oldest:", archiveOldest?.id, archiveOldest?.number);
    if (archiveChapters.length < 3200 || archiveOldest?.id !== "1" || archiveOldest?.number !== 1) {
      throw new Error("Expected over 3200 Shadow Slave chapters, oldest-last starting at chapter 1");
    }

    console.log("\n5. Testing getChapterText (Shadow Slave chapter 1)...");
    const archiveText = await novelArchive.getChapterText(shadowSlaveId, "1");
    console.log("First 120 chars:", archiveText.body.slice(0, 120));
    if (!archiveText.body.startsWith("<p>A frail-looking")) {
      throw new Error("Expected paragraph HTML for Novel Archive chapter text");
    }
  } catch (error) {
    if (!(error instanceof CloudflareError)) throw error;
    console.log("Skipping live Novel Archive tests (Cloudflare challenge):", error.resolutionURL);
  }
}

runWhenDirect(import.meta.url, testNovelArchive);
