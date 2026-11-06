/**
 * The site's single configuration.
 *
 * Contract addresses, the chain id, ABIs, public RPC URLs and the wallet_addEthereumChain
 * parameters are not written here: they are read at runtime from `./imd-deployment.json`, the
 * deployment manifest published beside index.html (built from the workflow handoff and the vetted
 * network table by web/scripts/manifest.mjs), and from the ABI files it points to. Nothing else in
 * the app holds an address or chain id, so the page cannot disagree with the manifest.
 *
 * No private RPC, API key or WalletConnect project id exists in this bundle.
 */
import { createConfig, fallback, http, type Config } from "wagmi";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { defineChain, getAddress, type Abi, type Address, type Chain } from "viem";

export const SITE_NAME = "SqueekBoard";
export const SITE_DESCRIPTION =
  "Mint a free Hamster Badge on Sepolia, record one wheel spin a day and climb the streak leaderboard.";
/** Only set when a brief supplies its own project id. None was supplied, so no relay is used. */
export const walletConnectProjectId = "";

export const MANIFEST_PATH = "./imd-deployment.json";

export type ManifestContract = { name: string; address: string; abiHash: string; abiPath: string };
export type Manifest = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: ManifestContract[];
  assets: { path: string; sha256: string }[];
  network?: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets?: string[];
    uniswapV4?: Record<string, unknown>;
  };
  walletAddChain?: {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
};

export type DeployedContract = { name: string; address: Address; abi: Abi; abiHash: string };

export type Deployment = {
  manifest: Manifest;
  chain: Chain;
  badge: DeployedContract;
  checkIn: DeployedContract;
  explorer: string;
  faucets: string[];
  wagmi: Config;
};

const relative = (p: string) => {
  if (/^[a-z]+:|^\/|\.\./i.test(p)) throw new Error(`Refusing non-relative path in manifest: ${p}`);
  return `./${p}`;
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Unable to load ${path} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

/** Loads imd-deployment.json and its ABIs, and builds the chain and wagmi config from them. */
export async function loadDeployment(): Promise<Deployment> {
  const manifest = await getJson<Manifest>(MANIFEST_PATH);
  const net = manifest.network;
  if (!net) throw new Error("imd-deployment.json has no network block, so there is no RPC to read from.");
  if (net.chainId !== manifest.chainId) throw new Error("Manifest chain id and network block disagree.");

  const load = async (name: string): Promise<DeployedContract> => {
    const c = manifest.contracts.find((x) => x.name === name);
    if (!c) throw new Error(`imd-deployment.json lists no ${name} contract.`);
    const abi = await getJson<Abi>(relative(c.abiPath));
    return { name, address: getAddress(c.address), abi, abiHash: c.abiHash };
  };
  const [badge, checkIn] = await Promise.all([load("HamsterBadge"), load("WheelSpinCheckIn")]);

  const chain = defineChain({
    id: manifest.chainId,
    name: net.name,
    nativeCurrency: net.nativeCurrency,
    rpcUrls: { default: { http: net.rpcUrls } },
    blockExplorers: { default: { name: "Explorer", url: net.explorer } },
    testnet: net.testnet,
  });

  const wagmi = createConfig({
    chains: [chain],
    // EIP-6963 discovery lists every installed extension under its own name.
    multiInjectedProviderDiscovery: true,
    connectors: [injected(), coinbaseWallet({ appName: SITE_NAME })],
    // Public RPCs from the network block, tried in order.
    transports: { [chain.id]: fallback(net.rpcUrls.map((url) => http(url, { batch: true }))) },
  });

  return {
    manifest,
    chain,
    badge,
    checkIn,
    explorer: net.explorer.replace(/\/$/, ""),
    faucets: net.faucets ?? [],
    wagmi,
  };
}
