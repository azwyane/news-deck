import { FETCH_ALL_TIMEOUT, FETCH_TIMEOUT, HN_LINKS, PROXIES, RSS2JSON, STORY_WINDOW_HOURS } from "./constants";
import { asDate, safeUrl } from "./format";
import type { Source, Story } from "./types";

export async function fetchWithTimeout(url: string, timeout = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
  return (doc.body.textContent || "").trim();
}

async function fetchFeedXml(url: string): Promise<string> {
  let error = "no attempt";
  for (const proxy of PROXIES) {
    try {
      const response = await fetchWithTimeout(proxy(url));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let text = await response.text();
      if (text.trimStart().startsWith("{")) {
        try {
          const json = JSON.parse(text);
          if (typeof json.contents === "string") text = json.contents;
        } catch { /* not a JSON envelope */ }
      }
      if (text.trimStart().startsWith("<")) return text;
      throw new Error("not XML");
    } catch (err) {
      error = (err as Error).name === "AbortError" ? "timeout" : String((err as Error).message || err);
    }
  }
  try {
    const response = await fetchWithTimeout(RSS2JSON(url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (json.status !== "ok" || !Array.isArray(json.items)) throw new Error(json.message || "rss2json error");
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
      const response = await fetchWithTimeout(proxy(source.url || ""));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!json || !Array.isArray(json.hits)) throw new Error("unexpected response");
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

export async function fetchHNComments(id: string): Promise<string[]> {
  const url = `https://hn.algolia.com/api/v1/items/${id}`;
  for (const proxy of [PROXIES[0], PROXIES[1], PROXIES[3]]) {
    try {
      const response = await fetchWithTimeout(proxy(url));
      if (!response.ok) continue;
      const json = await response.json();
      if (!json || !Array.isArray(json.children)) continue;
      return json.children
        .filter((child: { text?: string }) => child && typeof child.text === "string")
        .slice(0, 5)
        .map((child: { text: string }) => htmlToText(child.text).slice(0, 200))
        .filter((text: string) => text.length > 10);
    } catch { /* try next proxy */ }
  }
  return [];
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
