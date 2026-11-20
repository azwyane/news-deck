import { FETCH_ALL_TIMEOUT, FETCH_TIMEOUT, HN_LINKS, PROXIES, RSS2JSON, STORY_WINDOW_HOURS } from "./constants";
import { asDate, safeUrl } from "./format";
import type { Source, Story } from "./types";

async function fetchWithDeadline<T>(url: string, timeout: number, signal: AbortSignal | undefined, read: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });
  if (signal?.aborted) relayAbort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timeout after ${timeout}ms`));
    }, timeout);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { signal: controller.signal });
        return await read(response);
      })(),
      deadline,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", relayAbort);
  }
}

export async function fetchWithTimeout(url: string, timeout = FETCH_TIMEOUT, signal?: AbortSignal): Promise<Response> {
  return fetchWithDeadline(url, timeout, signal, async (response) => response);
}

export async function fetchTextWithTimeout(url: string, timeout = FETCH_TIMEOUT, signal?: AbortSignal): Promise<{ ok: boolean; status: number; text: string }> {
  return fetchWithDeadline(url, timeout, signal, async (response) => ({ ok: response.ok, status: response.status, text: await response.text() }));
}

export async function fetchJsonWithTimeout<T>(url: string, timeout = FETCH_TIMEOUT, signal?: AbortSignal): Promise<{ ok: boolean; status: number; json: T }> {
  return fetchWithDeadline(url, timeout, signal, async (response) => ({ ok: response.ok, status: response.status, json: await response.json() as T }));
}

export function isAbortError(error: unknown): boolean {
  return (error as Error)?.name === "AbortError";
}

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
  return (doc.body.textContent || "").trim();
}

async function fetchFeedXml(url: string): Promise<string> {
  let error = "no attempt";
  for (const proxy of PROXIES) {
    try {
      const response = await fetchTextWithTimeout(proxy(url));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let text = response.text;
      if (text.trimStart().startsWith("{")) {
        try {
          const json = JSON.parse(text);
          if (typeof json.contents === "string") text = json.contents;
        } catch { /* not a JSON envelope */ }
      }
      if (text.trimStart().startsWith("<")) return text;
      throw new Error("not XML");
    } catch (err) {
      error = isAbortError(err) ? "timeout" : String((err as Error).message || err);
    }
  }
  try {
    const response = await fetchJsonWithTimeout<{ status: string; message?: string; items: Record<string, string>[] }>(RSS2JSON(url));
    const json = response.json;
    if (!response.ok || json.status !== "ok" || !Array.isArray(json.items)) throw new Error(json.message || `rss2json HTTP ${response.status}`);
    return `<rss><channel>${json.items.map((item: Record<string, string>) => `<item><title><![CDATA[${item.title || ""}]]></title><link>${item.link || ""}</link><description><![CDATA[${item.description || ""}]]></description><pubDate>${item.pubDate || ""}</pubDate></item>`).join("")}</channel></rss>`;
  } catch (err) {
    error += ` | r2j: ${(err as Error).name === "AbortError" ? "timeout" : String((err as Error).message || err)}`;
  }
  throw new Error(error);
}

export function parseFeedXml(xml: string, sourceName: string): Story[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML parse error");
  const isAtom = !!doc.querySelector("entry");
  const stories: Story[] = [];
  doc.querySelectorAll(isAtom ? "entry" : "item").forEach((node) => {
    const text = (...selectors: string[]) => {
      for (const selector of selectors) {
        const element = node.querySelector(selector);
        if (element?.textContent?.trim()) return element.textContent.trim();
      }
      return "";
    };
    const title = text("title");
    let link = text("link");
    if (isAtom) {
      const linkNode = node.querySelector("link[rel='alternate']") || node.querySelector("link");
      link = linkNode?.getAttribute("href") || "";
    }
    const description = htmlToText(text("description", "summary", "content", "encoded")).slice(0, 300);
    const published = text("pubDate", "published", "updated", "date");
    const date = published ? asDate(published) : new Date();
    const safeLink = safeUrl(link);
    if (!title || !safeLink) return;
    let thumb = "";
    try {
      const node2 = node.getElementsByTagName("media:thumbnail")[0];
      if (node2) thumb = node2.getAttribute("url") || "";
    } catch { /* no media namespace */ }
    if (!thumb) {
      try {
        const node2 = node.getElementsByTagName("media:content")[0];
        if (node2 && (node2.getAttribute("medium") || "") === "image") thumb = node2.getAttribute("url") || "";
      } catch { /* no media namespace */ }
    }
    if (!thumb) {
      const enclosure = node.querySelector("enclosure");
      if ((enclosure?.getAttribute("type") || "").startsWith("image")) thumb = enclosure?.getAttribute("url") || "";
    }
    if (!thumb) {
      const encoded = node.getElementsByTagName("content:encoded")[0] || node.getElementsByTagName("encoded")[0];
      const content = encoded?.textContent || "";
      const match = content.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (match) thumb = match[1];
    }
    stories.push({ title, link: safeLink, desc: description, date, src: sourceName, thumb: safeUrl(thumb) || undefined });
  });
  if (!stories.length) throw new Error("feed empty or blocked");
  return stories;
}

export async function fetchHNStories(source: Source): Promise<Story[]> {
  let error: unknown = new Error("no attempt");
  for (const proxy of [PROXIES[0], PROXIES[1], PROXIES[3]]) {
    try {
      const response = await fetchJsonWithTimeout<{ hits?: Record<string, unknown>[] }>(proxy(source.url || ""));
      const json = response.json;
      if (!response.ok || !json || !Array.isArray(json.hits)) throw new Error("unexpected response");
      const stories = json.hits
        .filter((hit: { title?: string; objectID?: string | number }) => hit && hit.title && /^\d+$/.test(String(hit.objectID)))
        .map((hit: Record<string, unknown>) => {
          const discussion = `https://news.ycombinator.com/item?id=${hit.objectID}`;
          const link = safeUrl(String(hit.url || ""));
          return {
            title: String(hit.title),
            link: link || discussion,
            desc: hit.story_text ? htmlToText(String(hit.story_text)).slice(0, 300) : "",
            date: asDate(hit.created_at),
            src: source.name,
            pts: Number(hit.points) || 0,
            cmts: Number(hit.num_comments) || 0,
            hn: discussion,
            hnSelfPost: !link,
          } satisfies Story;
        });
      if (!stories.length) throw new Error("no stories");
      return stories;
    } catch (err) {
      error = err;
    }
  }
  throw error;
}

