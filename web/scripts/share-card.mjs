// Recreates the local Open Graph asset with the app's existing tokens and hamster artwork.
// Run from web/: node scripts/share-card.mjs (requires the Playwright Chromium test browser).
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const art = await readFile(new URL("../public/badge.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><title>SqueekBoard share image</title>
    <style>${css}
      body { width: 1200px; height: 630px; padding: 64px; display: grid; grid-template-columns: 1.4fr 1fr;
        align-items: center; gap: 48px; border-bottom: 12px solid var(--color-accent-solid); }
      .copy { display: grid; gap: 24px; }
      .brand { font-size: 32px; }
      h1 { font-size: 64px; line-height: 1.1; }
      p { font-size: 24px; color: var(--color-text-secondary); max-width: 490px; }
      svg { width: 400px; height: 400px; border-radius: 36px; }
    </style><body><div class="copy"><span class="brand">SqueekBoard</span>
      <h1>Spin the wheel<br>every day</h1>
      <p>Mint a Hamster Badge. Build your daily streak on Sepolia.</p>
    </div>${art}</body></html>`);
  await page.screenshot({ path: new URL("../public/og.png", import.meta.url).pathname });
  console.log("Created web/public/og.png (1200 × 630).");
} finally {
  await browser.close();
}
