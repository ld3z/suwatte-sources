import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { minify } from "terser";

const dir = "stt/runners";
const files = (await readdir(dir)).filter((f) => f.endsWith(".stt"));

for (const file of files) {
  const fp = join(dir, file);
  const code = await readFile(fp, "utf8");
  const result = await minify(code);
  const saved = ((1 - result.code.length / code.length) * 100).toFixed(1);
  await writeFile(fp, result.code);
  console.log(`${file}: ${code.length} → ${result.code.length} bytes (${saved}% smaller)`);
}
