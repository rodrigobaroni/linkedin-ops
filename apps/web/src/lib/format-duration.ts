/** `899` → `14:59`; hours appear only when needed (`1:00:05`). Used for the login lock countdown. */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

/** `Date` → `14:32` (24 h, pt-BR, the browser's timezone). Shown next to countdowns (absolute time). */
export function formatClock(instant: number | Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

/** Whole minutes left until `until` (ms epoch), rounded to the nearest minute, never below 1. */
export function minutesUntil(until: number, now: number = Date.now()): number {
  return Math.max(1, Math.round((until - now) / 60_000));
}
