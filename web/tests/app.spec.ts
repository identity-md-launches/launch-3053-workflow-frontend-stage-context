import { test, expect, type Page } from "@playwright/test";
import { ACCOUNT, BADGE, CHECKIN, mockRpc, mockWallet, network, newChain } from "./mock-chain";

// Screenshots for the reviewer go outside the delivered tree (removed before submission).
const SHOTS = process.env.SHOTS_DIR ?? "../test/scratch/shots";
const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return errors;
};
const wallet = (page: Page) => page.evaluate(() => (window as unknown as { __wallet: Record<string, unknown> }).__wallet);

async function connect(page: Page) {
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Connect a wallet" });
  await sheet.getByRole("button", { name: "Mock Wallet" }).click();
}

test("disconnected: public state, one connect control, actions disabled, no errors", async ({ page }) => {
  const chain = newChain();
  const errors = errorsOf(page);
  await mockRpc(page, chain);
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Spin the wheel every day");
  await expect(page.getByText("9,959 of 10,000 left.")).toBeVisible();
  await expect(page.getByText("41 of 10,000 minted.")).toBeVisible();
  const rows = page.locator("table.board tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("400 days");
  await expect(page.getByRole("button", { name: "Connect wallet" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Mint badge" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Spin today" })).toBeDisabled();
  // explorer links come from the manifest's network block and handoff addresses
  await expect(page.getByRole("link", { name: "View HamsterBadge on the explorer" })).toHaveAttribute(
    "href",
    new RegExp(`${network.network.explorer}/address/${BADGE.address}`, "i"),
  );
  await expect(page.getByRole("link", { name: "View WheelSpinCheckIn on the explorer" })).toHaveAttribute(
    "href",
    new RegExp(`/address/${CHECKIN.address}`, "i"),
  );
  expect(errors).toEqual([]);
});

test("runtime config comes from imd-deployment.json and its ABI files", async ({ page }) => {
  const chain = newChain();
  await mockRpc(page, chain);
  const loaded: string[] = [];
  page.on("request", (r) => loaded.push(new URL(r.url()).pathname));
  await page.goto("./");
  await expect(page.getByText("41 of 10,000 minted.")).toBeVisible();
  expect(loaded).toContain("/ipfs/squeekboard/imd-deployment.json");
  expect(loaded).toContain("/ipfs/squeekboard/abi/HamsterBadge.json");
  expect(loaded).toContain("/ipfs/squeekboard/abi/WheelSpinCheckIn.json");
  expect(chain.calls).toContain("leaderboard");
});

test("connect sheet lists discovered wallets by name, never 'Injected', and closes with Escape", async ({ page }) => {
  await mockRpc(page, newChain());
  await mockWallet(page);
  await page.goto("./");
  const trigger = page.getByRole("button", { name: "Connect wallet" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Connect a wallet" });
  await expect(sheet.getByRole("button", { name: "Mock Wallet" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Coinbase Wallet" })).toBeVisible();
  await expect(sheet.getByText(/injected/i)).toHaveCount(0);
  await expect(sheet.getByText("Browser wallet")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("wallet rejection on connect leaves a one-line note and the sheet open", async ({ page }) => {
  await mockRpc(page, newChain());
  await mockWallet(page);
  await page.goto("./");
  await page.evaluate(() => { (window as unknown as { __wallet: { rejectNext: boolean } }).__wallet.rejectNext = true; });
  await connect(page);
  await expect(page.getByRole("dialog").getByText("Mock Wallet request declined. Pick a wallet to try again.")).toBeVisible();
});

test("wrong chain: Switch to Sepolia falls back to wallet_addEthereumChain with the vetted parameters", async ({ page }) => {
  const chain = newChain();
  await mockRpc(page, chain);
  await mockWallet(page, { startChain: 1, knowsSepolia: false });
  await page.goto("./");
  await connect(page);
  const sw = page.getByRole("button", { name: "Switch to Sepolia" });
  await expect(sw).toBeVisible();
  await expect(page.getByRole("button", { name: "Mint badge" })).toBeDisabled();
  await sw.click();
  await expect(sw).toBeHidden();
  const st = (await wallet(page)) as { added: unknown[]; chainId: number; switches: number };
  expect(st.added).toEqual([network.walletAddChain]);
  expect(st.chainId).toBe(network.network.chainId);
  await expect(page.getByRole("button", { name: "Mint badge" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /disconnect/i })).toContainText("0x0000…EE01");
});

test("mint then spin: simulated, signed by the wallet, confirmed, and reflected in live reads", async ({ page }) => {
  const chain = newChain();
  const errors = errorsOf(page);
  await mockRpc(page, chain);
  await mockWallet(page);
  await page.goto("./");
  await connect(page);
  await expect(page.getByText("Calls mint() on HamsterBadge.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Spin today" })).toBeDisabled();
  await expect(page.getByText("Needs a Hamster Badge in this wallet. Mint one first.")).toBeVisible();

  await page.getByRole("button", { name: "Mint badge" }).click();
  await expect(page.getByText("Badge #42 minted.")).toBeVisible();
  await expect(page.getByRole("link", { name: "View transaction" }).first()).toHaveAttribute("href", /\/tx\/0x[0-9a-f]{64}$/);
  await expect(page.getByText("You hold Hamster Badge #42.")).toBeVisible();
  await expect(page.getByText("Badge held")).toBeVisible();
  expect(chain.sent[0].to.toLowerCase()).toBe(BADGE.address);

  const spin = page.getByRole("button", { name: "Spin today" });
  await expect(spin).toBeEnabled();
  await expect(spin).toHaveClass(/btn-primary/);
  await spin.click();
  await expect(page.getByText("Spin recorded.")).toBeVisible();
  await expect(page.getByText("Spun today")).toBeVisible();
  await expect(page.getByText(/Next spin opens in .* at 00:00 UTC/)).toBeVisible();
  const stats = page.locator("dl.stats");
  await expect(stats.locator(".stat").nth(0)).toContainText("1 day");
  await expect(stats.locator(".stat").nth(2)).toContainText("1");
  await expect(stats.locator(".stat").nth(3)).toContainText("#4");
  await expect(page.locator("tr.mine")).toContainText("You");
  expect(chain.sent[1].to.toLowerCase()).toBe(CHECKIN.address);
  expect(chain.sent).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("a rejected signature sends nothing and says so", async ({ page }) => {
  const chain = newChain();
  await mockRpc(page, chain);
  await mockWallet(page);
  await page.goto("./");
  await connect(page);
  await page.evaluate(() => { (window as unknown as { __wallet: { rejectNext: boolean } }).__wallet.rejectNext = true; });
  await page.getByRole("button", { name: "Mint badge" }).click();
  await expect(page.getByText("Request declined in your wallet. Nothing was sent.")).toBeVisible();
  expect(chain.sent).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Mint badge" })).toBeEnabled();
});

test("a contract revert is shown in plain words before the wallet opens", async ({ page }) => {
  const chain = newChain();
  await mockRpc(page, chain);
  await mockWallet(page);
  await page.goto("./");
  await connect(page);
  await expect(page.getByRole("button", { name: "Mint badge" })).toBeEnabled();
  // Someone else takes the last badge between the read and the click.
  chain.supply = chain.max;
  await page.getByRole("button", { name: "Mint badge" }).click();
  await expect(page.getByText("All 10,000 badges are minted.", { exact: false }).first()).toBeVisible();
  expect(chain.sent).toHaveLength(0);
  const st = (await wallet(page)) as { requests: string[] };
  expect(st.requests).not.toContain("eth_sendTransaction");
});

test("already spun today and an empty-gas wallet show their states", async ({ page }) => {
  const chain = newChain();
  chain.wallets.set(ACCOUNT.toLowerCase(), { hasMinted: true, balance: 1n, current: 5n, longest: 9n, total: 30n, lastDay: chain.today });
  chain.ethBalance = 0n;
  await mockRpc(page, chain);
  await mockWallet(page);
  await page.goto("./");
  await connect(page);
  await expect(page.getByText("Spun today")).toBeVisible();
  await expect(page.locator("dl.stats .stat").nth(0)).toContainText("5 days");
  await expect(page.locator("dl.stats .stat").nth(1)).toContainText("9 days");
  await expect(page.getByText("This wallet has no Sepolia ETH for gas.", { exact: false })).toBeVisible();
});

test("RPC failure shows a recoverable error instead of a blank board", async ({ page }) => {
  await mockRpc(page, newChain(), { failReads: true });
  await page.goto("./");
  await expect(page.getByText("Unable to reach the Sepolia RPC.", { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

for (const width of [320, 390]) {
  test(`no sideways scroll at ${width}px with a full 100-row board and a connected wallet`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const chain = newChain({ boardSize: 100, supply: 9_999n });
    await mockRpc(page, chain);
    await mockWallet(page);
    await page.goto("./");
    await expect(page.locator("table.board tbody tr")).toHaveCount(100);
    await page.screenshot({ path: `${SHOTS}/disconnected-${width}.png` });
    await connect(page);
    await expect(page.getByRole("button", { name: /disconnect/i })).toBeVisible();
    // main action on the first screen
    const mint = page.getByRole("button", { name: "Mint badge" });
    const box = await mint.boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(844);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
    await page.screenshot({ path: `${SHOTS}/connected-${width}.png` });
    await page.screenshot({ path: `${SHOTS}/connected-${width}-full.png`, fullPage: true });
  });
}

test("desktop screenshot with a populated board", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const chain = newChain({ boardSize: 8 });
  await mockRpc(page, chain);
  await mockWallet(page);
  await page.goto("./");
  await connect(page);
  await page.getByRole("button", { name: "Mint badge" }).click();
  await expect(page.getByText("Badge #42 minted.")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/desktop-1440.png`, fullPage: true });
  await page.getByRole("button", { name: /disconnect/i }).click();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.screenshot({ path: `${SHOTS}/sheet-1440.png` });
});

test("mobile connect sheet is a bottom sheet with Open in rows", async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await mockRpc(page, newChain());
  await page.goto("./");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  const sheet = page.getByRole("dialog", { name: "Connect a wallet" });
  for (const name of ["Open in MetaMask", "Open in Coinbase Wallet", "Open in Rabby", "Open in Phantom"]) {
    await expect(sheet.getByRole("link", { name })).toBeVisible();
  }
  await expect(sheet.getByRole("button", { name: "Coinbase Smart Wallet" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Open in MetaMask" })).toHaveAttribute("href", /^https:\/\/link\.metamask\.io\/dapp\/127\.0\.0\.1/);
  const box = await sheet.boundingBox();
  expect(Math.round(box!.y + box!.height)).toBe(844);
  await page.screenshot({ path: `${SHOTS}/sheet-390.png` });
  await ctx.close();
});
