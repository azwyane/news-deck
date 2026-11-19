import { computed, effect, signal, type Signal } from "@preact/signals";
import { BUILTIN_SOURCES, DECK_LIMIT, HN_LINKS, KEYS } from "../lib/constants";
import { asDate, safeUrl } from "../lib/format";
import { dedupeStories, isRecent, loadSource, storyKey } from "../lib/feeds";
import { classifyTopic } from "../lib/topics";
import { readJSON, writeJSON } from "../lib/storage";
import type { FeedHealth, Note, Source, Story, View } from "../lib/types";

function persistent<T>(key: string, fallback: T): Signal<T> {
  const value = signal<T>(readJSON<T>(key, fallback));
  effect(() => writeJSON(key, value.value));
  return value;
}

export function reviveStory(story: Story): Story {
  return { ...story, date: asDate(story.date) };
}

function persistentStories(key: string): Signal<Story[]> {
  const stored = readJSON<Story[]>(key, []);
  const value = signal<Story[]>(stored.map(reviveStory));
  effect(() => writeJSON(key, value.value));
  return value;
}

export const customFeeds = persistent<Source[]>(KEYS.customFeeds, []);
export const sourceOrder = persistent<string[]>(KEYS.order, []);
export const removedSources = persistent<string[]>(KEYS.removed, []);
export const removedFeeds = persistent<Source[]>(KEYS.removedFeeds, []);
export const mutedSources = persistent<string[]>(KEYS.muted, []);
export const liked = persistentStories(KEYS.liked);
export const archived = persistentStories(KEYS.archive);
export const readStories = persistentStories(KEYS.readStories);
export const readTimes = persistent<Record<string, number>>(KEYS.read, {});
export const annotations = persistent<Record<string, Note[]>>(KEYS.annotations, {});
export const feedHealth = persistent<Record<string, FeedHealth>>(KEYS.feedHealth, {});
export const refreshMode = signal<string>(readJSON<string>(KEYS.refreshMode, "visit"));
export const unreadOnly = signal(readJSON<boolean>(KEYS.unreadOnly, false));
effect(() => writeJSON(KEYS.unreadOnly, unreadOnly.value));
effect(() => writeJSON(KEYS.refreshMode, refreshMode.value));

export const allSources = computed(() => {
  const list = [...BUILTIN_SOURCES, ...customFeeds.value].filter((source) => !removedSources.value.includes(source.name));
  if (!sourceOrder.value.length) return list;
  return list.sort((a, b) => {
    const first = sourceOrder.value.indexOf(a.name);
    const second = sourceOrder.value.indexOf(b.name);
    if (first === -1 && second === -1) return 0;
    if (first === -1) return 1;
    if (second === -1) return -1;
    return first - second;
  });
});
export const activeSources = computed(() => allSources.value.filter((source) => !mutedSources.value.includes(source.name)));

function loadCachedDeck(): Story[] {
  const cached = readJSON<{ savedAt?: number; items?: Story[] }>(KEYS.deck, {});
  return (cached.items || [])
    .filter((story) => story && story.title && safeUrl(story.link))
    .map((story) => ({
      ...story,
      date: asDate(story.date),
      hn: HN_LINKS.test(story.hn || "") ? story.hn : undefined,
      cached: true,
    }));
}

export const stories = signal<Story[]>(loadCachedDeck());
export const cacheSavedAt = signal(readJSON<{ savedAt?: number }>(KEYS.deck, {}).savedAt || 0);
export const refreshing = signal(false);
export const loadingSources = signal<Set<string>>(new Set());
export const failedSources = signal<string[]>([]);
export const statusText = signal("");
export const statusError = signal(false);
export const cacheNote = signal("");

export function saveDeck(): void {
  cacheSavedAt.value = Date.now();
  writeJSON(KEYS.deck, {
    savedAt: cacheSavedAt.value,
    items: stories.value.slice(0, DECK_LIMIT).map(({ date, ...story }) => ({ ...story, date: date.toISOString() })),
  });
}

export function archiveOldStories(): void {
  try {
    const today = new Date().toDateString();
    if (localStorage.getItem(KEYS.lastVisit) === today) return;
    if (stories.value.length) {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const old = stories.value.filter((story) => story.date.getTime() < midnight.getTime() && !isRead(story.link));
      if (old.length) {
        archived.value = [...old.map((story) => ({ ...story, archivedAt: Date.now() })), ...archived.value];
        writeJSON(KEYS.archive, archived.value);
      }
    }
    localStorage.setItem(KEYS.lastVisit, today);
  } catch { /* storage may be blocked */ }
}

