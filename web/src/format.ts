export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const nf = new Intl.NumberFormat("en-US");
export const formatCount = (n: bigint | number) => nf.format(typeof n === "bigint" ? Number(n) : n);

/** "3 days", "1 day": a full templated string per count, never fragments around a number. */
export const plural = (n: number, one: string, many: string) => (n === 1 ? `${formatCount(n)} ${one}` : `${formatCount(n)} ${many}`);

/** Time until a unix timestamp, as "5 h 12 min" or "42 min". */
export function untilLabel(targetSeconds: number, nowMs: number): string {
  const s = Math.max(0, Math.floor(targetSeconds - nowMs / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return "under a minute";
}

/** UTC day number to a readable date. */
export const dayLabel = (day: number) =>
  new Date(day * 86400 * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
