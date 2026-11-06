# Frontend revision validation

Validated on 2026-11-06. Implementation and local validation are complete for the stated revision scope, with the device/browser and local Git limitations below. These are worker observations, not independent certification or publication results.

## Scope and reproduction

The existing Vite/React/TypeScript app and deployed contracts were preserved. Before changing runtime source, `web/tests/revision.spec.ts` ran against the previously committed `dist/` under `/ipfs/squeekboard/`. All five new Chromium cases failed for the expected missing behavior: the share image returned 404; the public batch had no error/retry at 390 and 1440; a failed refresh had no error disclosure; the phone picker omitted the announced wallet. The validation report referenced by `web/src/wallet/open-in.ts:11` was also absent. These baseline failures establish reproduction, not a failing final submission.

| Finding | Source and reproduced behavior | Correction and recheck |
| --- | --- | --- |
| a96e8007… (high) | `web/src/wallet/open-in.ts:11` linked to a missing report; screenshots existed only in disposable scratch. | This report, [retained evidence](evidence/interactions.json), [frontend instructions](../web/README.md), and [design documentation](DESIGN.md) are delivered. |
| 0c7d036c… (medium) | `web/index.html:13` declared `./og.png`; the gateway-subpath GET returned 404. | Added a real 1200 × 630 PNG at `web/public/og.png`, rendered from the existing artwork/tokens by `web/scripts/share-card.mjs`. The export contains it and declares its SHA-256. Chromium fetched both metadata references, decoded the PNG and checked its dimensions. |
| 5c09fff8… (medium) | `web/src/App.tsx:204` left totals/supply loading after only `totalSupply()` batches failed. Board and wallet reads still succeeded. [Before screenshot](evidence/before/public-error-390.png). | `web/src/App.tsx:206`, `:208`, and `:229` distinguish pending, failed and available data. The dedicated button calls `pub.refetch()` and disables during retries. Existing values remain visible with a last-successful-values notice after a refresh fails. Tests recover both initial failure and a failed refresh without reloading. |
| 01724290… (medium) | `web/src/wallet/ConnectSheet.tsx:33` removed every injected connector on an emulated iPhone without `window.ethereum`. [Before screenshot](evidence/before/mobile-discovery.png). | Filter only the generic `injected` row on mobile. The announced Mock Wallet remains selectable beside Open in links and Coinbase Smart Wallet. The test connects through it, closes the dialog and enables minting. |

Full finding IDs and verdicts are in the requested root `.imd-responses.json`.

## Commands and results

Commands run from `web/` unless stated otherwise:

| Check | Actual result |
| --- | --- |
| `npm ci --cache ../test/scratch/npm-cache --no-audit --no-fund` | Installed dependencies from the existing lockfile; no dependency version changes. |
| `PLAYWRIGHT_BROWSERS_PATH=../test/scratch/browsers npx playwright install chromium webkit` | Downloaded test browsers to disposable scratch. Initial browser tests could not launch before this installation. Chromium subsequently ran; WebKit's launch limitation is recorded below. |
| `PLAYWRIGHT_BROWSERS_PATH=../test/scratch/browsers node scripts/share-card.mjs` | Generated the committed 1200 × 630 share image; visually inspected it. This script is optional when rebuilding because the PNG is committed. |
| `npm run build` | Exit 0: TypeScript, Vite production export, ABI copies and manifest generation completed. Vite reported a browser externalization warning for the dependency `ox`'s `node:worker_threads` import. The tested injected-wallet flows produced no associated script errors; the real Coinbase SDK flow remains untested. |
| `npm run typecheck` | Exit 0. |
| `node --test tests/unit.test.mjs` | Exit 0; 2/2 passed (recursive canonical JSON and both ABI hashes). |
| `npm run verify` | Exit 0; exact handoff/network binding, 2 contracts, all 10 asset hashes, relative paths, raw-array ABI hashes, allowed manifest keys and export limits passed. Export including manifest: 810,035 bytes. |
| `PLAYWRIGHT_BROWSERS_PATH=../test/scratch/browsers PLAYWRIGHT_JSON_OUTPUT_NAME=../test/scratch/chromium-report.json npx playwright test --browser=chromium --reporter=list,json` | Exit 0; 19/19 passed, 0 skipped. [Individual outcomes and durations](evidence/interactions.json). |
| `PLAYWRIGHT_BROWSERS_PATH=../test/scratch/browsers npx playwright test tests/app.spec.ts --browser=chromium --grep 'desktop screenshot'` | Exit 0; 1/1 passed after making the retained desktop screenshot wait for the enabled spin control and finish finite CSS transitions. |
| From root: `IMD_PLAYWRIGHT=./web/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=./test/scratch/browsers node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste --offline` | Exit 0; all 16/16 checks passed. [Retained probe output](evidence/taste.json). Explicit module selection kept discovery inside the workspace. Offline mode blocks remote RPCs, so this probe establishes rendered design checks rather than live reads. |

