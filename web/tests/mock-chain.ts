/**
 * A mocked Sepolia for interaction tests: answers the page's public-RPC traffic from an in-memory
 * model of HamsterBadge and WheelSpinCheckIn (encoded with the real ABIs), and a mock EIP-6963
 * wallet that the page discovers like an extension. No request leaves the machine and no real
 * transaction is signed or broadcast.
 */
import { readFileSync } from "node:fs";
import type { Page, Route } from "@playwright/test";
import {
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
  keccak256,
  pad,
  toHex,
  toFunctionSelector,
  type Abi,
  type Address,
  type Hex,
} from "viem";

const root = new URL("../../", import.meta.url);
const handoff = JSON.parse(readFileSync(new URL("web/deploy/deployment.json", root), "utf8"));
export const network = JSON.parse(readFileSync(new URL("web/deploy/network.json", root), "utf8"));
const abiOf = (name: string) => JSON.parse(readFileSync(new URL(`docs/abi/${name}.json`, root), "utf8")) as Abi;
const addrOf = (name: string) => (handoff.contracts.find((c: { name: string }) => c.name === name).address as string).toLowerCase();

export const BADGE = { address: addrOf("HamsterBadge"), abi: abiOf("HamsterBadge") };
export const CHECKIN = { address: addrOf("WheelSpinCheckIn"), abi: abiOf("WheelSpinCheckIn") };
export const ACCOUNT = "0x00000000000000000000000000000000c0ffee01" as Address;
export const LONG_ACCOUNT_ROWS = 100;

type Wallet = { hasMinted: boolean; balance: bigint; current: bigint; longest: bigint; total: bigint; lastDay: bigint };
export type ChainState = {
  supply: bigint;
  max: bigint;
  today: bigint;
  ethBalance: bigint;
  wallets: Map<string, Wallet>;
  board: string[];
  block: bigint;
  receipts: Map<string, unknown>;
  sent: { to: string; data: string; value?: string }[];
  calls: string[];
};

const blank = (): Wallet => ({ hasMinted: false, balance: 0n, current: 0n, longest: 0n, total: 0n, lastDay: 0n });

export function newChain(opts: { boardSize?: number; supply?: bigint } = {}): ChainState {
  const today = BigInt(Math.floor(Date.now() / 86_400_000));
  const s: ChainState = {
    supply: opts.supply ?? 41n,
    max: 10_000n,
    today,
    ethBalance: 10n ** 17n,
    wallets: new Map(),
    board: [],
    block: 12_100_000n,
    receipts: new Map(),
    sent: [],
    calls: [],
  };
  for (let i = 0; i < (opts.boardSize ?? 3); i++) {
    const a = `0x${(0xabc000 + i).toString(16).padStart(40, "f")}`;
    const longest = BigInt(400 - i * 3);
    s.wallets.set(a, { hasMinted: true, balance: 1n, current: longest - 1n, longest, total: longest + 25n, lastDay: today - 1n });
    s.board.push(a);
  }
  return s;
}

const w = (s: ChainState, a: string) => s.wallets.get(a.toLowerCase()) ?? blank();
const live = (s: ChainState, r: Wallet) => (r.total === 0n || s.today > r.lastDay + 1n ? 0n : r.current);
const rankOf = (s: ChainState, a: string) => BigInt(s.board.indexOf(a.toLowerCase()) + 1);

class Revert extends Error {
  constructor(public data: Hex) {
    super("execution reverted");
  }
}

function call(s: ChainState, to: string, data: Hex, from?: string): Hex {
  const c = to.toLowerCase() === BADGE.address ? BADGE : to.toLowerCase() === CHECKIN.address ? CHECKIN : null;
  if (!c) throw new Error(`call to unknown address ${to}`);
  const { functionName, args = [] } = decodeFunctionData({ abi: c.abi, data });
  s.calls.push(functionName);
  const out = (result: unknown) => encodeFunctionResult({ abi: c.abi, functionName, result } as never);
  const err = (errorName: string, a: unknown[] = []) => new Revert(encodeErrorResult({ abi: c.abi, errorName, args: a } as never));
  const a0 = (args[0] as string | undefined) ?? "";
  switch (functionName) {
    case "totalSupply": return out(s.supply);
    case "MAX_SUPPLY": return out(s.max);
    case "remainingSupply": return out(s.max - s.supply);
    case "hasMinted": return out(w(s, a0).hasMinted);
    case "balanceOf": return out(w(s, a0).balance);
    case "canMint": return out(!w(s, a0).hasMinted && s.supply < s.max);
    case "totalParticipants": return out(BigInt([...s.wallets.values()].filter((x) => x.total > 0n).length));
    case "totalSpins": return out([...s.wallets.values()].reduce((n, x) => n + x.total, 0n));
    case "nextDayStartsAt": return out((s.today + 1n) * 86_400n);
    case "currentDay": return out(s.today);
    case "statsOf": {
      const r = w(s, a0);
      return out([live(s, r), r.longest, r.total, r.lastDay, r.total > 0n && r.lastDay === s.today, rankOf(s, a0)]);
    }
    case "leaderboard":
      return out(s.board.map((a) => { const r = w(s, a); return { account: a, longestStreak: r.longest, currentStreak: live(s, r), totalCheckIns: r.total, lastSpinDay: r.lastDay }; }));
    case "mint": {
      if (!from) throw new Error("mint without from");
      if (w(s, from).hasMinted) throw err("AlreadyMinted", [from]);
      if (s.supply >= s.max) throw err("MaxSupplyReached");
      return out(s.supply + 1n);
    }
    case "spin": {
      if (!from) throw new Error("spin without from");
      const r = w(s, from);
      if (r.balance === 0n) throw err("NotBadgeHolder", [from]);
      if (r.total > 0n && r.lastDay === s.today) throw err("AlreadySpunToday", [from, s.today]);
      return out(r.lastDay + 1n === s.today ? r.current + 1n : 1n);
    }
    default:
      throw new Error(`unmocked function ${functionName}`);
  }
}

