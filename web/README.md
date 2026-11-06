# SqueekBoard frontend

React, TypeScript and Vite; static output is committed at repository-root `dist/`. No backend, relay or wallet project ID is required. The existing contracts implement a Hamster Badge NFT and daily wheel-spin check-in on Sepolia. This launch has no fungible token, swap or liquidity flow.

## Install and run

From `web/`, using a current Node version compatible with the locked Vite/TypeScript versions:

```sh
npm ci
npm run dev
```

Development generates ignored copies of the deployment manifest and ABI JSON under `web/public/`. To build and inspect the production files:

```sh
npm run build
npm run typecheck
npm run verify
npm run preview -- --host 127.0.0.1
```

`build` runs TypeScript, exports with Vite `base: "./"`, then copies the ABIs and generates `dist/imd-deployment.json`. Serve `dist/` as plain files with its directory structure intact, including `abi/`, `assets/` and `og.png`. Hash routing/server rewrites are unnecessary. `node tests/serve.mjs` serves the committed export under `/ipfs/squeekboard/` for gateway-path checks; stop it after use.

## Deployment configuration

`dist/imd-deployment.json` is the only runtime address/chain/network/ABI-path configuration, fetched by `src/config.ts`; the browser then fetches the referenced ABI arrays. `web/deploy/deployment.json` and `web/deploy/network.json` preserve the supplied build-time handoff and vetted network entry. `docs/abi/<Contract>.json` contains the unchanged implementation-derived ABIs from the handoff's pinned source commit. There is no independent runtime address map.

Do not substitute addresses or edit these deployment inputs to work around a failed read. For a new authorized deployment, supply its attested handoff, matching network entry and implementation ABIs, verify the canonical Keccak hashes, then rebuild. `npm run verify` checks the exact handoff identifiers/contracts, network block, ABI binding, complete SHA-256 asset inventory, relative paths and size limits. Re-run `npm run manifest` and `npm run verify` after any manual export change. Never hash the manifest into itself.

Public RPC failover uses the manifest's ordered endpoints. Visitors sign in their own wallet. The connect dialog supports EIP-6963 named providers, phone Open in links, and Coinbase's SDK connector. Unknown-chain switching offers the handoff's exact `wallet_addEthereumChain` parameters. Real phone deep links and Coinbase/device flows have the untested limits documented in [validation](../docs/VALIDATION.md).

Both deployed contracts have no owner/admin settings. An owner setup panel and ERC-20 approvals are therefore not applicable. Free badge minting and daily spins still require Sepolia ETH for gas. No external price feed or invented USD value is used.

## Validate and retain evidence

```sh
npx playwright install chromium
npm test
```

`npm test` runs the ABI helper tests and Playwright interactions against `dist/`. Build first. All interaction RPCs/wallets are mocked; tests never broadcast a real transaction. Screenshots default to disposable `test/scratch/shots/`. Set `SHOTS_DIR=../docs/evidence/browser` when running a deliberate retained-evidence pass, or copy selected screenshots there after inspecting them. Do not add test caches or browser downloads to the submission.

The committed [validation report](../docs/VALIDATION.md) records the actual commands, pinned-source verification, browser outcomes, screenshots, six-domain design review, read-only live RPC checks and limits. The design guide is [docs/DESIGN.md](../docs/DESIGN.md).

The existing local share image can be regenerated with `node scripts/share-card.mjs` after installing Chromium. It renders the existing artwork and CSS tokens at 1200 × 630. Rebuild afterwards so the export and manifest include the new bytes. A live social-card domain was not supplied; relative metadata URLs are intentional until publication.
