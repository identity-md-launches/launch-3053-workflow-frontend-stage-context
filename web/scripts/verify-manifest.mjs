// Checks dist/imd-deployment.json the way publication does, from the committed files only:
// exact keys, values copied from the handoff and network table, ABI hashes, every exported file
// declared with its SHA-256, size limits, relative paths, no URLs or addresses outside `network`.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DIST, HANDOFF, NETWORK, abiHash, listFiles, readJson, sha256 } from "./lib.mjs";

const errors = [];
const fail = (m) => errors.push(m);
const m = readJson(join(DIST, "imd-deployment.json"));
const h = readJson(HANDOFF);
const net = readJson(NETWORK);

const allowed = ["version", "launchId", "chainId", "sourceCommit", "attestationHash", "contracts", "assets", "network", "walletAddChain", ...(h.poolKey ? ["poolKey"] : [])];
for (const k of Object.keys(m)) if (!allowed.includes(k)) fail(`unexpected top-level key ${k}`);
if (m.version !== 1) fail("version must be 1");
for (const k of ["launchId", "chainId", "sourceCommit", "attestationHash"]) if (m[k] !== h[k]) fail(`${k} differs from handoff`);
if (h.poolKey && JSON.stringify(m.poolKey) !== JSON.stringify(h.poolKey)) fail("poolKey differs from handoff");
if (!h.poolKey && "poolKey" in m) fail("poolKey present but handoff has none");
if (JSON.stringify(m.network) !== JSON.stringify(net.network)) fail("network block differs from network.json");
if (net.walletAddChain && "walletAddChain" in m && JSON.stringify(m.walletAddChain) !== JSON.stringify(net.walletAddChain)) fail("walletAddChain differs");

const safePath = (p) => typeof p === "string" && !p.includes("..") && !p.startsWith("/") && !/^[a-z]+:/i.test(p);
if (m.contracts.length !== h.contracts.length) fail("contract count differs from handoff");
for (const hc of h.contracts) {
  const c = m.contracts.find((x) => x.name === hc.name);
  if (!c) { fail(`missing contract ${hc.name}`); continue; }
  if (c.address !== hc.address) fail(`${hc.name} address differs`);
  if (c.abiHash !== hc.abiHash) fail(`${hc.name} abiHash differs`);
  if (!safePath(c.abiPath)) fail(`${hc.name} abiPath not relative`);
  const abi = JSON.parse(readFileSync(join(DIST, c.abiPath), "utf8"));
  if (!Array.isArray(abi)) fail(`${hc.name} ABI is not a JSON array`);
  if (abiHash(abi) !== hc.abiHash) fail(`${hc.name} exported ABI hash ${abiHash(abi)} != ${hc.abiHash}`);
}

const files = listFiles(DIST).filter((p) => p !== "imd-deployment.json");
const declared = new Map(m.assets.map((a) => [a.path, a.sha256]));
if (m.assets.length > 128) fail(`too many assets: ${m.assets.length}`);
if (declared.size !== m.assets.length) fail("duplicate asset paths");
if (!declared.has("index.html")) fail("index.html not declared");
let total = statSync(join(DIST, "imd-deployment.json")).size;
for (const f of files) {
  const buf = readFileSync(join(DIST, f));
  total += buf.length;
  if (buf.length > 8 * 1024 * 1024) fail(`${f} exceeds 8 MiB`);
  if (!declared.has(f)) fail(`undeclared file ${f}`);
  else if (declared.get(f) !== sha256(buf)) fail(`hash mismatch ${f}`);
}
for (const p of declared.keys()) {
  if (!safePath(p)) fail(`asset path not relative: ${p}`);
  if (!files.includes(p)) fail(`declared asset missing: ${p}`);
  if (!/^[0-9a-f]{64}$/.test(declared.get(p))) fail(`bad hash format for ${p}`);
}

// Addresses and URLs may appear only inside `network` (and walletAddChain) or the handoff contracts.
const outside = JSON.stringify({ ...m, network: undefined, walletAddChain: undefined });
const known = new Set(h.contracts.map((c) => c.address.toLowerCase()));
for (const a of outside.match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g) ?? []) if (!known.has(a.toLowerCase())) fail(`address outside handoff: ${a}`);
if (/https?:\/\//.test(outside)) fail("URL outside network block");

if (total > 16 * 1024 * 1024) fail(`export is ${total} bytes, above the 16 MiB working budget`);
if (errors.length) {
  console.error(errors.map((e) => `FAIL ${e}`).join("\n"));
  process.exit(1);
}
console.log(`OK imd-deployment.json: ${m.contracts.length} contracts, ${m.assets.length} assets, ${total} bytes total`);