const TRANSFER = keccak256(toHex("Transfer(address,address,uint256)"));

/** Applies a transaction the mock wallet "signed" and stores its receipt. */
function send(s: ChainState, tx: { from: string; to: string; data: Hex }): Hex {
  call(s, tx.to, tx.data, tx.from); // same checks as the simulation
  const from = tx.from.toLowerCase();
  const r = { ...w(s, from) };
  const logs: unknown[] = [];
  const { functionName } = decodeFunctionData({ abi: tx.to.toLowerCase() === BADGE.address ? BADGE.abi : CHECKIN.abi, data: tx.data });
  if (functionName === "mint") {
    s.supply += 1n;
    r.hasMinted = true;
    r.balance += 1n;
    logs.push({ address: BADGE.address, topics: [TRANSFER, pad("0x0"), pad(from as Hex), pad(toHex(s.supply))], data: "0x" });
  } else if (functionName === "spin") {
    r.current = r.total > 0n && r.lastDay + 1n === s.today ? r.current + 1n : 1n;
    r.lastDay = s.today;
    r.total += 1n;
    if (r.current > r.longest) r.longest = r.current;
    if (!s.board.includes(from) && s.board.length < 100) s.board.push(from);
  }
  s.wallets.set(from, r);
  // keep the board sorted by longest streak, longest first
  s.board.sort((a, b) => (w(s, b).longest > w(s, a).longest ? 1 : w(s, b).longest < w(s, a).longest ? -1 : 0));
  s.block += 1n;
  const hash = keccak256(toHex(`tx-${s.sent.length}-${Date.now()}`));
  s.sent.push({ to: tx.to, data: tx.data });
  const blockHash = keccak256(toHex(`block-${s.block}`));
  s.receipts.set(hash, {
    transactionHash: hash, transactionIndex: "0x0", blockHash, blockNumber: toHex(s.block), from, to: tx.to,
    cumulativeGasUsed: "0x10000", gasUsed: "0x10000", effectiveGasPrice: "0x3b9aca00", contractAddress: null,
    logsBloom: `0x${"0".repeat(512)}`, status: "0x1", type: "0x2",
    logs: logs.map((l, i) => ({ ...(l as object), blockHash, blockNumber: toHex(s.block), transactionHash: hash, transactionIndex: "0x0", logIndex: toHex(i), removed: false })),
  });
  return hash;
}

function answer(s: ChainState, req: { id: number; method: string; params?: unknown[] }) {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: req.id, result });
  const p = (req.params ?? []) as never[];
  try {
    switch (req.method) {
      case "eth_chainId": return ok(toHex(network.network.chainId));
      case "net_version": return ok(String(network.network.chainId));
      case "eth_blockNumber": return ok(toHex(s.block));
      case "eth_getBalance": return ok(toHex(s.ethBalance));
      case "eth_getTransactionCount": return ok("0x0");
      case "eth_gasPrice":
      case "eth_maxPriorityFeePerGas": return ok("0x3b9aca00");
      case "eth_estimateGas": return ok("0x20000");
      case "eth_getCode": return ok("0x6080");
      case "eth_getBlockByNumber":
        return ok({ number: toHex(s.block), hash: keccak256(toHex(`block-${s.block}`)), timestamp: toHex(Math.floor(Date.now() / 1000)), baseFeePerGas: "0x3b9aca00", gasLimit: "0x1c9c380", gasUsed: "0x0", transactions: [] });
      case "eth_call": {
        const tx = p[0] as { to: string; data?: Hex; input?: Hex; from?: string };
        return ok(call(s, tx.to, (tx.data ?? tx.input)!, tx.from));
      }
      case "eth_getTransactionReceipt": return ok(s.receipts.get(p[0]) ?? null);
      case "eth_getTransactionByHash": return ok(null);
      case "mock_send": return ok(send(s, p[0]));
      default: return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `mock: ${req.method} not supported` } };
    }
  } catch (e) {
    if (e instanceof Revert) return { jsonrpc: "2.0", id: req.id, error: { code: 3, message: "execution reverted", data: e.data } };
    return { jsonrpc: "2.0", id: req.id, error: { code: -32000, message: String((e as Error).message) } };
  }
}