export function updateStatus(): void {
  const sourcesList = activeSources.value;
  const count = sourcesList.length;
  const offline = typeof navigator !== "undefined" && !navigator.onLine ? " · offline" : "";
  if (!count) {
    statusError.value = false;
    statusText.value = "No active sources — restore or unmute sources";
    return;
  }
  const visible = visibleStories.value.length;
  if (refreshing.value) {
    statusError.value = false;
    statusText.value = `${loadingSources.value.size}/${count} outlets · ${visible} so far${cacheNote.value ? ` · ${cacheNote.value}` : ""}${offline}`;
  } else if (visible) {
    statusError.value = false;
    statusText.value = `${visible} stories from ${count} outlets · ${new Date().toLocaleTimeString()}${cacheNote.value ? ` · ${cacheNote.value}` : ""}${offline}`;
  } else {
    statusError.value = true;
    statusText.value = stories.value.length ? "No stories from the last 36 hours — try Refresh." : `${count} feeds unavailable — CORS proxies blocked on this network.`;
  }
}

let pendingRefresh = false;

export async function refresh(force = false): Promise<void> {
  if (refreshing.value) {
    pendingRefresh = true;
    return;
  }
  if (!navigator.onLine) {
    cacheNote.value = "offline — showing cached deck";
    updateStatus();
    return;
  }
  const list = activeSources.value;
  refreshing.value = true;
  failedSources.value = [];
  cacheNote.value = "";
  loadingSources.value = new Set(list.map((source) => source.name));
  if (!["All", "Liked", "Archived"].includes(view.value) && !list.some((source) => source.name === view.value)) view.value = "All";
  const cached = loadCachedDeck();
  if (cached.length) {
    stories.value = cached;
    const minutes = Math.round((Date.now() - (cacheSavedAt.value || Date.now())) / 60000);
    cacheNote.value = `cached deck from ${minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`} ago`;
  }
  updateStatus();
  if (refreshMode.value === "manual" && !force) {
    loadingSources.value = new Set();
    refreshing.value = false;
    updateStatus();
    return;
  }
  await Promise.all(
    list.map(async (source) => {
      try {
        const loaded = await loadSource(source);
        stories.value = dedupeStories([...loaded, ...stories.value.filter((story) => story.src !== source.name)]).map((story) => ({ ...story, cached: false }));
        const health = { ...feedHealth.value[source.name] };
        health.lastOk = Date.now();
        health.fails = 0;
        feedHealth.value = { ...feedHealth.value, [source.name]: health };
      } catch {
        failedSources.value = [...failedSources.value, source.name];
        const health = { ...feedHealth.value[source.name] };
        health.lastFail = Date.now();
        health.fails = (health.fails || 0) + 1;
        feedHealth.value = { ...feedHealth.value, [source.name]: health };
      } finally {
        const next = new Set(loadingSources.value);
        next.delete(source.name);
        loadingSources.value = next;
        updateStatus();
      }
    }),
  );
  stories.value = stories.value.sort((a, b) => b.date.getTime() - a.date.getTime());
  if (failedSources.value.length && cached.length) cacheNote.value = `${failedSources.value.length} outlet(s) unreachable — showing cached stories`;
  else if (!failedSources.value.length) cacheNote.value = "";
  refreshing.value = false;
  saveDeck();
  updateStatus();
  if (pendingRefresh) {
    pendingRefresh = false;
    void refresh(true);
  }
}

export async function refreshSource(name: string): Promise<void> {
  const source = allSources.value.find((item) => item.name === name);
  if (!source) return;
  const next = new Set(loadingSources.value);
  next.add(name);
  loadingSources.value = next;
  updateStatus();
  try {
    const loaded = await loadSource(source);
    stories.value = dedupeStories([...loaded, ...stories.value.filter((story) => story.src !== name)]).map((story) => ({ ...story, cached: false }));
    failedSources.value = failedSources.value.filter((item) => item !== name);
    const health = { ...feedHealth.value[name] };
    health.lastOk = Date.now();
    health.fails = 0;
    feedHealth.value = { ...feedHealth.value, [name]: health };
    saveDeck();
  } catch {
    failedSources.value = [...new Set([...failedSources.value, name])];
    const health = { ...feedHealth.value[name] };
    health.lastFail = Date.now();
    health.fails = (health.fails || 0) + 1;
    feedHealth.value = { ...feedHealth.value, [name]: health };
  } finally {
    const final = new Set(loadingSources.value);
    final.delete(name);
    loadingSources.value = final;
    updateStatus();
  }
}

// Views and filters
export const view = signal<View>("All");
export const search = signal("");
export const sort = signal<"src" | "new">("src");
export const topicFilter = signal<string | null>(null);

export function findStory(link: string): Story | undefined {
  return stories.value.find((story) => story.link === link) || liked.value.find((story) => story.link === link) || readStories.value.find((story) => story.link === link) || archived.value.find((story) => story.link === link);
}

export function isRead(link: string): boolean {
  return !!readTimes.value[link];
}

export function isLiked(link: string): boolean {
  return liked.value.some((story) => story.link === link);
}

export function isArchived(link: string): boolean {
  return archived.value.some((story) => story.link === link);
}

const matchesSearch = (story: Story, term: string) => !term || `${story.title} ${story.desc || ""}`.toLowerCase().includes(term);

export const visibleStories = computed<Story[]>(() => {
  const term = search.value.trim().toLowerCase();
  const currentView = view.value;
  if (currentView === "Radio") return [];
  if (currentView === "Liked") {
    return [...liked.value].filter((story) => matchesSearch(story, term)).sort((a, b) => (b.likedAt || 0) - (a.likedAt || 0));
  }
  if (currentView === "Read") {
    return [...readStories.value].filter((story) => matchesSearch(story, term)).sort((a, b) => (b.readAt || 0) - (a.readAt || 0));
  }
  if (currentView === "Archived") {
    return [...archived.value].filter((story) => matchesSearch(story, term)).sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
  }
  let list = stories.value.filter((story) => isRecent(story) && !isArchived(story.link) && !mutedSources.value.includes(story.src) && !removedSources.value.includes(story.src));
  if (currentView !== "All") list = list.filter((story) => story.src === currentView);
  if (unreadOnly.value) list = list.filter((story) => !isRead(story.link));
  if (topicFilter.value) list = list.filter((story) => classifyTopic(story.title, story.desc) === topicFilter.value);
  list = list.filter((story) => matchesSearch(story, term));
  if (sort.value === "new") list.sort((a, b) => b.date.getTime() - a.date.getTime());
  else list.sort((a, b) => a.src.localeCompare(b.src) || b.date.getTime() - a.date.getTime());
  if (currentView === "Hacker News") list.sort((a, b) => (b.pts || 0) - (a.pts || 0));
  return list;
});

export const counts = computed(() => ({
  all: visibleStories.value.length,
  liked: liked.value.length,
  read: readStories.value.length,
  notes: Object.values(annotations.value).reduce((sum, notes) => sum + notes.length, 0),
  archived: archived.value.length,
  radio: 0,
}));

export const noteEntries = computed(() => {
  const entries: (Note & { link: string; title: string; src: string })[] = [];
  for (const [link, notes] of Object.entries(annotations.value)) {
    const story = findStory(link);
    notes.forEach((note) => entries.push({ ...note, link, title: note.title || story?.title || "Article", src: note.src || story?.src || "—" }));
  }
  return entries.sort((a, b) => b.createdAt - a.createdAt);
});

export function setView(next: View): void {
  view.value = next;
  if (next !== "All") topicFilter.value = null;
}

export function clearFilters(): void {
  view.value = "All";
  topicFilter.value = null;
  unreadOnly.value = false;
  search.value = "";
}

export function toggleTopic(topic: string): void {
  topicFilter.value = topicFilter.value === topic ? null : topic;
}

// Story actions
export function markRead(link: string): void {
  if (readTimes.value[link]) return;
  const story = findStory(link);
  readTimes.value = { ...readTimes.value, [link]: Date.now() };
  if (story) readStories.value = [{ ...story, readAt: Date.now() }, ...readStories.value.filter((item) => item.link !== link)];
}

export function markUnread(link: string): void {
  const times = { ...readTimes.value };
  delete times[link];
  readTimes.value = times;
  readStories.value = readStories.value.filter((story) => story.link !== link);
}

export function markAllRead(links: string[]): number {
  let added = 0;
  const times = { ...readTimes.value };
  const read = [...readStories.value];
  for (const link of links) {
    if (times[link]) continue;
    times[link] = Date.now();
    const story = findStory(link);
    if (story) read.unshift({ ...story, readAt: Date.now() });
    added++;
  }
  readTimes.value = times;
  readStories.value = read;
  return added;
}

export function toggleLike(link: string): void {
  if (isLiked(link)) {
    liked.value = liked.value.filter((story) => story.link !== link);
    return;
  }
  const story = findStory(link);
  if (story) liked.value = [{ ...story, likedAt: Date.now() }, ...liked.value];
}

export function archiveStory(link: string): void {
  const story = findStory(link);
  if (!story || isArchived(link)) return;
  archived.value = [{ ...story, archivedAt: Date.now() }, ...archived.value];
}

export function unarchiveStory(link: string): void {
  archived.value = archived.value.filter((story) => story.link !== link);
}

export function addNote(link: string, quote: string, note: string): void {
  const story = findStory(link);
  const notes = { ...annotations.value };
  notes[link] = [...(notes[link] || []), { quote: quote.slice(0, 300), note: note.trim(), createdAt: Date.now(), title: story?.title, src: story?.src }];
  annotations.value = notes;
}

export function deleteNote(link: string, index: number): void {
  const notes = { ...annotations.value };
  notes[link] = (notes[link] || []).filter((_, position) => position !== index);
  if (!notes[link].length) delete notes[link];
  annotations.value = notes;
}

// Sources
export function muteSource(name: string, muted: boolean): void {
  const list = new Set(mutedSources.value);
  if (muted) list.add(name);
  else list.delete(name);
  mutedSources.value = [...list];
  if (muted && view.value === name) view.value = "All";
  updateStatus();
}

export function hideSource(name: string): void {
  removedSources.value = [...new Set([...removedSources.value, name])];
  sourceOrder.value = sourceOrder.value.filter((item) => item !== name);
  if (view.value === name) view.value = "All";
  updateStatus();
}

export function removeFeed(name: string): void {
  const feed = customFeeds.value.find((item) => item.name === name);
  customFeeds.value = customFeeds.value.filter((item) => item.name !== name);
  if (feed) removedFeeds.value = [...removedFeeds.value.filter((item) => item.name !== name), feed];
  hideSource(name);
}

export function restoreSource(name: string): void {
  const feed = removedFeeds.value.find((item) => item.name === name);
  if (feed) {
    customFeeds.value = [...customFeeds.value.filter((item) => item.name !== name), feed];
    removedFeeds.value = removedFeeds.value.filter((item) => item.name !== name);
  }
  removedSources.value = removedSources.value.filter((item) => item !== name);
  mutedSources.value = mutedSources.value.filter((item) => item !== name);
  if (!sourceOrder.value.includes(name)) sourceOrder.value = [...sourceOrder.value, name];
  updateStatus();
}

export function restoreSources(): void {
  for (const feed of removedFeeds.value) {
    if (!customFeeds.value.some((item) => item.name === feed.name)) customFeeds.value = [...customFeeds.value, feed];
  }
  removedFeeds.value = [];
  removedSources.value = [];
  mutedSources.value = [];
  updateStatus();
}

export function normalizeFeedUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function addFeed(name: string, url: string, skipRefresh = false): boolean {
  const normalized = normalizeFeedUrl(url);
  const feedName = name.trim();
  if (!feedName || !normalized || allSources.value.some((source) => source.name === feedName) || customFeeds.value.some((feed) => !!feed.url && normalizeFeedUrl(feed.url) === normalized)) return false;
  customFeeds.value = [...customFeeds.value, { name: feedName, url: normalized }];
  if (!skipRefresh) void refresh(true);
  return true;
}

export function reorderSources(order: string[]): void {
  sourceOrder.value = order;
}

effect(() => {
  void activeSources.value.length;
  void visibleStories.value.length;
  void stories.value.length;
  void refreshing.value;
  void loadingSources.value.size;
  void failedSources.value.length;
  void cacheNote.value;
  void unreadOnly.value;
  void view.value;
  void search.value;
  void topicFilter.value;
  updateStatus();
});

archiveOldStories();
updateStatus();
