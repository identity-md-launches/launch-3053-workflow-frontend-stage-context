// Shared helpers for the deployment manifest scripts. No dependencies beyond Node and viem.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes } from "viem";

export const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ROOT = join(WEB, "..");
export const DIST = join(ROOT, "dist");
export const ABI_SOURCE = join(ROOT, "docs", "abi");
export const HANDOFF = join(WEB, "deploy", "deployment.json");
export const NETWORK = join(WEB, "deploy", "network.json");

export const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** JSON with object keys sorted at every level and no whitespace. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** canonicalKeccak(abi) as the handoff states it: 64 lowercase hex characters, no 0x. */
export const abiHash = (abi) => keccak256(toBytes(canonical(abi))).slice(2);

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Every file under `dir`, as forward-slash paths relative to it, sorted. */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}
