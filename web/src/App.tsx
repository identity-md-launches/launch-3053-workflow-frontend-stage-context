import { useEffect, useState } from "react";
import { useBalance, useConnection, useReadContract, useReadContracts } from "wagmi";
import type { Address, Hash } from "viem";
import { useDeployment } from "./deployment";
import { ConnectSheet } from "./wallet/ConnectSheet";
import { mintedTokenId, useTx, type TxState } from "./useTx";
import { dayLabel, formatCount, plural, shortAddress, untilLabel } from "./format";
import { describeError } from "./errors";

type Row = { account: Address; longestStreak: bigint; currentStreak: bigint; totalCheckIns: bigint; lastSpinDay: bigint };
type Stats = readonly [bigint, bigint, bigint, bigint, boolean, bigint];

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function App() {
  const dep = useDeployment();
  const { badge, checkIn, chain } = dep;
  const { address, isConnected, chainId } = useConnection();
  const onChain = isConnected && chainId === chain.id;
  const now = useNow();

  // Public state: readable before any wallet connects, refreshed every 30 seconds.
  const pub = useReadContracts({
    contracts: [
      { address: badge.address, abi: badge.abi, functionName: "totalSupply" },
      { address: badge.address, abi: badge.abi, functionName: "MAX_SUPPLY" },
      { address: checkIn.address, abi: checkIn.abi, functionName: "totalParticipants" },
      { address: checkIn.address, abi: checkIn.abi, functionName: "totalSpins" },
      { address: checkIn.address, abi: checkIn.abi, functionName: "nextDayStartsAt" },
    ],
    allowFailure: false,
    query: { refetchInterval: 30_000 },
  });
  const board = useReadContract({
    address: checkIn.address,
    abi: checkIn.abi,
    functionName: "leaderboard",
    query: { refetchInterval: 30_000 },
  });

  // Wallet state: only once a wallet is connected.
  const me = useReadContracts({
    contracts: address
      ? [
          { address: badge.address, abi: badge.abi, functionName: "hasMinted", args: [address] },
          { address: badge.address, abi: badge.abi, functionName: "balanceOf", args: [address] },
          { address: checkIn.address, abi: checkIn.abi, functionName: "statsOf", args: [address] },
        ]
      : [],
    allowFailure: false,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });
  const gas = useBalance({ address, chainId: chain.id, query: { enabled: !!address } });

  const [supply, maxSupply, participants, spins, nextDay] = (pub.data ?? []) as readonly bigint[];
  const [hasMinted, badgeBalance, stats] = (me.data ?? []) as readonly [boolean?, bigint?, Stats?];
  const rows = (board.data ?? []) as readonly Row[];

  // Re-read when the UTC day rolls over, so "Spun today" turns back into "Spin today".
  useEffect(() => {
    if (nextDay && now / 1000 >= Number(nextDay)) {
      pub.refetch();
      me.refetch();
      board.refetch();
    }
  }, [now, nextDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const mintTx = useTx();
  const spinTx = useTx();
  const [myTokenId, setMyTokenId] = useState<bigint | null>(null);
  const refresh = () => Promise.all([pub.refetch(), me.refetch(), board.refetch(), gas.refetch()]);

  const soldOut = supply !== undefined && maxSupply !== undefined && supply >= maxSupply;
  const holds = (badgeBalance ?? 0n) > 0n;
  const canMint = onChain && hasMinted === false && !soldOut;
  const spunToday = stats?.[4] ?? false;
  const canSpin = onChain && holds && !spunToday;
  const noGas = onChain && gas.data !== undefined && gas.data.value === 0n;
  const loadingMe = isConnected && me.isPending;

  const doMint = async () => {
    if (!address) return;
    spinTx.reset();
    const r = await mintTx.run({ address: badge.address, abi: badge.abi, functionName: "mint", account: address });
    if (r) {
      setMyTokenId(mintedTokenId(r, badge.abi, badge.address));
      await refresh();
    }
  };
  const doSpin = async () => {
    if (!address) return;
    mintTx.reset();
    const r = await spinTx.run({ address: checkIn.address, abi: checkIn.abi, functionName: "spin", account: address });
    if (r) await refresh();
  };

  const nextSpinIn = nextDay ? untilLabel(Number(nextDay), now) : null;

  return (
    <div className="page">
      <header className="top">
        <div className="shell top-inner">
          <span className="brand">
            <img src="./favicon.svg" width={28} height={28} alt="" />
            SqueekBoard
          </span>
          {onChain && <ConnectSheet />}
        </div>
      </header>

      <main id="main" className="shell">
        <section className="hero" aria-labelledby="title">
          <div className="intro">
            <h1 id="title">Spin the wheel every day</h1>
            <p className="lede">
              Mint a free Hamster Badge, then record one wheel spin per UTC day on {chain.name} to grow your streak.
            </p>
            <img className="art" src="./badge.svg" width={320} height={320} alt="Hamster Badge artwork: a hamster in its wheel" />
          </div>

          <div className="card action" aria-label="Your badge and today's spin">
            {!isConnected && (
              <div className="connect-cta">
                <ConnectSheet size="large" />
                <p className="hint">Connect to see your streak, mint and spin.</p>
              </div>
            )}
            {isConnected && !onChain && (
              <div className="connect-cta">
                <ConnectSheet size="large" />
                <p className="hint">Your wallet is on another network. The badge and spins live on {chain.name}.</p>
              </div>
            )}

            <dl className="stats">
              <Stat label="Current streak" value={stats ? plural(Number(stats[0]), "day", "days") : undefined} loading={loadingMe} />
              <Stat label="Longest streak" value={stats ? plural(Number(stats[1]), "day", "days") : undefined} loading={loadingMe} />
              <Stat label="Check-ins" value={stats ? formatCount(stats[2]) : undefined} loading={loadingMe} />
              <Stat label="Rank" value={stats ? (stats[5] > 0n ? `#${stats[5]}` : "Not ranked") : undefined} loading={loadingMe} />
            </dl>
            {me.error && <p className="error" role="alert">{describeError(me.error)}</p>}

            <ol className="steps">
              <li className="step">
                <div className="step-text">
                  <h2>Mint your badge</h2>
                  <p>{mintStatus({ onChain, hasMinted, holds, badgeBalance, soldOut, supply, maxSupply, myTokenId })}</p>
                </div>
                {!(hasMinted && holds) && (
                  <button
                    className={`btn ${canMint && !holds ? "btn-primary" : "btn-secondary"}`}
                    onClick={doMint}
                    disabled={!canMint || mintTx.busy}
                  >
                    {mintTx.busy ? busyLabel(mintTx.state) : soldOut ? "Sold out" : hasMinted ? "Mint used" : "Mint badge"}
                  </button>
                )}
                {hasMinted && holds && <Done label="Badge held" />}
                <TxNote state={mintTx.state} explorer={dep.explorer} doneText={myTokenId ? `Badge #${myTokenId} minted.` : "Badge minted."} />
              </li>

              <li className="step">
                <div className="step-text">
                  <h2>Spin today</h2>
                  <p>{spinStatus({ onChain, holds, spunToday, nextSpinIn, stats })}</p>
                </div>
                {spunToday ? (
                  <Done label="Spun today" />
                ) : (
                  <button className={`btn ${canSpin ? "btn-primary" : "btn-secondary"}`} onClick={doSpin} disabled={!canSpin || spinTx.busy}>
                    {spinTx.busy ? busyLabel(spinTx.state) : "Spin today"}
                  </button>
                )}
                <TxNote state={spinTx.state} explorer={dep.explorer} doneText="Spin recorded." />
              </li>
            </ol>

            {noGas && (
              <p className="warn">
                This wallet has no {chain.name} ETH for gas. Get some from{" "}
                {dep.faucets.slice(0, 2).map((f, i) => (
                  <span key={f}>
                    {i > 0 && " or "}
                    <a href={f} target="_blank" rel="noreferrer">{new URL(f).hostname.replace(/^www\./, "")}</a>
                  </span>
                ))}
                .
              </p>
            )}
          </div>
        </section>

        <section className="section" aria-labelledby="board-title">
          <div className="section-head">
            <h2 id="board-title">Longest streaks</h2>
            <p className="muted">
              {spins !== undefined && participants !== undefined
                ? `${plural(Number(participants), "wallet has", "wallets have")} spun ${plural(Number(spins), "time", "times")}.`
                : pub.isPending ? "Loading totals…" : "Totals unavailable."}
            </p>
            {pub.error && (
              <div className="empty">
                <p className="error" role="alert">Unable to load supply and totals.</p>
                {pub.data && <p className="muted">Last successful values are shown.</p>}
                <button className="btn btn-secondary" disabled={pub.isFetching} onClick={() => pub.refetch()}>
                  {pub.isFetching ? "Retrying supply and totals…" : "Retry supply and totals"}
                </button>
              </div>
            )}
          </div>
          <Leaderboard rows={rows} me={address} loading={board.isPending} error={board.error ? describeError(board.error) : null} retry={() => board.refetch()} />
        </section>

        <section className="section" aria-labelledby="about-title">
          <h2 id="about-title">How it works</h2>
          <div className="facts">
            <div className="card fact">
              <h3>Hamster Badge</h3>
              <p>
                {supply !== undefined && maxSupply !== undefined
                  ? `${formatCount(supply)} of ${formatCount(maxSupply)} minted.`
                  : pub.isPending ? "Reading supply…" : "Supply unavailable."}{" "}
                One free badge per wallet; you pay gas only.
              </p>
              <ContractLink name="HamsterBadge" address={badge.address} explorer={dep.explorer} />
            </div>
            <div className="card fact">
              <h3>Daily wheel spin</h3>
              <p>
                One spin per UTC day while you hold a badge. Missing a whole day resets your current streak; your longest streak
                and check-ins stay.
              </p>
              <ContractLink name="WheelSpinCheckIn" address={checkIn.address} explorer={dep.explorer} />
            </div>
          </div>
        </section>
      </main>

      <footer className="shell foot">
        <p className="muted">
          {chain.name} testnet (chain {chain.id}). Spins have no prize and badges have no price. No contract has an owner.
        </p>
      </footer>
    </div>
  );
}

function Stat({ label, value, loading }: { label: string; value?: string; loading: boolean }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className="num">{loading ? <span className="skeleton" aria-label="Loading" /> : (value ?? "–")}</dd>
    </div>
  );
}

function Done({ label }: { label: string }) {
  return (
    <span className="done">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </span>
  );
}

function busyLabel(s: TxState) {
  if (s.phase === "checking") return "Checking…";
  if (s.phase === "wallet") return "Confirm in wallet…";
  return "Confirming…";
}

function TxLink({ hash, explorer }: { hash: Hash; explorer: string }) {
  return (
    <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">
      View transaction
    </a>
  );
}

function TxNote({ state, explorer, doneText }: { state: TxState; explorer: string; doneText: string }) {
  let body: React.ReactNode = null;
  if (state.phase === "pending") body = <>Sent. Waiting for a block… <TxLink hash={state.hash} explorer={explorer} /></>;
  if (state.phase === "done") body = <>{doneText} <TxLink hash={state.hash} explorer={explorer} /></>;
  if (state.phase === "error")
    body = (
      <span className="error-text">
        {state.message} {state.hash && <TxLink hash={state.hash} explorer={explorer} />}
      </span>
    );
  return (
    <p className="tx-note" role="status">
      {body}
    </p>
  );
}

function mintStatus(p: {
  onChain: boolean;
  hasMinted?: boolean;
  holds: boolean;
  badgeBalance?: bigint;
  soldOut: boolean;
  supply?: bigint;
  maxSupply?: bigint;
  myTokenId: bigint | null;
}) {
  const left =
    p.supply !== undefined && p.maxSupply !== undefined ? `${formatCount(p.maxSupply - p.supply)} of ${formatCount(p.maxSupply)} left.` : "";
  if (!p.onChain || p.hasMinted === undefined) return `Free, you pay gas only. ${left}`.trim();
  if (p.hasMinted && p.holds)
    return p.myTokenId ? `You hold Hamster Badge #${p.myTokenId}.` : `You hold ${plural(Number(p.badgeBalance ?? 0n), "badge", "badges")}.`;
  if (p.hasMinted) return "Your free mint is used and the badge left this wallet. Spinning needs a badge here.";
  if (p.soldOut) return p.holds ? "All badges are minted. You hold one received by transfer." : "All 10,000 badges are minted.";
  if (p.holds) return `You hold a badge received by transfer, and can still mint your own. ${left}`;
  return `Calls mint() on HamsterBadge. Free, you pay gas only. ${left}`;
}

function spinStatus(p: { onChain: boolean; holds: boolean; spunToday: boolean; nextSpinIn: string | null; stats?: Stats }) {
  if (!p.onChain || !p.stats) return "One spin per UTC day while you hold a badge.";
  if (p.spunToday) return p.nextSpinIn ? `Recorded for today. Next spin opens in ${p.nextSpinIn}, at 00:00 UTC.` : "Recorded for today.";
  if (!p.holds) return "Needs a Hamster Badge in this wallet. Mint one first.";
  const current = Number(p.stats[0]);
  if (current > 0) return `Spin before 00:00 UTC to make it ${plural(current + 1, "day", "days")} in a row.`;
  if (p.stats[2] > 0n) return `Your last streak ended after ${dayLabel(Number(p.stats[3]))}. Spin to start a new one.`;
  return "Calls spin() on WheelSpinCheckIn. Starts your streak at 1 day.";
}

function Leaderboard({ rows, me, loading, error, retry }: { rows: readonly Row[]; me?: Address; loading: boolean; error: string | null; retry: () => void }) {
  if (loading) return <p className="muted">Loading the leaderboard…</p>;
  if (error)
    return (
      <div className="card empty">
        <p className="error">{error}</p>
        <button className="btn btn-secondary" onClick={retry}>Retry</button>
      </div>
    );
  if (rows.length === 0)
    return (
      <div className="card empty">
        <p className="strong">No spins yet</p>
        <p className="muted">The board ranks wallets by their longest streak. Mint a badge and spin to take rank 1.</p>
      </div>
    );
  return (
    <div className="card table-wrap">
      <table className="board">
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Wallet</th>
            <th scope="col" className="r">Longest</th>
            <th scope="col" className="r">Current</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const mine = me && r.account.toLowerCase() === me.toLowerCase();
            return (
              <tr key={r.account} className={mine ? "mine" : undefined}>
                <td className="num">{i + 1}</td>
                <td>
                  <span className="mono" title={r.account}>{shortAddress(r.account)}</span>
                  {mine && <span className="you">You</span>}
                  <span className="sub">{plural(Number(r.totalCheckIns), "check-in", "check-ins")}</span>
                </td>
                <td className="num r">{plural(Number(r.longestStreak), "day", "days")}</td>
                <td className="num r">{plural(Number(r.currentStreak), "day", "days")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ContractLink({ name, address, explorer }: { name: string; address: Address; explorer: string }) {
  return (
    <p className="contract">
      <span className="mono addr">{address}</span>
      <a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer">
        View {name} on the explorer
      </a>
    </p>
  );
}
