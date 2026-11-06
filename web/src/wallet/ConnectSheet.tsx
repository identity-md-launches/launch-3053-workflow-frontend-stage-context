import { useEffect, useRef, useState } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect, type Connector } from "wagmi";
import { WALLET_ICONS } from "./wallet-icons";
import { OPEN_IN, isMobileBrowser } from "./open-in";
import { switchToDeploymentChain } from "./switchChain";
import { useDeployment } from "../deployment";
import { describeError, isUserRejection } from "../errors";
import { shortAddress } from "../format";

/**
 * The one wallet control: Connect (opens the sheet), "Switch to <chain>" on the wrong network,
 * and the short address with Disconnect once connected. The sheet is a native <dialog>, so focus
 * is trapped while open, Escape closes it and focus returns to the trigger.
 */
export function ConnectSheet({ size = "small" }: { size?: "small" | "large" }) {
  const dep = useDeployment();
  const mobile = isMobileBrowser();
  const { address, isConnected, chainId, connector } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending, variables } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (isConnected) dialog.current?.close();
  }, [isConnected]);

  const named = connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const listed = [...connectors.filter((c) => c.type === "injected"), ...connectors.filter((c) => c.type !== "injected")]
    .filter((c) => !(c.id === "injected" && named))
    .filter((c) => !mobile || c.type !== "injected");
  const label = (c: Connector) =>
    c.id === "injected" ? "Browser wallet" : c.id === "coinbaseWalletSDK" && mobile ? "Coinbase Smart Wallet" : c.name;
  const icon = (c: Connector) => c.icon ?? WALLET_ICONS[c.id];

  const cls = size === "large" ? "btn btn-primary btn-large" : "btn btn-primary";

  if (isConnected && address && connector) {
    if (chainId !== dep.chain.id) {
      return (
        <span className="wallet-wrong">
          <button
            className={cls}
            disabled={switching}
            onClick={async () => {
              setSwitching(true);
              setNote("");
              try {
                await switchToDeploymentChain(connector, dep.manifest);
              } catch (err) {
                setNote(isUserRejection(err) ? "Switch declined in the wallet." : describeError(err));
              } finally {
                setSwitching(false);
              }
            }}
          >
            {switching ? "Check your wallet…" : `Switch to ${dep.chain.name}`}
          </button>
          {note && <span className="note" role="status">{note}</span>}
        </span>
      );
    }
    if (size === "large") return null;
    return (
      <button className="btn btn-quiet" onClick={() => disconnect()} title={`Disconnect ${address}`}>
        <span className="mono">{shortAddress(address)}</span>
        <span className="sr-only">, disconnect</span>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M6 3H4a1 1 0 00-1 1v8a1 1 0 001 1h2M10 11l3-3-3-3M13 8H6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  return (
    <>
      <button className={cls} onClick={() => { setNote(""); dialog.current?.showModal(); }}>
        Connect wallet
      </button>
      <dialog
        ref={dialog}
        className="sheet"
        aria-labelledby="sheet-title"
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
      >
        <div className="sheet-body">
          <div className="sheet-head">
            <h2 id="sheet-title">Connect a wallet</h2>
            <button className="x" aria-label="Close" onClick={() => dialog.current?.close()}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
            </button>
          </div>
          {mobile &&
            OPEN_IN.map((w) => (
              <a key={w.id} className="row" href={w.href(location.href)}>
                <img className="ic" width={28} height={28} src={WALLET_ICONS[w.id]} alt="" />
                <span>Open in {w.name}</span>
              </a>
            ))}
          {listed.map((c) => (
            <button
              key={c.uid}
              className="row"
              disabled={isPending}
              onClick={() =>
                connect(
                  { connector: c },
                  {
                    onError: (err) =>
                      setNote(isUserRejection(err) ? `${label(c)} request declined. Pick a wallet to try again.` : describeError(err)),
                  },
                )
              }
            >
              {icon(c) ? <img className="ic" width={28} height={28} src={icon(c)} alt="" /> : <span className="ic" aria-hidden="true" />}
              <span>
                {label(c)}
                {isPending && variables?.connector === c ? " · opening…" : ""}
              </span>
            </button>
          ))}
          <p className="note" role="status">{note}</p>
        </div>
      </dialog>
    </>
  );
}
