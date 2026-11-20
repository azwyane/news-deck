import { computed, effect, signal } from "@preact/signals";
import type { Page, Story } from "../lib/types";
import { findStory, markRead, pinStory, stories, visibleStories } from "./store";
import { fetchHNComments, isAbortError } from "../lib/feeds";
import { activeStationName, playStation, radioPlaying, visibleStations } from "../lib/radio";
import { finishReading, startReading } from "../lib/stats";
import { loadArticle, articleToFragment } from "../lib/article";
import { tts } from "../lib/tts";

export const page = signal<Page>(null);
export const sidebarOpen = signal(false);
export const readerStory = signal<Story | null>(null);
export const readerContent = signal<{ fragment: DocumentFragment; text: string } | null>(null);
export const readerLoading = signal(false);
export const readerLoadingStage = signal("");
export const readerError = signal("");
export const readerArticleSource = signal<"article" | "discussion" | null>(null);
export const readerSummary = signal("");
export const readerSummaryBusy = signal(false);
export const readerConnections = signal<{ text: string; links: Story[] } | null>(null);
export const readerHistory = signal<{ story: Story; scroll: number }[]>([]);
export const readerForward = signal<Story[]>([]);
export const assistantContext = signal<{ title: string; text: string } | null>(null);
export const notesOpen = signal(false);
export const overflowOpen = signal(false);
export const showShortcuts = signal(false);
export const toast = signal<{ message: string; undo?: () => void } | null>(null);
export const cardMenu = signal<{ link: string; x: number; y: number } | null>(null);
export const deckCursor = signal(-1);
export const ttsStoryLink = signal<string | null>(null);
export const readerComments = signal<string[]>([]);
export const readerCommentsLoading = signal(false);
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export const installPrompt = signal<InstallPromptEvent | null>(null);

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let articleController: AbortController | null = null;
let articleLoadId = 0;

let viewportLocked = false;
let savedScrollY = 0;
let savedHtmlOverflow = "";
let savedBodyOverflow = "";
let savedHtmlScrollBehavior = "";
let savedScrollRestoration: ScrollRestoration | undefined;
let lastOverlayKey = "";

function onNextFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(callback);
  else setTimeout(callback, 0);
}

function overlayKey(): string {
  if (page.value === "reader") return `reader:${readerStory.value?.link || ""}`;
  if (page.value) return `page:${page.value}`;
  if (flow.value.open) return `flow:${flow.value.mode}:${flow.value.mode === "radio" ? flow.value.radioIndex : flow.value.index}`;
  if (sidebarOpen.value) return "sidebar";
  if (showShortcuts.value) return "shortcuts";
  return "";
}

function lockViewport(): void {
  if (viewportLocked || typeof document === "undefined" || typeof window === "undefined") return;
  savedScrollY = window.scrollY || 0;
  try { window.scrollTo(0, 0); } catch {}
  savedHtmlOverflow = document.documentElement.style.overflow;
  savedBodyOverflow = document.body.style.overflow;
  savedHtmlScrollBehavior = document.documentElement.style.scrollBehavior;
  savedScrollRestoration = typeof history === "undefined" ? undefined : history.scrollRestoration;
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  if (typeof history !== "undefined") history.scrollRestoration = "manual";
  viewportLocked = true;
}

function unlockViewport(): void {
  if (!viewportLocked || typeof document === "undefined" || typeof window === "undefined") return;
  viewportLocked = false;
  const root = document.documentElement;
  root.style.overflow = savedHtmlOverflow;
  document.body.style.overflow = savedBodyOverflow;
  if (typeof history !== "undefined" && savedScrollRestoration) history.scrollRestoration = savedScrollRestoration;
  root.style.scrollBehavior = "auto";
  try { window.scrollTo(0, savedScrollY); } catch {}
  root.style.scrollBehavior = savedHtmlScrollBehavior;
}

function resetOverlayScroll(): void {
  if (typeof document === "undefined") return;
  const selectors: string[] = [];
  if (page.value === "reader") selectors.push("#readerPage");
  else if (page.value) selectors.push("#wrappedPage", "#settingsPage");
  if (page.value === "paste" || page.value === "install") selectors.push(".overlay.on .modal");
  if (flow.value.open && flow.value.mode === "read") selectors.push(".flow-slide.active .flow-content");
  if (sidebarOpen.value) selectors.push("#sidebarPanel");
  if (showShortcuts.value) selectors.push("#shortcutsOverlay .modal");
  for (const selector of selectors) {
    document.querySelectorAll<HTMLElement>(selector).forEach((node) => { node.scrollTop = 0; });
  }
}

function syncOverlayScroll(): void {
  const key = overlayKey();
  if (!key) {
    unlockViewport();
    lastOverlayKey = "";
    return;
  }
  lockViewport();
  if (key === lastOverlayKey) return;
  lastOverlayKey = key;
  onNextFrame(resetOverlayScroll);
}