The source ABIs were also read directly with `git show <handoff.sourceCommit>:docs/abi/<Contract>.json` and compared byte for byte with `docs/abi/`. Canonical Keccak was recomputed using `web/scripts/lib.mjs`; both hashes equal the handoff. The saved `web/deploy/` inputs equal the supplied pinned deployment and network JSON. [Recorded binding and export checks](evidence/build-verification.json).

## Browser and interaction coverage

The production export was served under a gateway-like subpath using `web/tests/serve.mjs`. Tests cover disconnected action guards, runtime manifest/ABI requests, explorer links, named EIP-6963 discovery, Escape/focus return, rejected connections, wrong-chain switching and exact `wallet_addEthereumChain` fallback, mint then spin with receipt-driven updates, rejected signatures, a simulation revert before signing, already-spun and zero-gas states, full RPC outage, the isolated public-read failures, stale values and recovery, both share-card references, and the phone discovery regression.

The 19 interaction cases route the configured public RPC endpoints to the in-memory model in `web/tests/mock-chain.ts`; other external requests are blocked. Wallet requests and transaction receipts are synthetic fixtures encoded with the real ABIs. Test names mentioning signing, confirmation or live reads refer to that mock model. **No real signature or transaction was produced.** Fixture badge numbers, balances and streaks in the screenshots are test data, not claims about Sepolia.

Retained screenshots were inspected as images:

- [390 × 844, disconnected](evidence/browser/disconnected-390.png): product, Connect wallet, badge supply and mint/spin controls fit on the first screen.
- [390 × 844, connected](evidence/browser/connected-390.png) and [320 × 844](evidence/browser/disconnected-320.png): wrapping stays inside the viewport. Automated tests also checked connected wallets and 100 long-address leaderboard rows at both widths; document overflow was 0 pixels.
- [1440 desktop](evidence/browser/desktop-1440.png): existing two-column layout, artwork, action card, board and full contract addresses.
- [390 public-read failure](evidence/browser/public-error-390.png) and [1440 failure](evidence/browser/public-error-1440.png): error and its own retry coexist with a successfully loaded board/wallet.
- [Failed refresh](evidence/browser/public-stale-values.png): previous supply/totals are retained and labelled as last successful values.
- [Phone wallet discovery](evidence/browser/mobile-discovery.png): named EIP-6963 provider remains visible without the legacy global; Open in links remain available.

## Better Interface review

Applied the pinned Better Interface workflow and the core principles of all six domains to the changed surfaces and affected shared components. Existing visual identity, tokens, typography and breakpoints were retained.

