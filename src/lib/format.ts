export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDate(date: Date): string {
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
