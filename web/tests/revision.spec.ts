import { test, expect, type Page } from "@playwright/test";
import { mockRpc, mockWallet, newChain } from "./mock-chain";

const SHOTS = process.env.SHOTS_DIR ?? "../test/scratch/shots";
const phone = {
  viewport: { width: 390, height: 844 },
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  hasTouch: true,
  isMobile: true,
};

async function connect(page: Page) {
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Mock Wallet", exact: true }).click();
}

test.afterEach(async ({ page, browserName }, info) => {
  if (!page.isClosed()) await page.screenshot({
    path: `${SHOTS}/${browserName}-${info.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`,
    fullPage: true,
  });
});

test("share image loads from the gateway subpath at 1200 by 630", async ({ page }) => {
  await mockRpc(page, newChain());
  await page.goto("./");
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  const twitter = await page.locator('meta[name="twitter:image"]').getAttribute("content");
  expect(og).toBe(twitter);
  const response = await page.request.get(new URL(og!, page.url()).href);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  const dimensions = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src!;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, og);
  expect(dimensions).toEqual([1200, 630]);
});

for (const width of [390, 1440]) {
  test(`isolated public read failure and retry at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const chain = newChain();
    const failures = { failSupplyReads: true };
    await mockRpc(page, chain, failures);
    await mockWallet(page);
    await page.goto("./");
    await connect(page);
    await expect(page.locator("table.board tbody tr")).toHaveCount(3);
    await expect(page.locator("dl.stats .stat").first()).toContainText("0 days");
    await expect(page.getByText("Unable to load supply and totals.", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Reading supply…", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Loading totals…", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/public-error-${width}.png`, fullPage: true });
    failures.failSupplyReads = false;
    await page.getByRole("button", { name: "Retry supply and totals" }).click();
    await expect(page.getByText("41 of 10,000 minted.", { exact: false })).toBeVisible();
    await expect(page.getByText("9,959 of 10,000 left.")).toBeVisible();
    await expect(page.getByText("3 wallets have spun 1,266 times.")).toBeVisible();
    await expect(page.getByText("Unable to load supply and totals.", { exact: true })).toHaveCount(0);
    expect(chain.sent).toHaveLength(0);
  });
}

test("failed refresh preserves public values and recovers with its own retry", async ({ page }) => {
  const chain = newChain();
  const failures = { failSupplyReads: false };
  await mockRpc(page, chain, failures);
  await page.goto("./");
  await expect(page.getByText("41 of 10,000 minted.", { exact: false })).toBeVisible();
  failures.failSupplyReads = true;
  // TanStack Query refetches stale queries when the page becomes visible again.
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText("Unable to load supply and totals.", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("41 of 10,000 minted.", { exact: false })).toBeVisible();
  await expect(page.getByText("3 wallets have spun 1,266 times.")).toBeVisible();
  await expect(page.getByText("Last successful values are shown.")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/public-stale-values.png`, fullPage: true });
  chain.supply = 42n;
  failures.failSupplyReads = false;
  await page.getByRole("button", { name: "Retry supply and totals" }).click();
  await expect(page.getByText("42 of 10,000 minted.", { exact: false })).toBeVisible();
  await expect(page.getByText("Unable to load supply and totals.", { exact: true })).toHaveCount(0);
});

test("mobile discovery keeps the EIP-6963 wallet without window.ethereum", async ({ browser }) => {
  const context = await browser.newContext(phone);
  try {
    const page = await context.newPage();
    await mockRpc(page, newChain());
    await mockWallet(page);
    await page.goto("./");
    expect(await page.evaluate(() => !!(window as unknown as { ethereum?: unknown }).ethereum)).toBe(false);
    await page.getByRole("button", { name: "Connect wallet" }).click();
    const sheet = page.getByRole("dialog", { name: "Connect a wallet" });
    await page.screenshot({ path: `${SHOTS}/mobile-discovery.png` });
    await expect(sheet.getByRole("button", { name: "Mock Wallet", exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Browser wallet", exact: true })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "Coinbase Smart Wallet", exact: true })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Open in MetaMask", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await sheet.getByRole("button", { name: "Mock Wallet", exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("button", { name: /disconnect/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mint badge", exact: true })).toBeEnabled();
  } finally {
    await context.close();
  }
});
