import { Readability } from "@mozilla/readability";
import { KEYS, PROXIES } from "./constants";
import { fetchWithTimeout, htmlToText } from "./feeds";
import { normalizeError } from "./format";
import { readJSON, writeJSON } from "./storage";
import { renderMarkdownSafe } from "./markdown";
import { sanitizeHtml } from "./sanitize";

interface CachedArticle {
  markdown: string;
  title?: string;
  fetchedAt: number;
}

const LIMIT = 40;
const MAX_LENGTH = 120000;
const cache = new Map<string, CachedArticle>();

try {
  const stored = readJSON<Record<string, CachedArticle>>(KEYS.articleCache, {});
  Object.entries(stored).forEach(([url, value]) => {
    if (value && typeof value.markdown === "string") cache.set(url, value);
  });
} catch { /* ignore malformed cache */ }

export function cachedArticle(url: string): CachedArticle | undefined {
  return cache.get(url);
}

function persistCache(): void {
  const entries = [...cache.entries()].sort((a, b) => b[1].fetchedAt - a[1].fetchedAt).slice(0, LIMIT);
  cache.clear();
  entries.forEach(([url, value]) => cache.set(url, value));
  writeJSON(KEYS.articleCache, Object.fromEntries(entries));
}

function cleanJinaText(text: string): string {
  return text
    .replace(/^Title: .+\n/m, "")
    .replace(/^URL Source: .+\n/m, "")
    .replace(/^Markdown Content: ?\n?/m, "")
    .trim();
}

export async function fetchJinaArticle(url: string): Promise<{ markdown: string; title?: string }> {
  const response = await fetchWithTimeout(`https://r.jina.ai/${url}`, 25000);
  if (!response.ok) throw new Error(`Jina returned HTTP ${response.status}`);
  const text = await response.text();
  if (!text || text.trim().length < 100) throw new Error("Jina returned no content");
  const titleMatch = text.match(/^Title: (.+)$/m);
  const markdown = cleanJinaText(text);
  if (markdown.length < 50) throw new Error("Jina returned only metadata");
  return { markdown: markdown.slice(0, MAX_LENGTH), title: titleMatch?.[1].trim() };
}

export async function extractWithReadability(url: string): Promise<{ html: string; title?: string } | null> {
  let source = "";
  for (const proxy of PROXIES) {
    try {
      const response = await fetchWithTimeout(proxy(url), 15000);
      if (!response.ok) continue;
      let text = await response.text();
      if (text.trimStart().startsWith("{")) {
        try {
          const json = JSON.parse(text);
          if (typeof json.contents === "string") text = json.contents;
        } catch { /* not a JSON envelope */ }
      }
      if (text.trimStart().startsWith("<")) {
        source = text;
        break;
      }
    } catch { /* try next proxy */ }
  }
  if (!source) return null;
  const doc = new DOMParser().parseFromString(source, "text/html");
  doc.querySelectorAll("script,style,noscript,nav,footer,header,aside,iframe,.ad,.ads,.advert,.social,.share,.comments,.related,.newsletter,.paywall").forEach((node) => node.remove());
  doc.querySelectorAll("img[data-src]").forEach((node) => {
    if (!node.getAttribute("src")) node.setAttribute("src", node.getAttribute("data-src") || "");
  });
  doc.querySelectorAll("img[data-lazy-src]").forEach((node) => {
    if (!node.getAttribute("src")) node.setAttribute("src", node.getAttribute("data-lazy-src") || "");
  });
  try {
    const article = new Readability(doc, { charThreshold: 200 }).parse();
    return article?.content ? { html: article.content, title: article.title || undefined } : null;
  } catch {
    return null;
  }
}

export interface ArticleResult {
  markdown?: string;
  html?: string;
  title?: string;
  error?: string;
  cached?: boolean;
}

export async function loadArticle(url: string, discussionUrl?: string): Promise<ArticleResult> {
  const cached = cachedArticle(url);
  if (cached) return { markdown: cached.markdown, title: cached.title, cached: true };
  const errors: string[] = [];
  try {
    const result = await fetchJinaArticle(url);
    cache.set(url, { ...result, fetchedAt: Date.now() });
    persistCache();
    return result;
  } catch (err) {
    errors.push(`Jina: ${normalizeError(err)}`);
  }
  try {
    const result = await extractWithReadability(url);
    if (result) {
      const markdown = htmlToText(result.html).slice(0, MAX_LENGTH);
      cache.set(url, { markdown, title: result.title, fetchedAt: Date.now() });
      persistCache();
      return { ...result, markdown, title: result.title || undefined };
    }
    errors.push("Readability: couldn't extract content");
  } catch (err) {
    errors.push(`Readability: ${normalizeError(err)}`);
  }
  if (discussionUrl) {
    try {
      const result = await fetchJinaArticle(discussionUrl);
      return result;
    } catch (err) {
      errors.push(`HN fallback: ${normalizeError(err)}`);
    }
  }
  return { error: errors.join(" · ") };
}

export function articleToFragment(article: ArticleResult): DocumentFragment | null {
  if (article.markdown) return renderMarkdownSafe(article.markdown);
  if (article.html) return sanitizeHtml(article.html);
  return null;
}
