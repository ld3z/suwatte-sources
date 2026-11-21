import emulate from "@suwatte/toolchain/emulator";
import Madokami from "../src/sources/madokami";
import { parseChapterNumbers, parseDate } from "../src/sources/madokami/parsers";
import { base64Encode, detailsPath } from "../src/sources/madokami/utils";
import { wrapDelegateWithValidation } from "@suwatte/toolchain/validate";
import { runWhenDirect } from "./support";

export async function testMadokami(): Promise<void> {
  console.log("\n==================================================");
  console.log("Testing Madokami...");
  console.log("==================================================");

  console.log("\n1. Testing offline helpers...");
  const numbers = (file: string, title = "Berserk") => parseChapterNumbers(file, title);
  const expectNumbers = (file: string, number: number, volume?: number) => {
    const parsed = numbers(file);
    if (parsed.number !== number || parsed.volume !== volume) {
      throw new Error(`Expected '${file}' -> ${number}/v${volume}, got ${parsed.number}/v${parsed.volume}`);
    }
  };
  expectNumbers("Berserk v01 c001-008 (2003) [Digital].cbz", 8, 1);
  expectNumbers("Berserk c372 [Group].zip", 372);
  expectNumbers("Berserk v41.cbz", 41, 41);
  expectNumbers("Berserk Ch. 12.5.cbz", 12.5);
  expectNumbers("Berserk (Special) [Group].cbz", -1);
  if (base64Encode("user:pässword") !== "dXNlcjpww6Rzc3dvcmQ=") {
    throw new Error("Expected UTF-8 base64 encoding of credentials");
  }
  if (detailsPath("/Manga/B/BE/BERS/Berserk/!Extras/file.cbz") !== "/Manga/B/BE/BERS/Berserk") {
    throw new Error("Expected manga details path to stop at the series folder");
  }
  if (detailsPath("/Raws/Berserk/!Extras/!More") !== "/Raws/Berserk") {
    throw new Error("Expected raws details path to drop '!' sub-folders");
  }
  if (parseDate("2023-04-05 13:45")?.getHours() !== 13) {
    throw new Error("Expected absolute dates to parse in local time");
  }

  const madokamiUser = process.env.MADOKAMI_USERNAME;
  const madokamiPassword = process.env.MADOKAMI_PASSWORD;
  if (!madokamiUser || !madokamiPassword) {
    console.log("\nSkipping live Madokami tests (set MADOKAMI_USERNAME and MADOKAMI_PASSWORD).");
  } else {
    const madokami = wrapDelegateWithValidation(emulate(Madokami), "Madokami");

    console.log("\n2. Testing login...");
    await madokami.onFormSubmitted("account", { username: madokamiUser, password: madokamiPassword });
    const madokamiSettings = await madokami.getSettingsPage();
    console.log("Account footer:", madokamiSettings?.sections[0].footer);

    console.log("\n3. Testing getItemList (recent)...");
    const recent = await madokami.getItemList({ key: "recent" }, 1);
    console.log("Recent items:", recent.items.length, "| first:", recent.items[0]);
    if (recent.items.length === 0) {
      throw new Error("Expected items in the Madokami recent feed");
    }

    console.log("\n4. Testing getSearchResults ('berserk')...");
    const madokamiSearch = await madokami.getSearchResults({ query: "berserk" }, 1);
    console.log("Search hits:", madokamiSearch.items.map((i) => i.id).slice(0, 3));
    const berserk = madokamiSearch.items.find((i) => i.title === "Berserk");
    if (!berserk) {
      throw new Error("Expected 'Berserk' in Madokami search results");
    }

    console.log(`\n5. Testing getContent & getChapters ('${berserk.id}')...`);
    const berserkContent = await madokami.getContent(berserk.id);
    console.log("Content:", {
      title: berserkContent.title,
      coverImage: berserkContent.coverImage,
      status: berserkContent.status,
      credits: berserkContent.credits,
    });
    const berserkChapters = await madokami.getChapters(berserk.id);
    console.log("Chapters:", berserkChapters.length, "| latest:", berserkChapters[0]);
    if (berserkChapters.length === 0) {
      throw new Error("Expected Berserk chapters");
    }

    console.log("\n6. Testing getChapterPages...");
    const madokamiPages = await madokami.getChapterPages(berserk.id, berserkChapters[0].id);
    console.log("Pages:", madokamiPages.length, "| first:", madokamiPages[0]?.url);
    if (madokamiPages.length === 0) {
      throw new Error("Expected pages for the latest Berserk file");
    }
  }
}

runWhenDirect(import.meta.url, testMadokami);
