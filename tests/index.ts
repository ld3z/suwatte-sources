/**
 * Runs every runner's tests in their original order.
 * Use `pnpm test` for all runners, or launch a single file directly, e.g.
 * `pnpm exec tsx tests/nhentai.ts`.
 */
import { testAtsumaru } from "./atsumaru";
import { testAtsumaruNovels } from "./atsumaru-novels";
import { testNovelFire } from "./novel-fire";
import { testLnori } from "./lnori";
import { testChikariNovels } from "./chikari-novels";
import { testChikariComics } from "./chikari-comics";
import { testLunar } from "./lunar";
import { testNovelBuddy } from "./novelbuddy";
import { testNovelArchive } from "./novel-archive";
import { testToonkotsu } from "./toonkotsu";
import { testYaoiMe } from "./yaoime";
import { testDynasty } from "./dynasty";
import { testMadokami } from "./madokami";
import { testHitomi } from "./hitomi";
import { testNhentai } from "./nhentai";
import { testEHentai } from "./ehentai";
import { testIMHentai } from "./imhentai";
import { testHentaiFox } from "./hentaifox";

async function main(): Promise<void> {
  const keepAlive = setInterval(() => {}, 1000);

  try {
    await testAtsumaru();
    await testAtsumaruNovels();
    await testNovelFire();
    await testLnori();
    await testChikariNovels();
    await testChikariComics();
    await testLunar();
    await testNovelBuddy();
    await testNovelArchive();
    await testToonkotsu();
    await testYaoiMe();
    await testDynasty();
    await testMadokami();
    await testHitomi();
    await testNhentai();
    await testEHentai();
    await testIMHentai();
    await testHentaiFox();

    console.log("\nAll tests passed successfully for all runners!");
  } finally {
    clearInterval(keepAlive);
  }
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
