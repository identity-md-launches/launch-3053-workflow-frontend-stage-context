// Writes the ABIs and dist/imd-deployment.json after `vite build`.
//
// Sources (all committed): web/deploy/deployment.json (the workflow deployment handoff),
// web/deploy/network.json (the vetted chain table entry) and docs/abi/<Contract>.json (the ABIs
// exported from the deployed source commit). Each ABI's canonical Keccak hash must equal the
// handoff's abiHash or the build fails.
//
//   node scripts/manifest.mjs           -> dist/abi/*.json + dist/imd-deployment.json (with assets)
//   node scripts/manifest.mjs --public  -> web/public/ copies for `vite` dev server (gitignored)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ABI_SOURCE, DIST, HANDOFF, NETWORK, WEB, abiHash, listFiles, readJson, sha256 } from "./lib.mjs";

const devMode = process.argv.includes("--public");
const outDir = devMode ? join(WEB, "public") : DIST;
if (!devMode && !existsSync(join(DIST, "index.html"))) {
  console.error("dist/index.html is missing: run `vite build` first.");
  process.exit(1);
}

const handoff = readJson(HANDOFF);
const contracts = handoff.contracts.map((c) => {
  const raw = readFileSync(join(ABI_SOURCE, `${c.name}.json`));
  const hash = abiHash(JSON.parse(raw.toString("utf8")));
  if (hash !== c.abiHash) {
    console.error(`ABI hash mismatch for ${c.name}: computed ${hash}, handoff ${c.abiHash}`);
    process.exit(1);
  }
  const abiPath = `abi/${c.name}.json`;
  mkdirSync(join(outDir, "abi"), { recursive: true });
  writeFileSync(join(outDir, abiPath), raw); // raw bytes from the pinned export
  return { name: c.name, address: c.address, abiHash: c.abiHash, abiPath };
});

const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  assets: [],
};
if (handoff.poolKey) manifest.poolKey = handoff.poolKey;
if (existsSync(NETWORK)) {
  const net = readJson(NETWORK);
  manifest.network = net.network;
  if (net.walletAddChain) manifest.walletAddChain = net.walletAddChain;
}

if (!devMode) {
  manifest.assets = listFiles(DIST)
    .filter((p) => p !== "imd-deployment.json")
    .map((path) => ({ path, sha256: sha256(readFileSync(join(DIST, path))) }));
}
writeFileSync(join(outDir, "imd-deployment.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${join(outDir, "imd-deployment.json")} with ${manifest.assets.length} assets`);
