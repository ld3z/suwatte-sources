import emulate from "@suwatte/toolchain/emulator";
import { ContentRating, ContentType } from "@suwatte/toolchain";
import Toonkotsu from "../src/sources/toonkotsu";
import { decodeBase64Url, decryptPage, encodeBase64Url } from "../src/sources/toonkotsu/crypto";
import { PAGE_KEY, PAGE_NONCE, parseChapterPages, parseDeepLinkId as parseToonkotsuLink, toChapters as toToonkotsuChapters, toContent as toToonkotsuContent } from "../src/sources/toonkotsu/parsers";
import { createCipheriv, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { runWhenDirect } from "./support";

export async function testToonkotsu(): Promise<void> {
  console.log("\n==================================================");
  console.log("Testing Toonkotsu...");
  console.log("==================================================");
  const toonkotsu = emulate(Toonkotsu);

  console.log("\n1. Testing base64 reader codec...");
  const codecBytes = randomBytes(64);
  const codecEncoded = encodeBase64Url(codecBytes);
  if (
    !/^[A-Za-z0-9_-]+$/.test(codecEncoded) ||
    !Buffer.from(decodeBase64Url(codecEncoded)).equals(codecBytes)
  ) {
    throw new Error("Expected unpadded base64url to round-trip through the reader codec");
  }

  console.log("\n2. Testing AES-CTR page decryption against node:crypto...");
  for (const keyLength of [16, 24, 32]) {
    const pageKey = randomBytes(keyLength);
    const pageNonce = randomBytes(12);
    const plain = randomBytes(100_003);
    const iv = Buffer.concat([pageNonce.subarray(0, 8), Buffer.alloc(8)]);
    const cipher = createCipheriv(`aes-${keyLength * 8}-ctr`, pageKey, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const decrypted = decryptPage(encrypted, pageKey, pageNonce.subarray(0, 8));
    if (!Buffer.from(decrypted).equals(plain)) {
      throw new Error(`Expected AES-${keyLength * 8}-CTR decryption to match node:crypto`);
    }
  }

  console.log("\n3. Testing raw page keys and the decrypting image interceptor...");
  const pageKey = randomBytes(16);
  const pageNonce = randomBytes(12);
  const nonceText = pageNonce.toString("base64url");
  const keyText = pageKey.toString("base64url");
  const pageUrl = `https://toonkotsu.com/p/1.webp?tkkey=${keyText}&tknonce=${nonceText}&tktype=image%2Favif`;
  const pages = parseChapterPages({
    chapter: {
      pages: [
        { src: "/p/1.webp", k: keyText, n: nonceText, t: "image/avif" },
        { src: "//cdn.x/2.png" },
      ],
    },
  });
  console.log("Pages:", pages);
  if (
    pages[0].url !== pageUrl ||
    pages[0].context?.[PAGE_KEY] !== keyText ||
    pages[0].context?.[PAGE_NONCE] !== nonceText ||
    pages[1].url !== "https://cdn.x/2.png" ||
    pages[1].context
  ) {
    throw new Error("Expected raw page keys in the URL and context");
  }
  const image = randomBytes(5000);
  const imageCipher = createCipheriv(
    "aes-128-ctr",
    pageKey,
    Buffer.concat([pageNonce.subarray(0, 8), Buffer.alloc(8)])
  );
  const encryptedImage = Buffer.concat([imageCipher.update(image), imageCipher.final()]);
  const server = createServer(
    (_req, res) => res.setHeader("content-type", "application/octet-stream").end(encryptedImage)
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    // The context survives in the app's runtime.
    const contextual = await (toonkotsu as any).client.get(
      `http://127.0.0.1:${port}/p/1.webp`,
      { context: pages[0].context }
    );
    if (!Buffer.from(await contextual.bytes()).equals(image)) {
      throw new Error("Expected the image interceptor to decrypt via the page context");
    }
    // Suwatte's validation strips the context; the URL alone must still work.
    const stripped = await (toonkotsu as any).client.get(
      `http://127.0.0.1:${port}/p/1.webp?tkkey=${keyText}&tknonce=${nonceText}&tktype=image%2Favif`
    );
    if (!Buffer.from(await stripped.bytes()).equals(image)) {
      throw new Error("Expected the image interceptor to decrypt via the page URL");
    }
    if (stripped.headers.get("content-type") !== "image/avif") {
      throw new Error("Expected the decrypted page to carry its media type");
    }
    // The app's runtime may hand the page query back as request params.
    const viaParams = await (toonkotsu as any).client.get(`http://127.0.0.1:${port}/p/1.webp`, {
      params: { tkkey: keyText, tknonce: nonceText, tktype: "image/avif" },
    });
    if (
      !Buffer.from(await viaParams.bytes()).equals(image) ||
      viaParams.headers.get("content-type") !== "image/avif"
    ) {
      throw new Error("Expected the image interceptor to decrypt via request params");
    }
  } finally {
    server.close();
  }

  console.log("\n4. Testing parsers with fixture data...");
  if (
    parseToonkotsuLink("https://toonkotsu.com/title/a1b2c-some-title") !== "a1b2c" ||
    parseToonkotsuLink("https://toonkotsu.com/title/12345") !== null
  ) {
    throw new Error("Expected Toonkotsu title links to resolve to their id");
  }
  const fixture = {
    series: {
      id: 1,
      hid: "a1b2c",
      slug: "some-title",
      title: "Tom &amp; Jerry",
      titles: { english: "Tom & Jerry", romaji: "Tomu" },
      type: "Manhwa",
      tags: ["Action", "Ecchi", "Seinen", "Time Travel"],
      status: "Complete",
      cover: "/covers/a1b2c/460.webp",
      score: 87,
      authors: ["Someone"],
    },
    chapters: [
      {
        id: 12,
        n: 2,
        label: "Chapter 2: The Return [Group A]",
        at: 1700000000000,
        alts: [
          { id: 13, label: "Ch. 2", group: { slug: "group-b", name: "Group B" } },
          { id: 14, label: "Chapter 2", group: { slug: "group-a", name: "Group A" } },
          { id: 15, label: "Chapter 2", group: { slug: "group-b", name: "GROUP B" } },
        ],
      },
      { id: 11, n: 1, vol: "1", label: "Chapter 1" },
    ],
  };
  const facets = { genres: [{ name: "Action" }, { name: "Ecchi" }, { name: "Time Travel", category: "Theme: Plot" }] };
  const parsedContent = toToonkotsuContent(fixture, "a1b2c", facets);
  console.log("Content:", {
    title: parsedContent.title,
    rating: parsedContent.rating,
    status: parsedContent.status,
    genres: parsedContent.genres?.map((g) => g.title),
    properties: parsedContent.properties?.map((p) => p.id),
    coverImage: parsedContent.coverImage,
  });
  if (
    parsedContent.title !== "Tom & Jerry" ||
    parsedContent.rating !== ContentRating.SUGGESTIVE ||
    parsedContent.contentType !== ContentType.MANHWA ||
    parsedContent.coverImage !== "https://toonkotsu.com/covers/a1b2c/720.webp" ||
    parsedContent.webUrl !== "https://toonkotsu.com/title/a1b2c-some-title" ||
    parsedContent.genres?.length !== 2 ||
    parsedContent.properties?.map((p) => p.id).join() !== "themes,demographics"
  ) {
    throw new Error("Expected parsed Toonkotsu content details");
  }
  const parsedChapters = toToonkotsuChapters(fixture);
  console.log("Chapters:", parsedChapters.map(({ id, number, title, providers }) => ({ id, number, title, group: providers?.[0]?.name })));
  if (
    parsedChapters.map((c) => c.id).join() !== "12,13,11" ||
    parsedChapters[0].title !== "The Return" ||
    parsedChapters[0].providers?.[0]?.name !== "Group A" ||
    parsedChapters[1].title !== undefined ||
    parsedChapters[2].volume !== 1
  ) {
    throw new Error("Expected one Toonkotsu chapter per group, without same-group mirrors");
  }

  console.log("\n5. Testing live catalogue access...");
  try {
    const toonkotsuHome = await toonkotsu.getHomePage();
    const latest = await toonkotsu.getItemList({ key: toonkotsuHome.feeds[0].id }, 1);
    console.log("First feed items:", latest.items.length);
  } catch (error) {
    if (!(error instanceof CloudflareError)) throw error;
    console.log("Skipping live Toonkotsu tests (Cloudflare challenge):", error.resolutionURL);
  }
}

runWhenDirect(import.meta.url, testToonkotsu);
