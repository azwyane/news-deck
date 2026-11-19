import { computed, signal } from "@preact/signals";
import type { Page, Story } from "../lib/types";
import { findStory, markRead, stories, visibleStories } from "./store";
import { fetchHNComments } from "../lib/feeds";
import { visibleStations } from "../lib/radio";
import { finishReading, startReading } from "../lib/stats";
import { loadArticle, articleToFragment } from "../lib/article";
import { tts } from "../lib/tts";

export const page = signal<Page>(null);
export const sidebarOpen = signal(false);
export const readerStory = signal<Story | null>(null);
export const readerContent = signal<{ fragment: DocumentFragment; text: string } | null>(null);
export const readerLoading = signal(false);
export const readerError = signal("");
export const readerSummary = signal("");
export const readerSummaryBusy = signal(false);
export const readerConnections = signal<{ text: string; links: Story[] } | null>(null);
export const readerHistory = signal<{ story: Story; scroll: number }[]>([]);
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
  page.value = null;
  sidebarOpen.value = false;
  notesOpen.value = false;
  overflowOpen.value = false;
  if (!readerStory.value) assistantContext.value = null;
}

export async function openReader(input: Story | string, replace = false): Promise<void> {
  const story = typeof input === "string" ? findStory(input) : input;
  if (!story) return;
  const previous = readerStory.value;
  if (previous && previous.link !== story.link && !replace) {
    readerHistory.value = [...readerHistory.value, { story: previous, scroll: 0 }];
  }
  if (previous && previous.link !== story.link) finishReading(previous.src);
  if (tts.playing.value) tts.stop();
  ttsStoryLink.value = story.link;
  readerStory.value = story;
  const cursor = visibleStories.value.findIndex((item) => item.link === story.link);
  if (cursor >= 0) deckCursor.value = cursor;
  markRead(story.link);
  readerContent.value = null;
  readerError.value = "";
  readerLoading.value = true;
  readerSummary.value = "";
  readerConnections.value = null;
  readerComments.value = [];
  readerCommentsLoading.value = !!story.hn;
  if (story.hn) {
    const id = story.hn.match(/id=(\d+)/)?.[1];
    if (id) void fetchHNComments(id).then((comments) => { if (readerStory.value?.link === story.link) readerComments.value = comments; }).catch(() => undefined).finally(() => { if (readerStory.value?.link === story.link) readerCommentsLoading.value = false; });
    else readerCommentsLoading.value = false;
  }
  notesOpen.value = false;
  overflowOpen.value = false;
  if (page.value !== "reader") pushOverlayState("reader");
  page.value = "reader";
  startReading();
  try {
    const result = await loadArticle(story.link, story.hn);
    if (readerStory.value?.link !== story.link) return;
    const fragment = articleToFragment(result);
    if (fragment) {
      const text = (fragment.textContent || "").trim();
      readerContent.value = { fragment, text };
      tts.setContent(Array.from(fragment.querySelectorAll("p")) as HTMLElement[], story.title);
    } else {
      readerError.value = result.error || "Couldn't extract the article content.";
    }
  } catch (error) {
    if (readerStory.value?.link === story.link) readerError.value = String((error as Error).message || error);
  } finally {
    if (readerStory.value?.link === story.link) readerLoading.value = false;
  }
}

export function closeReader(fromPop = false): void {
  if (!fromPop && typeof history !== "undefined" && history.state?.newsDeckOverlay === "reader") { history.back(); return; }
  const previous = readerHistory.value.pop();
  if (previous) {
    readerHistory.value = [...readerHistory.value];
    void openReader(previous.story, true);
    return;
  }
  if (readerStory.value) finishReading(readerStory.value.src);
  clearOverlayState("reader");
  page.value = null;
  readerStory.value = null;
  readerContent.value = null;
}

export const readerList = computed(() => visibleStories.value);

export function navigateReader(delta: number): void {
  const list = readerList.value;
  const current = readerStory.value;
  if (!current) return;
  const index = list.findIndex((story) => story.link === current.link);
  const next = list[index + delta];
  if (next) void openReader(next);
}

export interface FlowState {
  open: boolean;
  mode: "read" | "radio" | null;
  stories: Story[];
  index: number;
  radioIndex: number;
}

export const flow = signal<FlowState>({ open: false, mode: null, stories: [], index: 0, radioIndex: 0 });

export function openReadFlow(stories: Story[], startLink?: string): void {
  if (!stories.length) {
    notify("No stories to flow through");
    return;
  }
  const index = Math.max(0, stories.findIndex((story) => story.link === startLink));
  pushOverlayState("read-flow");
  flow.value = { ...flow.value, open: true, mode: "read", stories, index };
  document.body.style.overflow = "hidden";
}

export function closeReadFlow(fromPop = false): void {
  if (!fromPop && typeof history !== "undefined" && history.state?.newsDeckOverlay === "read-flow") { history.back(); return; }
  clearOverlayState("read-flow");
  flow.value = { ...flow.value, open: false, mode: null };
  document.body.style.overflow = "";
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
  if (!visibleStations.value.length) {
    notify("No radio stations available — restore or unmute one first");
    return;
  }
  pushOverlayState("radio-flow");
  flow.value = { open: true, mode: "radio", stories: [], index: 0, radioIndex: Math.max(0, Math.min(index, visibleStations.value.length - 1)) };
  document.body.style.overflow = "hidden";
}

export function closeRadioFlow(fromPop = false): void {
  if (!fromPop && typeof history !== "undefined" && history.state?.newsDeckOverlay === "radio-flow") { history.back(); return; }
  clearOverlayState("radio-flow");
  flow.value = { ...flow.value, open: false, mode: null };
  document.body.style.overflow = "";
}

export function exitRadioFlow(): void {
  closeRadioFlow();
}
