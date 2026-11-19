// Minifies the .stt bundles produced by `suwatte build`.
//
// The toolchain bundles each source variant with esbuild but hardcodes
// `minify: false`. This post-build step runs esbuild's minifier over every
// generated .stt artifact in place. esbuild keeps the leading `"use httpclient"`
// / `"use webkit"` directives (read by the app's SourceScriptStamp parser) and
// the top-level `SourcePackage` global intact.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcesDir = join(projectRoot, "dist", "sources");

let files;
try {
  files = (await readdir(sourcesDir)).filter((file) => file.endsWith(".stt"));
} catch (error) {
  if (error?.code === "ENOENT") {
    throw new Error(
      `No ${sourcesDir} directory found. Run the build before minifying.`,
    );
  }
  throw error;
}

if (files.length === 0) {
  console.warn("No .stt files found in dist/sources; nothing to minify.");
  process.exit(0);
}

const originalDirectives = (source) =>
  source.match(/^\s*((?:"use [^"]+"|'use [^']+')\s*;?\s*)+/)?.[0] ?? "";

let bytesBefore = 0;
let bytesAfter = 0;

await Promise.all(
  files.map(async (file) => {
    const filePath = join(sourcesDir, file);
    const source = await readFile(filePath, "utf8");

    const { code } = await transform(source, {
      minify: true,
      legalComments: "eof",
      target: "es2019",
    });

    // Guard against toolchain changes silently producing a broken artifact.
    const directives = originalDirectives(source).trim();
    if (directives && !code.startsWith(directives)) {
      throw new Error(`${file}: minification dropped the leading directive(s).`);
    }
    if (!code.includes("SourcePackage=")) {
      throw new Error(`${file}: minification dropped the SourcePackage global.`);
    }

    await writeFile(filePath, code, "utf8");
    bytesBefore += Buffer.byteLength(source);
    bytesAfter += Buffer.byteLength(code);
  }),
);

const saved = bytesBefore - bytesAfter;
const percent = bytesBefore ? ((saved / bytesBefore) * 100).toFixed(1) : "0.0";
console.info(
  `Minified ${files.length} .stt file(s): ` +
    `${(bytesBefore / 1024).toFixed(1)} KiB -> ${(bytesAfter / 1024).toFixed(1)} KiB ` +
    `(${saved > 0 ? "-" : ""}${percent}%)`,
);
