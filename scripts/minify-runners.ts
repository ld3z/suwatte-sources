import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { minify } from "terser";

const dir = "stt/runners";
const files = readdirSync(dir).filter((f) => f.endsWith(".stt"));

(async () => {
  for (const file of files) {
    const fp = join(dir, file);
    const code = readFileSync(fp, "utf8");
    const result = await minify(code, {
      mangle: false,
      compress: false,
    });
    if (!result.code) continue;
    const saved = ((1 - result.code.length / code.length) * 100).toFixed(1);
    writeFileSync(fp, result.code);
    console.log(`${file}: ${code.length} → ${result.code.length} bytes (${saved}% smaller)`);
  }
})();