function pushOverlayState(kind: string): void {
  if (typeof history === "undefined") return;
  if (history.state?.newsDeckOverlay === kind) return;
  if (flow.value.open || page.value === "reader") history.replaceState({ newsDeckOverlay: kind }, "");
  else history.pushState({ newsDeckOverlay: kind }, "");
}

function clearOverlayState(kind: string): void {
  if (typeof history !== "undefined" && history.state?.newsDeckOverlay === kind) history.replaceState({}, "");
}

export function notify(message: string, undo?: () => void): void {
  toast.value = { message, undo };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = null; }, 3500);
}

export function showCardMenu(story: Story, x: number, y: number): void {
  cardMenu.value = { link: story.link, x: Math.min(x, innerWidth - 210), y: Math.min(y, innerHeight - 220) };
}

export function closeCardMenu(): void {
  cardMenu.value = null;
}

export function openPage(next: Page): void {
  if (next === "assistant" && !readerStory.value) assistantContext.value = null;
  page.value = next;
  if (next !== "reader") sidebarOpen.value = false;
}

export function closePages(): void {
  const wasAssistant = page.value === "assistant";
  page.value = null;
  sidebarOpen.value = false;
  notesOpen.value = false;
  overflowOpen.value = false;
  if (wasAssistant || !readerStory.value) assistantContext.value = null;
}

interface ReaderOpenOptions {
  replace?: boolean;
  follow?: boolean;
}

export async function openReader(input: Story | string, options: ReaderOpenOptions = {}): Promise<void> {
  const story = typeof input === "string" ? findStory(input) : input;
  if (!story) return;
  articleLoadId += 1;
  const loadId = articleLoadId;
  articleController?.abort();
  articleController = new AbortController();
  const controller = articleController;
  const previous = readerStory.value;
  if (previous && previous.link !== story.link) {
    if (options.follow) {
      readerHistory.value = [...readerHistory.value, { story: previous, scroll: 0 }];
      readerForward.value = [];
    } else if (!options.replace) {
      readerHistory.value = [];
      readerForward.value = [];
    }
  }
  if (previous && previous.link !== story.link) finishReading(previous.src);
  if (tts.playing.value) tts.stop();
  ttsStoryLink.value = story.link;
  readerStory.value = story;
  const cursor = visibleStories.value.findIndex((item) => item.link === story.link);
  if (cursor >= 0) deckCursor.value = cursor;
  markRead(story.link);
  pinStory(story.link);
  readerContent.value = null;
  readerError.value = "";
  readerArticleSource.value = null;
  readerLoading.value = true;
  readerLoadingStage.value = story.hn ? "Resolving article source…" : "Fetching article…";
  readerSummary.value = "";
  readerConnections.value = null;
  readerComments.value = [];
  readerCommentsLoading.value = !!story.hn;
  if (story.hn) {
    const id = story.hn.match(/id=(\d+)/)?.[1];
    if (id) void fetchHNComments(id).then((comments) => { if (loadId === articleLoadId && readerStory.value?.link === story.link) readerComments.value = comments; }).catch(() => undefined).finally(() => { if (loadId === articleLoadId && readerStory.value?.link === story.link) readerCommentsLoading.value = false; });
    else readerCommentsLoading.value = false;
  }
  notesOpen.value = false;
  overflowOpen.value = false;
  if (page.value !== "reader") pushOverlayState("reader");
  page.value = "reader";
  startReading();
  try {
    const result = await loadArticle(story.link, story.hn, {
      signal: controller.signal,
      onStage: (stage) => {
        if (loadId === articleLoadId && readerStory.value?.link === story.link) readerLoadingStage.value = stage;
      },
    });
    if (loadId !== articleLoadId || controller.signal.aborted || readerStory.value?.link !== story.link) return;
    readerLoadingStage.value = "Rendering article…";
    await new Promise<void>((resolve) => onNextFrame(resolve));
    if (loadId !== articleLoadId || controller.signal.aborted || readerStory.value?.link !== story.link) return;
    readerArticleSource.value = result.source || null;
    const fragment = articleToFragment(result);
    if (fragment) {
      const text = (fragment.textContent || "").trim();
      readerContent.value = { fragment, text };
      tts.setContent(Array.from(fragment.querySelectorAll("p")) as HTMLElement[], story.title);
    } else {
      readerError.value = result.error || "Couldn't extract the article content.";
    }
  } catch (error) {
    if (loadId === articleLoadId && !isAbortError(error) && !controller.signal.aborted && readerStory.value?.link === story.link) readerError.value = String((error as Error).message || error);
  } finally {
    if (loadId === articleLoadId && readerStory.value?.link === story.link) {
      readerLoading.value = false;
      readerLoadingStage.value = "";
    }
    if (articleController === controller) articleController = null;
  }
}

