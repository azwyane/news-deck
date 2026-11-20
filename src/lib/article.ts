import { Readability } from "@mozilla/readability";
import { HN_LINKS, KEYS, PROXIES } from "./constants";
import { fetchHNItem, fetchTextWithTimeout, htmlToText, isAbortError } from "./feeds";
import { normalizeError, safeUrl } from "./format";
import { readJSON, writeJSON } from "./storage";
import { renderMarkdownSafe } from "./markdown";
import { sanitizeHtml } from "./sanitize";

interface CachedArticle {
  markdown: string;
  title?: string;
  source?: "article" | "discussion";
  fetchedAt: number;
}

interface ArticleFailure {
  error: string;
  fetchedAt: number;
}

export interface LoadArticleOptions {
  signal?: AbortSignal;
  onStage?: (stage: string) => void;
}

interface Extraction {
  markdown: string;
  title?: string;
}

const LIMIT = 80;
const MAX_LENGTH = 120000;
const FAILURE_TTL = 45000;
const cache = new Map<string, CachedArticle>();
const failures = new Map<string, ArticleFailure>();
const pending = new Map<string, Promise<ArticleResult>>();
let persistTimer: ReturnType<typeof setTimeout> | undefined;

try {
  const stored = readJSON<Record<string, CachedArticle>>(KEYS.articleCache, {});
  Object.entries(stored).forEach(([url, value]) => {
    if (value && typeof value.markdown === "string") cache.set(url, value);
  });
} catch { /* ignore malformed cache */ }

if (typeof addEventListener !== "undefined") addEventListener("pagehide", persistCache);

export function cachedArticle(url: string): CachedArticle | undefined {
  return cache.get(url);
}

function persistCache(): void {
  const entries = [...cache.entries()].sort((a, b) => b[1].fetchedAt - a[1].fetchedAt).slice(0, LIMIT);
  cache.clear();
  entries.forEach(([url, value]) => cache.set(url, value));
  writeJSON(KEYS.articleCache, Object.fromEntries(entries));
}

function persistCacheSoon(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    persistCache();
  }, 150);
}

function rememberArticle(keys: (string | undefined)[], value: Omit<CachedArticle, "fetchedAt">): void {
  const entry: CachedArticle = { ...value, fetchedAt: Date.now() };
  new Set(keys.filter((key): key is string => !!key)).forEach((key) => cache.set(key, entry));
  persistCacheSoon();
}

function failureFor(keys: (string | undefined)[]): string {
  for (const key of keys) {
    if (!key) continue;
    const failure = failures.get(key);
    if (!failure) continue;
    if (Date.now() - failure.fetchedAt < FAILURE_TTL) return failure.error;
    failures.delete(key);
  }
  return "";
}

function rememberFailure(keys: (string | undefined)[], error: string): void {
  const entry = { error, fetchedAt: Date.now() };
  new Set(keys.filter((key): key is string => !!key)).forEach((key) => failures.set(key, entry));
  persistCacheSoon();
}

function abortError(): Error {
  const error = new Error("Article load aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function firstSuccessful<T>(tasks: Array<(signal: AbortSignal) => Promise<T>>, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let remaining = tasks.length;
    const errors: unknown[] = [];
    const controller = new AbortController();
    const relayAbort = () => controller.abort();
    if (!remaining) {
      reject(new Error("No article sources available"));
      return;
    }
    function finish(callback: () => void): void {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", relayAbort);
      controller.abort();
      callback();
    }
    signal?.addEventListener("abort", relayAbort, { once: true });
    if (signal?.aborted) {
      relayAbort();
      finish(() => reject(abortError()));
      return;
    }
    tasks.forEach((task, index) => {
      Promise.resolve()
        .then(() => task(controller.signal))
        .then((value) => finish(() => resolve(value)), (error) => {
          errors[index] = error;
          remaining -= 1;
          if (!remaining) finish(() => reject(errors.find(Boolean) || new Error("All article sources failed")));
        });
    });
  });
}

function cleanJinaText(text: string): string {
  return text
    .replace(/^Title: .+\n/m, "")
    .replace(/^URL Source: .+\n/m, "")
    .replace(/^Markdown Content: ?\n?/m, "")
    .trim();
}

export async function fetchJinaArticle(url: string, signal?: AbortSignal): Promise<Extraction> {
  const response = await fetchTextWithTimeout(`https://r.jina.ai/${url}`, 15000, signal);
  throwIfAborted(signal);
  if (!response.ok) throw new Error(`Jina returned HTTP ${response.status}`);
  if (!response.text || response.text.trim().length < 100) throw new Error("Jina returned no content");
  const titleMatch = response.text.match(/^Title: (.+)$/m);
  const markdown = cleanJinaText(response.text);
  if (markdown.length < 50) throw new Error("Jina returned only metadata");
  return { markdown: markdown.slice(0, MAX_LENGTH), title: titleMatch?.[1].trim() };
}