| Domain | Coverage and result | Limits |
| --- | --- | --- |
| Accessibility | Checked native buttons/links/dialog, accessible names, error `role="alert"`, disabled retry while fetching, Escape closure/focus return and reduced-motion CSS. The probe passed target spacing and contrast in its rendered state. | No screen-reader session, native 200% browser zoom, complete keyboard-only transaction walk, or full accessibility certification. The 32px dialog close target meets the baseline but is smaller than the preferred 44px touch size. |
| Layout | Checked screenshots at 320, 390 and 1440; product/connect/main actions above the 390 fold; automated long board/address stress tests. Probe found no overflow, text overlap, fixed control obstruction or clipped text at its three widths. | Intermediate breakpoint sweeps, localization expansion and RTL were not exercised; the app is English only. |
| Writing | Fixed the reproduced loading/error ambiguity with “Unable to load supply and totals.”, an explicit retry, and last-successful-values disclosure. Existing transaction consequence/rejection copy retained. | No localization review. |
| Typography | Checked the existing semantic size tokens, three weights, numeric formatting and rendered wrapping. The probe passed size/family/tracking/casing checks; headline remains heaviest. | System font rendering varies by platform; no separately loaded font asset is claimed. |
| Colors | Existing semantic tokens retained. Probe measured rendered solid-background text and passed its 4.5:1 normal / 3:1 large-text thresholds in the offline state. Error has text and an action in addition to color. | This is not a measurement of every transaction/overlay/disabled state or artwork. No dark theme is implemented or claimed. |
| UI | Checked resting/disabled, fetching/error/recovery, connected/wrong-chain and mobile dialog states. Existing 150ms named-property transitions and reduced-motion scale removal retained. Share image now loads. | No Animations-panel slow-motion replay or physical-device observation. Coinbase passkey prompts were not exercised. |

All reproduced findings were corrected and their affected behaviors rechecked. No unrelated visual redesign was made. [Implemented design system](DESIGN.md) lives in `docs/` to respect the explicit write scope; the generic root `DESIGN.md` criterion does not grant permission to write outside it.

## Live reads and remaining limits

[Public RPC evidence](evidence/live-rpc.json) records timestamps, endpoints, chain IDs, code lengths/hashes and decoded contract reads. Read-only JSON-RPC batches were sent using `curl -sS -A 'Mozilla/5.0'` with the handoff addresses and ABI-derived calldata. All three configured RPCs returned chain 11155111 and nonempty code at both addresses. Sentio initially rejected a seven-request batch with HTTP 429 (“JSON-RPC batch exceeds the maximum of 5 requests”); retrying in batches of three and four succeeded. These are observations at the recorded times, not continuous availability guarantees or a runtime-bytecode/source equivalence audit.

An additional Chromium run loaded the export without RPC interception and without a wallet. Its RPC requests failed with `net::ERR_EMPTY_RESPONSE`; direct browser `eth_chainId` fetches to each configured endpoint also returned “Failed to fetch”. The app rendered the supply/totals and leaderboard recovery states, kept disconnected transaction controls disabled, and had no script errors or horizontal overflow. This run does **not** establish successful live contract reads in a browser. The successful curl reads above establish that these sources were reachable with that client; the browser failure is not evidence that the RPC services are down. [Live browser observations](evidence/live-browser.json) and its [390 screenshot](evidence/browser/live-disconnected-390.png) retain this limitation separately from the mocked interactions.

WebKit was downloaded but an actual launch attempt failed because required runtime libraries were unavailable (including `libgtk-4.so.1` and `libgraphene-1.0.so.0`); [launch result](evidence/webkit.json). No WebKit browser pass is claimed. Firefox was not run. Physical iOS/Android wallet-browser links (especially Rabby), native wallet extensions, Coinbase Smart Wallet/passkeys and real funded mint/spin transactions remain untested. There was no authorization to broadcast validation transactions.

The site is not published by this assignment. Live domain/IPFS naming, absolute social-card URLs and crawler behavior remain publisher checks; relative paths are retained for an unknown gateway. No deployment, contract edit, security re-audit or publication check is claimed. No missing result, screenshot or live value was fabricated.

## Delivery status

The source changes, static export, manifest, finding responses and evidence exist in the working tree. Local `git add -- web/ dist/ docs/ .imd-responses.json` failed with “Unable to create …/.git/index.lock: Read-only file system”. No local commit could be created. The files remain available for the workflow's submission collector; a local commit or successful publisher upload is not claimed. No protected root configuration or ignore file was changed. The complete deliverable was checked against the 8 MiB bundle budget, excluding ignored dependencies and disposable scratch.
