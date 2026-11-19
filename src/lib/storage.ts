export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable or full */
  }
}

export function readText(key: string, fallback = ""): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeText(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage may be unavailable or full */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage may be unavailable or full */
  }
}
