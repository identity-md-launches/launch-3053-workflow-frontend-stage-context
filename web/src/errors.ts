import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

/** True when the visitor declined the request in the wallet (EIP-1193 code 4001). */
export function isUserRejection(err: unknown): boolean {
  if (err instanceof BaseError && err.walk((e) => e instanceof UserRejectedRequestError)) return true;
  const e = err as { code?: number; cause?: { code?: number }; message?: string } | undefined;
  return e?.code === 4001 || e?.cause?.code === 4001 || /user rejected|user denied|rejected the request/i.test(e?.message ?? "");
}

/** Custom errors from HamsterBadge and WheelSpinCheckIn, in plain words with a next step. */
const REVERTS: Record<string, string> = {
  AlreadyMinted: "This wallet already used its free mint. Each wallet gets one badge.",
  MaxSupplyReached: "All 10,000 badges are minted. Ask a holder to send you one to start spinning.",
  NotBadgeHolder: "This wallet holds no Hamster Badge. Mint one first, then spin.",
  AlreadySpunToday: "Today's spin is already recorded. The next one opens at 00:00 UTC.",
  ERC721NonexistentToken: "That badge does not exist yet.",
};

/** A short, recoverable message for any error a read, simulation or transaction can raise. */
export function describeError(err: unknown): string {
  if (isUserRejection(err)) return "Request declined in your wallet. Nothing was sent.";
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = revert?.data?.errorName;
    if (name && REVERTS[name]) return REVERTS[name];
    if (revert?.reason) return `The contract refused: ${revert.reason}.`;
    if (/insufficient funds/i.test(err.message)) return "Not enough Sepolia ETH for gas. Get some from a faucet, then try again.";
    if (/fetch|network|timeout|HTTP request failed/i.test(err.message)) return "Unable to reach the Sepolia RPC. Check your connection and try again.";
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : "Unable to complete the request. Try again.";
}