function parseReadableHtml(source: string): Extraction | null {
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
    if (!article?.content) return null;
    return { markdown: htmlToText(article.content).slice(0, MAX_LENGTH), title: article.title || undefined };
  } catch {
    return null;
  }
}

export async function extractWithReadability(url: string, signal?: AbortSignal): Promise<Extraction | null> {
  try {
    return await firstSuccessful(PROXIES.map((proxy) => async (childSignal) => {
      const response = await fetchTextWithTimeout(proxy(url), 10000, childSignal);
      throwIfAborted(childSignal);
      if (!response.ok) throw new Error(`Proxy returned HTTP ${response.status}`);
      let text = response.text;
      if (text.trimStart().startsWith("{")) {
        try {
          const json = JSON.parse(text);
          if (typeof json.contents === "string") text = json.contents;
        } catch { /* not a JSON envelope */ }
      }
      if (!text.trimStart().startsWith("<")) throw new Error("Proxy returned no HTML");
      const result = parseReadableHtml(text);
      if (!result) throw new Error("Readability couldn't extract content");
      return result;
    }), signal);
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

export async function resolveHNExternalUrl(discussionUrl: string): Promise<string | null> {
  const id = discussionUrl.match(/id=(\d+)/)?.[1];
  if (!id) return null;
  const item = await fetchHNItem(id);
  const url = safeUrl(String(item?.url || ""));
  return url && !HN_LINKS.test(url) ? url : null;
}

async function extractArticle(target: string, signal: AbortSignal | undefined, onStage?: (stage: string) => void): Promise<Extraction> {
  return firstSuccessful([
    async (childSignal) => {
      onStage?.("Fetching direct article text…");
      return fetchJinaArticle(target, childSignal);
    },
    async (childSignal) => {
      onStage?.("Fetching page source…");
      const result = await extractWithReadability(target, childSignal);
      if (!result) throw new Error("No readable article source");
      return result;
    },
  ], signal);
}

export interface ArticleResult {
  markdown?: string;
  html?: string;
  title?: string;
  error?: string;
  cached?: boolean;
  source?: "article" | "discussion";
}

export async function loadArticle(url: string, discussionUrl?: string, options: LoadArticleOptions = {}): Promise<ArticleResult> {
  const { signal, onStage } = options;
  throwIfAborted(signal);
  const keys = [url, discussionUrl].filter((key): key is string => !!key);
  const cacheKey = keys.join("|");
  const cached = cachedArticle(url) || (discussionUrl ? cachedArticle(discussionUrl) : undefined);
  if (cached) return { markdown: cached.markdown, title: cached.title, cached: true, source: cached.source || (HN_LINKS.test(url) ? "discussion" : "article") };
  const recentFailure = failureFor(keys);
  if (recentFailure) return { error: recentFailure, cached: true };
  if (!signal) {
    const existing = pending.get(cacheKey);
    if (existing) return existing;
  }
  const task = (async (): Promise<ArticleResult> => {
    const candidateDiscussion = discussionUrl || (HN_LINKS.test(url) ? url : "");
    let target = url;
    if (candidateDiscussion && HN_LINKS.test(candidateDiscussion)) {
      onStage?.("Resolving article source…");
      const resolved = await resolveHNExternalUrl(candidateDiscussion);
      throwIfAborted(signal);
      if (resolved) target = resolved;
    }
    const discussionOnly = HN_LINKS.test(target);
    const errors: string[] = [];
    onStage?.("Fetching article text…");
    try {
      const result = await extractArticle(target, signal, onStage);
      throwIfAborted(signal);
      const source = discussionOnly ? "discussion" : "article";
      rememberArticle([url, target, discussionUrl], { ...result, source });
      return { ...result, source };
    } catch (error) {
      if (isAbortError(error)) throw error;
      errors.push(normalizeError(error));
    }
    if (candidateDiscussion && target !== candidateDiscussion) {
      try {
        onStage?.("Loading Hacker News discussion…");
        const result = await fetchJinaArticle(candidateDiscussion, signal);
        throwIfAborted(signal);
        rememberArticle([candidateDiscussion], { ...result, source: "discussion" });
        return { ...result, source: "discussion", error: discussionOnly ? "This is a Hacker News text post. Showing the discussion." : "Couldn't extract the linked article. Showing the Hacker News discussion instead." };
      } catch (error) {
        if (isAbortError(error)) throw error;
        errors.push(`HN fallback: ${normalizeError(error)}`);
      }
    }
    const error = errors.join(" · ") || "Couldn't extract the article content.";
    rememberFailure([url, target, discussionUrl], error);
    return { error };
  })();
  if (!signal) pending.set(cacheKey, task);
  try {
    return await task;
  } finally {
    if (pending.get(cacheKey) === task) pending.delete(cacheKey);
  }
}

export function articleToFragment(article: ArticleResult): DocumentFragment | null {
  if (article.markdown) return renderMarkdownSafe(article.markdown);
  if (article.html) return sanitizeHtml(article.html);
  return null;
}
