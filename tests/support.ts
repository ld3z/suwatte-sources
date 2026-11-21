import { pathToFileURL } from "node:url";

/** Runs a runner's tests when that test file is launched directly. */
export function runWhenDirect(importUrl: string, fn: () => Promise<void>): void {
  if (!process.argv[1] || importUrl !== pathToFileURL(process.argv[1]).href) return;
  const keepAlive = setInterval(() => {}, 1000);
  fn()
    .catch((err) => {
      console.error("Test error:", err);
      process.exit(1);
    })
    .finally(() => clearInterval(keepAlive));
}