export interface HNItem {
  url?: string;
  children?: { text?: string }[];
}

const hnItemCache = new Map<string, HNItem>();
const hnItemPending = new Map<string, Promise<HNItem | null>>();

export async function fetchHNItem(id: string): Promise<HNItem | null> {
  const cached = hnItemCache.get(id);
  if (cached) return cached;
  const pending = hnItemPending.get(id);
  if (pending) return pending;
  const url = `https://hn.algolia.com/api/v1/items/${id}`;
  const task = (async () => {
    for (const proxy of [PROXIES[0], PROXIES[1], PROXIES[3]]) {
      try {
        const response = await fetchJsonWithTimeout<HNItem>(proxy(url), 9000);
        if (!response.ok || !response.json || typeof response.json !== "object") continue;
        hnItemCache.set(id, response.json);
        return response.json;
      } catch { /* try next proxy */ }
    }
    return null;
  })();
  hnItemPending.set(id, task);
  void task.finally(() => hnItemPending.delete(id));
  return task;
}

export async function fetchHNComments(id: string): Promise<string[]> {
  const item = await fetchHNItem(id);
  if (!item || !Array.isArray(item.children)) return [];
  return item.children
    .filter((child) => child && typeof child.text === "string")
    .slice(0, 5)
    .map((child) => htmlToText(child.text || "").slice(0, 200))
    .filter((text) => text.length > 10);
}

export async function loadSource(source: Source): Promise<Story[]> {
  return source.kind === "hn" ? fetchHNStories(source) : parseFeedXml(await fetchFeedXml(source.url || ""), source.name);
}

export function storyKey(story: Pick<Story, "link" | "hn">): string {
  return story.hn || story.link.split("?")[0];
}

export function dedupeStories(stories: Story[]): Story[] {
  const seen = new Set<string>();
  return stories.filter((story) => {
    const key = storyKey(story);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isRecent(story: Story): boolean {
  const elapsed = Date.now() - story.date.getTime();
  return !isNaN(elapsed) && elapsed < STORY_WINDOW_HOURS * 3600 * 1000;
}

export function isHNDiscussion(link: string): boolean {
  return HN_LINKS.test(link);
}

export async function loadAllSources(sources: Source[], onProgress?: () => void): Promise<{ stories: Story[]; failed: string[] }> {
  const results = await Promise.race([
    Promise.all(
      sources.map(async (source) => {
        try {
          return { source: source.name, stories: await loadSource(source) };
        } catch {
          return { source: source.name, stories: [] as Story[] };
        }
      }),
    ),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), FETCH_ALL_TIMEOUT)),
  ]).catch(() => [] as { source: string; stories: Story[] }[]);
  onProgress?.();
  const failed = results.filter((result) => !result.stories.length).map((result) => result.source);
  return { stories: dedupeStories(results.flatMap((result) => result.stories)), failed };
}
