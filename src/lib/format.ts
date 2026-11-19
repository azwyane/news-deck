const STOP = new Set("a an the and or but of to in on for at by with from as is are was were be been it its this that these those after over into out up down off about amid says say said new more than not no how why what who when where will would could can may might has have had do does did you your our their his her he she they we i us own just now man men woman women boy girl child children charged charges police court arrested accused alleged dies dead killed death year years day days week today tonight report reports claims calls plan back first big win wins ahead latest live update updates watch explained australia australian nsw".split(" "));

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function hashColor(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = hash * 31 + value.charCodeAt(i) | 0;
  return `hsl(${Math.abs(hash) % 360}, 60%, 55%)`;
}

export function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function relativeTime(date: Date): string {
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function debounce<T extends (...args: never[]) => void>(fn: T, wait: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function normalizeStem(word: string): string {
  return (word.length > 4 ? word.replace(/(ing|ed)$/, "") : word).replace(/([^s])s$/, "$1");
}

export function tokenize(value: string): Set<string> {
  return new Set(
    String(value)
      .toLowerCase()
      .replace(/['’]s\b/g, "")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !STOP.has(word))
      .map(normalizeStem),
  );
}

export function normalizeError(error: unknown): string {
  return String((error as { message?: string; name?: string })?.message || (error as { name?: string })?.name || error || "unknown error").slice(0, 300);
}

export function asDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return isNaN(date.getTime()) ? new Date() : date;
}