export function exitReader(): void {
  articleLoadId += 1;
  articleController?.abort();
  articleController = null;
  readerHistory.value = [];
  readerForward.value = [];
  const story = readerStory.value;
  if (story) finishReading(story.src);
  clearOverlayState("reader");
  page.value = null;
  readerStory.value = null;
  readerContent.value = null;
  readerArticleSource.value = null;
  readerLoading.value = false;
  readerLoadingStage.value = "";
  readerError.value = "";
}

export function closeReader(fromPop = false): void {
  if (!fromPop && typeof history !== "undefined" && history.state?.newsDeckOverlay === "reader") { history.back(); return; }
  const previous = readerHistory.value.pop();
  if (previous) {
    readerHistory.value = [...readerHistory.value];
    void openReader(previous.story, { replace: true });
    return;
  }
  exitReader();
}

export const readerList = computed(() => visibleStories.value);

export function navigateReader(delta: number): void {
  const current = readerStory.value;
  if (!current) return;
  if (delta < 0 && readerHistory.value.length) {
    const previous = readerHistory.value[readerHistory.value.length - 1];
    readerHistory.value = readerHistory.value.slice(0, -1);
    readerForward.value = [...readerForward.value, current];
    void openReader(previous.story, { replace: true });
    return;
  }
  if (delta > 0 && readerForward.value.length) {
    const next = readerForward.value[readerForward.value.length - 1];
    readerForward.value = readerForward.value.slice(0, -1);
    readerHistory.value = [...readerHistory.value, { story: current, scroll: 0 }];
    void openReader(next, { replace: true });
    return;
  }
  const list = readerList.value;
  const index = list.findIndex((story) => story.link === current.link);
  if (index < 0) return;
  const next = list[index + delta];
  if (next) void openReader(next, { replace: true });
}

export interface FlowState {
  open: boolean;
  mode: "read" | "radio" | null;
  stories: Story[];
  index: number;
  radioIndex: number;
}

export const flow = signal<FlowState>({ open: false, mode: null, stories: [], index: 0, radioIndex: 0 });

effect(() => { syncOverlayScroll(); });

export function openReadFlow(stories: Story[], startLink?: string): void {
  if (!stories.length) {
    notify("No stories to flow through");
    return;
  }
  const index = Math.max(0, stories.findIndex((story) => story.link === startLink));
  pushOverlayState("read-flow");
  flow.value = { ...flow.value, open: true, mode: "read", stories, index };
}

export function closeReadFlow(fromPop = false): void {
  if (!fromPop && typeof history !== "undefined" && history.state?.newsDeckOverlay === "read-flow") { history.back(); return; }
  clearOverlayState("read-flow");
  flow.value = { ...flow.value, open: false, mode: null };
}

export function exitReadFlow(): void {
  closeReadFlow();
}

export function openFeedReadFlow(name: string): void {
  const feedStories = stories.value.filter((story) => story.src === name);
  if (!feedStories.length) {
    notify(`No stories from ${name} yet`);
    return;
  }
  openReadFlow(feedStories);
}

if (typeof addEventListener !== "undefined") {
  addEventListener("popstate", () => {
    const kind = history.state?.newsDeckOverlay;
    if (kind === "reader" || (!kind && page.value === "reader")) closeReader(true);
    else if (kind === "read-flow" || (!kind && flow.value.mode === "read")) closeReadFlow(true);
    else if (kind === "radio-flow" || (!kind && flow.value.mode === "radio")) closeRadioFlow(true);
    else if (page.value) closePages();
    else if (sidebarOpen.value) sidebarOpen.value = false;
  });
}

export function moveFlow(delta: number): void {
  const current = flow.value;
  const next = current.index + delta;
  if (next < 0 || next >= current.stories.length) return;
  flow.value = { ...current, index: next };
}

export function openRadioFlow(index: number): void {
  const stations = visibleStations.value;
  if (!stations.length) {
    notify("No radio stations available — restore or unmute one first");
    return;
  }
  const radioIndex = Math.max(0, Math.min(index, stations.length - 1));
  const station = stations[radioIndex];
  if (station && (!radioPlaying.value || activeStationName.value !== station.name)) void playStation(station);
  pushOverlayState("radio-flow");
  flow.value = { open: true, mode: "radio", stories: [], index: 0, radioIndex };
}

export function startRadioFlow(): void {
  const stations = visibleStations.value;
  if (!stations.length) {
    openRadioFlow(0);
    return;
  }
  const active = stations.findIndex((station) => station.name === activeStationName.value);
  openRadioFlow(active >= 0 ? active : 0);
}

export function closeRadioFlow(fromPop = false): void {
  if (!fromPop && typeof history !== "undefined" && history.state?.newsDeckOverlay === "radio-flow") { history.back(); return; }
  clearOverlayState("radio-flow");
  flow.value = { ...flow.value, open: false, mode: null };
}

export function exitRadioFlow(): void {
  closeRadioFlow();
}
