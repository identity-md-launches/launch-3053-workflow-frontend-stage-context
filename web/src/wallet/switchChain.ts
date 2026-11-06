import type { Connector } from "wagmi";
import { numberToHex } from "viem";
import type { Manifest } from "../config";

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

/** True when a wallet says it does not know the requested chain (EIP-3085 code 4902 and variants). */
export function isUnknownChain(err: unknown): boolean {
  const e = err as { code?: number; data?: { originalError?: { code?: number } }; message?: string } | undefined;
  const code = e?.code ?? e?.data?.originalError?.code;
  return code === 4902 || /4902|unrecognized chain|unknown chain|not been added|not added|try adding/i.test(e?.message ?? "");
}

/**
 * Asks the wallet to switch to the manifest's chain. When the wallet does not know it, offers
 * wallet_addEthereumChain with the vetted walletAddChain parameters, then switches again.
 */
export async function switchToDeploymentChain(connector: Connector, manifest: Manifest): Promise<void> {
  const provider = (await connector.getProvider()) as Eip1193;
  const chainId = manifest.walletAddChain?.chainId ?? numberToHex(manifest.chainId);
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (err) {
    if (!isUnknownChain(err) || !manifest.walletAddChain) throw err;
    await provider.request({ method: "wallet_addEthereumChain", params: [manifest.walletAddChain] });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  }
}