/** Routes every public RPC in the network block to the mock chain. */
export async function mockRpc(page: Page, s: ChainState, opts: { failReads?: boolean; failSupplyReads?: boolean } = {}) {
  const urls: string[] = network.network.rpcUrls;
  await page.route((u) => urls.some((x) => u.href.startsWith(x)), async (route: Route) => {
    if (opts.failReads) return route.fulfill({ status: 503, body: "unavailable" });
    const body = route.request().postDataJSON();
    const batch = Array.isArray(body) ? body : [body];
    if (opts.failSupplyReads && batch.some((req) => req.method === "eth_call" &&
      (req.params?.[0]?.data ?? req.params?.[0]?.input)?.startsWith(toFunctionSelector("totalSupply()")))) {
      return route.fulfill({ status: 503, body: "public supply reads unavailable" });
    }
    const res = Array.isArray(body) ? body.map((b) => answer(s, b)) : answer(s, body);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(res) });
  });
  // Nothing else may leave the page during tests.
  await page.route((u) => !u.href.startsWith("http://127.0.0.1") && !urls.some((x) => u.href.startsWith(x)), (r) => r.abort());
}

/**
 * A mock browser wallet announced over EIP-6963. It starts on `startChain` and knows only the
 * chains in `knownChains`, so switching to Sepolia fails with 4902 until it is added. Signing
 * requests are forwarded to the mock chain as `mock_send`.
 */
export async function mockWallet(page: Page, opts: { startChain?: number; knowsSepolia?: boolean } = {}) {
  await page.addInitScript(
    ({ account, startChain, knowsSepolia, rpc, sepolia }) => {
      type Listener = (...a: unknown[]) => void;
      const listeners: Record<string, Listener[]> = {};
      const emit = (ev: string, ...a: unknown[]) => (listeners[ev] ?? []).forEach((f) => f(...a));
      const w = window as unknown as Record<string, unknown>;
      w.__wallet = { chainId: startChain, known: knowsSepolia ? [startChain, sepolia] : [startChain], connected: false, added: [] as unknown[], switches: 0, rejectNext: false, requests: [] as string[] };
      const st = w.__wallet as { chainId: number; known: number[]; connected: boolean; added: unknown[]; switches: number; rejectNext: boolean; requests: string[] };
      const forward = async (method: string, params: unknown) => {
        const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
        const j = await r.json();
        if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code, data: j.error.data });
        return j.result;
      };
      const reject = () => Object.assign(new Error("User rejected the request."), { code: 4001 });
      const provider = {
        isMockWallet: true,
        on: (ev: string, f: Listener) => { (listeners[ev] ??= []).push(f); return provider; },
        removeListener: (ev: string, f: Listener) => { listeners[ev] = (listeners[ev] ?? []).filter((x) => x !== f); return provider; },
        async request({ method, params }: { method: string; params?: unknown[] }) {
          st.requests.push(method);
          switch (method) {
            case "eth_requestAccounts":
              if (st.rejectNext) { st.rejectNext = false; throw reject(); }
              st.connected = true;
              emit("connect", { chainId: "0x" + st.chainId.toString(16) });
              return [account];
            case "eth_accounts": return st.connected ? [account] : [];
            case "eth_chainId": return "0x" + st.chainId.toString(16);
            case "wallet_requestPermissions":
            case "wallet_revokePermissions": return [];
            case "wallet_switchEthereumChain": {
              const id = parseInt((params![0] as { chainId: string }).chainId, 16);
              if (!st.known.includes(id)) throw Object.assign(new Error("Unrecognized chain ID. Try adding the chain using wallet_addEthereumChain first."), { code: 4902 });
              st.chainId = id;
              st.switches++;
              emit("chainChanged", "0x" + id.toString(16));
              return null;
            }
            case "wallet_addEthereumChain": {
              st.added.push(params![0]);
              st.known.push(parseInt((params![0] as { chainId: string }).chainId, 16));
              return null;
            }
            case "eth_sendTransaction":
              if (st.rejectNext) { st.rejectNext = false; throw reject(); }
              return forward("mock_send", params);
            default:
              return forward(method, params ?? []);
          }
        },
      };
      const info = { uuid: "5b0c8f1e-0000-4000-8000-000000000001", name: "Mock Wallet", rdns: "test.mock.wallet", icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'%3E%3Crect width='28' height='28' fill='%23345'/%3E%3C/svg%3E" };
      const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { account: ACCOUNT, startChain: opts.startChain ?? network.network.chainId, knowsSepolia: opts.knowsSepolia ?? true, rpc: network.network.rpcUrls[0], sepolia: network.network.chainId },
  );
}
