import { useState } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import { decodeEventLog, type Abi, type Address, type Hash, type TransactionReceipt } from "viem";
import { describeError } from "./errors";

export type TxState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "wallet" }
  | { phase: "pending"; hash: Hash }
  | { phase: "done"; hash: Hash; receipt: TransactionReceipt }
  | { phase: "error"; message: string; hash?: Hash };

/**
 * One contract write: simulate first (shows the revert reason before the wallet opens), then ask
 * the wallet to sign, then wait for the receipt from the public RPC.
 */
export function useTx() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [state, setState] = useState<TxState>({ phase: "idle" });

  async function run(args: { address: Address; abi: Abi; functionName: string; account: Address }) {
    if (!publicClient || !walletClient) {
      setState({ phase: "error", message: "Wallet not ready. Reconnect and try again." });
      return null;
    }
    let hash: Hash | undefined;
    try {
      setState({ phase: "checking" });
      const { request } = await publicClient.simulateContract({ ...args, args: [] });
      setState({ phase: "wallet" });
      hash = await walletClient.writeContract(request);
      setState({ phase: "pending", hash });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setState({ phase: "error", message: "The transaction reverted on chain. Nothing changed.", hash });
        return null;
      }
      setState({ phase: "done", hash, receipt });
      return receipt;
    } catch (err) {
      setState({ phase: "error", message: describeError(err), hash });
      return null;
    }
  }

  const busy = state.phase === "checking" || state.phase === "wallet" || state.phase === "pending";
  return { state, run, busy, reset: () => setState({ phase: "idle" }) };
}

/** The token id from the Transfer event in a mint receipt. */
export function mintedTokenId(receipt: TransactionReceipt, abi: Abi, badge: Address): bigint | null {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== badge.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (ev.eventName === "Transfer") return (ev.args as unknown as { tokenId: bigint }).tokenId;
    } catch {
      /* not a Transfer */
    }
  }
  return null;
}
