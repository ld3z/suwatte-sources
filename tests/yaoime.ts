import emulate from "@suwatte/toolchain/emulator";
import { ContentType } from "@suwatte/toolchain";
import YaoiMe from "../src/sources/yaoime";
import { aesGcmDecrypt, decryptPageList } from "../src/sources/yaoime/crypto";
import { parseChapterLabel, parseChapters as parseYaoiMeChapters, parseDeepLinkId as parseYaoiMeLink, parseSealKey } from "../src/sources/yaoime/parsers";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { wrapDelegateWithValidation } from "@suwatte/toolchain/validate";
import { runWhenDirect } from "./support";

export async function testYaoiMe(): Promise<void> {
  console.log("\n==================================================");
  console.log("Testing yaoi.me...");
  console.log("==================================================");

  console.log("\n1. Testing parsers...");
  if (
    parseYaoiMeLink("https://yaoi.me/series/3579/ten-count") !== "3579" ||
    parseYaoiMeLink("https://yaoi.me/chapter/183541/5169709") !== "chapter:183541/5169709"
  ) {
    throw new Error("Expected yaoi.me series and chapter links to resolve");
  }
  const ch48 = parseChapterLabel("Vol.6 Ch.48");
  const extra = parseChapterLabel("Kurose and Shirotani");
  if (ch48.number !== 48 || ch48.volume !== 6 || extra.number !== 0) {
    throw new Error("Expected yaoi.me chapter labels to parse volume and number");
  }
  const flight = JSON.stringify({
    groups: [
      {
        key: "n:1",
        label: "Vol.1 Ch.1",
        num: 1,
        createdAt: 1519516800000,
        variants: [{ id: 5169709, s: 183541, lang: "en" }],
      },
      {
        key: "n:2",
        label: "Vol.1 Ch.2",
        num: 2,
        createdAt: 1519603200000,
        variants: [
          { id: 11, s: 183541, lang: "en" },
          { id: 12, s: 3579, lang: "en" },
        ],
      },
    ],
    sources: { "183541": "kagane", "3579": "mangaball" },
  });
  const flightHtml = `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`;
  const parsedGroups = parseYaoiMeChapters(flightHtml);
  if (
    parsedGroups.length !== 3 ||
    parsedGroups[0].id !== "183541/5169709" ||
    parsedGroups[0].number !== 1 ||
    parsedGroups[1].providers?.[0]?.name !== "Kagane" ||
    parsedGroups[2].providers?.[0]?.name !== "Mangaball"
  ) {
    throw new Error("Expected yaoi.me chapter groups from the page payload");
  }
  const sealScript =
    '"use strict";e.s(["sealKey",0,()=>[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32]])';
  if (parseSealKey(sealScript) !== "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20") {
    throw new Error("Expected yaoi.me sealKey bytes from the reader script");
  }

  console.log("\n1b. Testing AES-GCM page-list decryption...");
  emulate(YaoiMe);
  const seed = randomBytes(32);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const plain = Buffer.from(JSON.stringify({ p: ["hash-one", "hash-two"] }));
  const aesKey = createHash("sha256").update(Buffer.concat([seed, salt])).digest();
  const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const sealed = Buffer.concat([salt, iv, encrypted, cipher.getAuthTag()]).toString("base64url");
  const opened = aesGcmDecrypt(aesKey, iv, Buffer.concat([encrypted, cipher.getAuthTag()]));
  if (Buffer.from(opened).toString() !== plain.toString()) {
    throw new Error("Expected AES-GCM decryption to match node:crypto");
  }
  const fromList = decryptPageList(sealed, seed.toString("hex"));
  if (fromList.join() !== "hash-one,hash-two") {
    throw new Error(`Expected sealed page hashes, got ${fromList.join()}`);
  }

  console.log("\n2. Testing live catalogue access...");
  try {
    const yaoime = wrapDelegateWithValidation(emulate(YaoiMe), "yaoi.me");
    const yaoiHome = await yaoime.getHomePage();
    for (const feed of yaoiHome.feeds) {
      const list = await yaoime.getItemList({ key: feed.id }, 1);
      console.log(` - ${feed.id}: ${list.items.length} items`);
      if (list.items.length === 0) {
        throw new Error(`Expected items in yaoi.me feed '${feed.id}'`);
      }
    }

    console.log("\n3. Testing getSearchResults (keyword, filters & deep link)...");
    const yaoiSearch = await yaoime.getSearchResults({ query: "ten count" }, 1);
    console.log("Keyword hits:", yaoiSearch.items.map((i) => i.title).slice(0, 3));
    if (!yaoiSearch.items.some((i) => i.id === "3579")) {
      throw new Error("Expected '3579' (Ten Count) in yaoi.me keyword results");
    }
    const yaoiFiltered = await yaoime.getSearchResults(
      { filters: { types: { include: ["manga"] }, status: { include: ["completed"] } } },
      1
    );
    console.log("Filtered hits:", yaoiFiltered.items.length);
    if (yaoiFiltered.items.length === 0) {
      throw new Error("Expected filtered yaoi.me results");
    }
    const yaoiDeepLink = await yaoime.getSearchResults(
      { query: "https://yaoi.me/series/3579/ten-count" },
      1
    );
    if (yaoiDeepLink.items[0]?.id !== "3579") {
      throw new Error("Expected yaoi.me deep link to resolve to Ten Count");
    }

    console.log("\n4. Testing getContent ('3579' - Ten Count)...");
    const tenCount = await yaoime.getContent("3579");
    console.log("Content:", {
      title: tenCount.title,
      contentType: tenCount.contentType,
      status: tenCount.status,
      genres: tenCount.genres?.map((g) => g.title),
      credits: tenCount.credits,
    });
    if (tenCount.title !== "Ten Count" || tenCount.contentType !== ContentType.MANGA) {
      throw new Error("Expected Ten Count as a MANGA");
    }

    console.log("\n5. Testing getChapters & getChapterPages...");
    const tenCountChapters = await yaoime.getChapters("3579");
    const numbered = tenCountChapters.find((c) => c.number === 1);
    console.log(
      "Chapters:",
      tenCountChapters.length,
      "| latest:",
      tenCountChapters[0]?.title ?? tenCountChapters[0]?.number,
      "| chapter 1:",
      numbered?.id
    );
    if (tenCountChapters.length < 40 || !numbered) {
      throw new Error("Expected Ten Count chapters including chapter 1");
    }
    const yaoiPages = await yaoime.getChapterPages("3579", numbered.id);
    console.log("Pages:", yaoiPages.length, "| first:", yaoiPages[0]?.url);
    if (yaoiPages.length === 0 || !yaoiPages[0]?.url?.includes("/i/p/")) {
      throw new Error("Expected yaoi.me chapter pages");
    }
  } catch (error) {
    if (!(error instanceof CloudflareError)) throw error;
    console.log("Skipping live yaoi.me tests (Cloudflare challenge):", error.resolutionURL);
  }
}

runWhenDirect(import.meta.url, testYaoiMe);
