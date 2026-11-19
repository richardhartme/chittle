export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDate(date: Date): string {
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

const relative = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

/** Each unit, with how many seconds it is, largest first. */
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** How long before `now` a past `date` was, in its largest whole unit, such as "3 days ago" or "just now". */
export function formatTimeAgo(date: Date, now = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - date.getTime()) / 1000);
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return relative.format(-Math.floor(seconds / size), unit);
  }
  return "just now";
}
